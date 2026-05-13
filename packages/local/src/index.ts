import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  dirname,
  join,
  parse,
  relative,
  resolve as pathResolve,
} from "node:path";

import { SandboxError, abort, bytes } from "@sandbox-sdk/core";
import type {
  Adapter,
  Entry,
  Exec,
  Result,
  Sandbox,
  Snapshot,
} from "@sandbox-sdk/core";

export type Local = Readonly<{
  /**
   * host environment inheritance policy for local commands
   *
   * `true` passes all host environment variables, `false` passes none, and an
   * array passes only the named variables
   *
   * @default ["HOME", "PATH", "SHELL", "TEMP", "TMP", "TMPDIR"]
   */
  inheritEnv?: boolean | readonly string[];
  /**
   * keep temporary local sandbox files after `stop`
   *
   * custom roots are always left on disk because they are owned by the caller
   *
   * @default false
   */
  keep?: boolean;
  /**
   * host directory used as the sandbox root
   *
   * when omitted, the adapter creates a temporary directory
   */
  root?: string;
}>;

type Raw = Readonly<{
  root: string;
}>;

interface State {
  name?: string;
  path: string;
}

const defaultEnv = ["HOME", "PATH", "SHELL", "TEMP", "TMP", "TMPDIR"] as const;

const pickEnv = (names: readonly string[]): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) {
      output[name] = value;
    }
  }
  return output;
};

const allEnv = (): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      output[name] = value;
    }
  }
  return output;
};

const hostEnv = (policy: Local["inheritEnv"]): Record<string, string> => {
  if (policy === true) {
    return allEnv();
  }
  if (policy === false) {
    return {};
  }
  return pickEnv(policy ?? defaultEnv);
};

const mount = (path: string): string => {
  const target = pathResolve(path);
  if (target === parse(target).root) {
    throw new SandboxError("Sandbox root cannot be filesystem root", {
      code: "path_escape",
      provider: "local",
    });
  }
  return target;
};

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

const display = (root: string, target: string): string =>
  `/${relative(root, target)}`;

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

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort("local", signal.reason);
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
  options: Exec
): Promise<Result> => {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

  let aborted = false;
  let timed = false;
  const timer =
    options.timeout === undefined
      ? undefined
      : setTimeout(() => {
          timed = true;
          child.kill("SIGTERM");
        }, options.timeout);
  const cancel = () => {
    aborted = true;
    child.kill("SIGTERM");
  };

  if (options.signal?.aborted) {
    cancel();
  } else {
    options.signal?.addEventListener("abort", cancel, { once: true });
  }

  try {
    const [code, signal] = await Promise.race([
      once(child, "close") as Promise<[number | null, NodeJS.Signals | null]>,
      once(child, "error").then(([error]) => {
        throw error;
      }),
    ]);

    const result: Result = {
      code: code ?? (timed ? 124 : 130),
      ok: code === 0 && !(aborted || timed),
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

    if (aborted) {
      throw new SandboxError("Operation aborted", {
        cause: result,
        code: "aborted",
        provider: "local",
      });
    }

    if (signal) {
      return { ...result, signal };
    }

    return result;
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw new SandboxError(timed ? "Command timed out" : "Command failed", {
      cause: error,
      code: timed ? "timeout" : "process",
      provider: "local",
    });
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const execute = (
  root: string,
  cwd: string,
  env: Readonly<Record<string, string>>,
  command: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => {
  check(options.signal);
  const child = spawn(command, args, {
    cwd: safe(root, options.cwd ?? cwd),
    env: { ...env, ...options.env },
  });
  return settle(child, options);
};

const start = (
  root: string,
  cwd: string,
  env: Readonly<Record<string, string>>,
  command: string,
  args: readonly string[],
  options: Exec
) => {
  check(options.signal);
  return spawn(command, args, {
    cwd: safe(root, options.cwd ?? cwd),
    env: { ...env, ...options.env },
  });
};

/** create a local adapter that runs against an isolated host directory */
export const local = (options: Local = {}): Adapter<Raw> => ({
  capabilities: {
    environment: true,
    files: true,
    ports: "derived",
    process: true,
    processExec: true,
    processSpawn: "combined",
    secrets: false,
    snapshotCreate: "filesystem",
    snapshotRestore: "filesystem",
    snapshots: "filesystem",
    streaming: "combined",
  },
  async create(input = {}) {
    const root = options.root
      ? mount(options.root)
      : await mkdtemp(join(tmpdir(), "sandbox-sdk-"));
    const snapshots = new Map<string, State>();
    const snapshotsRoot = await mkdtemp(join(tmpdir(), "sandbox-sdk-snap-"));

    await mkdir(root, { recursive: true });
    const cwd = input.cwd ?? "/workspace";
    const env = { ...hostEnv(options.inheritEnv), ...input.env };
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
        list: async (path = cwd) => {
          const base = safe(root, path);
          const names = await wrap(() => readdir(base));
          const entries = await Promise.all(
            names.map(async (name): Promise<Entry> => {
              const target = join(base, name);
              const info = await stat(target);
              return {
                kind: info.isDirectory() ? "directory" : "file",
                modified: info.mtime,
                path: display(root, target),
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
          execute(root, cwd, env, command, args, run),
        shell: (command, run = {}) =>
          execute(root, cwd, env, "sh", ["-lc", command], run),
        spawn: (command, args = [], run = {}) => {
          const child = start(root, cwd, env, command, args, run);
          const output = stream(child);
          return Promise.resolve({
            id: randomUUID(),
            kill: (signal = "SIGTERM") => {
              child.kill(signal as NodeJS.Signals);
              return Promise.resolve();
            },
            output,
            result: settle(child, run),
          });
        },
        spawnShell: (command, run = {}) => {
          const child = start(root, cwd, env, "sh", ["-lc", command], run);
          const output = stream(child);
          return Promise.resolve({
            id: randomUUID(),
            kill: (signal = "SIGTERM") => {
              child.kill(signal as NodeJS.Signals);
              return Promise.resolve();
            },
            output,
            result: settle(child, run),
          });
        },
      },
      provider: "local",
      raw: { root },
      snapshots: {
        create: async (name): Promise<Snapshot> => {
          const id = randomUUID();
          const target = join(snapshotsRoot, id);
          await cp(root, target, { force: true, recursive: true });
          snapshots.set(
            id,
            name === undefined ? { path: target } : { name, path: target }
          );
          return name === undefined ? { id } : { id, name };
        },
        restore: async (id) => {
          const snapshot = snapshots.get(id);
          if (snapshot === undefined) {
            throw new SandboxError("Snapshot not found", {
              code: "not_found",
              provider: "local",
            });
          }
          await rm(root, { force: true, recursive: true });
          await mkdir(root, { recursive: true });
          await cp(snapshot.path, root, { force: true, recursive: true });
        },
      },
      stop: async () => {
        if (!options.keep && !options.root) {
          await rm(root, { force: true, recursive: true });
        }
        await rm(snapshotsRoot, { force: true, recursive: true });
      },
    };

    return sandbox;
  },
  provider: "local",
});
