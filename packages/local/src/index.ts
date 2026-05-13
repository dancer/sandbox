import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve as pathResolve } from "node:path";

import { SandboxError, bytes, unsupported } from "@sandbox-sdk/core";
import type { Adapter, Entry, Exec, Result, Sandbox } from "@sandbox-sdk/core";

export type Local = Readonly<{
  keep?: boolean;
  root?: string;
}>;

type Raw = Readonly<{
  root: string;
}>;

const safe = (root: string, path: string): string => {
  const value = path.startsWith("/") ? path.slice(1) : path;
  const target = pathResolve(root, value);
  if (target === root || target.startsWith(`${root}/`)) {
    return target;
  }
  throw new SandboxError("Path escapes sandbox root", {
    code: "path_escape",
    provider: "local",
  });
};

const missing = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";

const wrap = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
  try {
    return await operation();
  } catch (error) {
    if (missing(error)) {
      throw new SandboxError("Path not found", {
        cause: error,
        code: "not_found",
        provider: "local",
      });
    }
    throw error;
  }
};

const stream = (child: ReturnType<typeof spawn>): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      const write = (chunk: Buffer) => {
        controller.enqueue(chunk);
      };
      child.stdout?.on("data", write);
      child.stderr?.on("data", write);
      child.on("close", () => controller.close());
      child.on("error", (error) => controller.error(error));
    },
  });

const settle = async (
  child: ReturnType<typeof spawn>,
  timeout?: number
): Promise<Result> => {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

  let timed = false;
  const timer =
    timeout === undefined
      ? undefined
      : setTimeout(() => {
          timed = true;
          child.kill("SIGTERM");
        }, timeout);

  try {
    const [code, signal] = await Promise.race([
      once(child, "close") as Promise<[number | null, NodeJS.Signals | null]>,
      once(child, "error").then(([error]) => {
        throw error;
      }),
    ]);

    const result: Result = {
      code: code ?? (timed ? 124 : 0),
      ok: code === 0 && !timed,
      stderr: Buffer.concat(stderr).toString(),
      stdout: Buffer.concat(stdout).toString(),
    };

    if (timed) {
      throw new SandboxError("Command timed out", {
        cause: result,
        code: "timeout",
        provider: "local",
      });
    }

    if (signal) {
      return { ...result, signal };
    }

    return result;
  } catch (error) {
    throw new SandboxError(timed ? "Command timed out" : "Command failed", {
      cause: error,
      code: timed ? "timeout" : "process",
      provider: "local",
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const execute = (
  root: string,
  cwd: string,
  env: Readonly<Record<string, string>> | undefined,
  command: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => {
  const child = spawn(command, args, {
    cwd: safe(root, options.cwd ?? cwd),
    env: { ...process.env, ...env, ...options.env },
  });
  return settle(child, options.timeout);
};

export const local = (options: Local = {}): Adapter<Raw> => ({
  capabilities: {
    environment: true,
    files: true,
    ports: "derived",
    process: true,
    secrets: false,
    snapshots: false,
    streaming: "combined",
  },
  async create(input = {}) {
    const root = options.root
      ? pathResolve(options.root)
      : await mkdtemp(join(tmpdir(), "sandbox-sdk-"));

    await mkdir(root, { recursive: true });
    const cwd = input.cwd ?? ".";
    await mkdir(safe(root, cwd), { recursive: true });

    const sandbox: Sandbox<Raw> = {
      capabilities: this.capabilities,
      cwd,
      files: {
        exists: async (path) => {
          try {
            await stat(safe(root, path));
            return true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              return false;
            }
            throw error;
          }
        },
        list: async (path = ".") => {
          const base = safe(root, path);
          const names = await wrap(() => readdir(base));
          const entries = await Promise.all(
            names.map(async (name): Promise<Entry> => {
              const target = join(base, name);
              const info = await stat(target);
              return {
                kind: info.isDirectory() ? "directory" : "file",
                modified: info.mtime,
                path: relative(root, target),
                size: info.size,
              };
            })
          );
          return entries.toSorted((left: Entry, right: Entry) =>
            left.path.localeCompare(right.path)
          );
        },
        mkdir: async (path) => {
          await mkdir(safe(root, path), { recursive: true });
        },
        read: (path) => wrap(() => readFile(safe(root, path))),
        remove: (path) =>
          rm(safe(root, path), { force: true, recursive: true }),
        text: (path) => wrap(() => readFile(safe(root, path), "utf-8")),
        write: async (path, value) => {
          const target = safe(root, path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, await bytes(value));
        },
      },
      id: input.id ?? randomUUID(),
      ports: {
        expose: (port) =>
          Promise.resolve({
            port,
            url: `http://localhost:${port}`,
          }),
      },
      process: {
        exec: (command, args = [], run = {}) =>
          execute(root, cwd, input.env, command, args, run),
        spawn: (command, args = [], run = {}) => {
          const child = spawn(command, args, {
            cwd: safe(root, run.cwd ?? cwd),
            env: { ...process.env, ...input.env, ...run.env },
          });
          const output = stream(child);
          return Promise.resolve({
            id: randomUUID(),
            kill: (signal = "SIGTERM") => {
              child.kill(signal as NodeJS.Signals);
              return Promise.resolve();
            },
            output,
            result: settle(child, run.timeout),
          });
        },
      },
      provider: "local",
      raw: { root },
      snapshots: {
        create: () => unsupported("local", "snapshots"),
        restore: () => unsupported("local", "snapshots"),
      },
      stop: async () => {
        if (!options.keep && !options.root) {
          await rm(root, { force: true, recursive: true });
        }
      },
    };

    return sandbox;
  },
  provider: "local",
});
