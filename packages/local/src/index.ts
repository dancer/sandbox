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

import { SandboxError, unsupported } from "@sandbox-sdk/core";
import type {
  Adapter,
  Entry,
  Exec,
  Input,
  Result,
  Sandbox,
} from "@sandbox-sdk/core";

export type Local = Readonly<{
  keep?: boolean;
  root?: string;
}>;

type Raw = Readonly<{
  root: string;
}>;

const safe = (root: string, path: string): string => {
  const target = pathResolve(root, path);
  if (target === root || target.startsWith(`${root}/`)) {
    return target;
  }
  throw new SandboxError("Path escapes sandbox root", {
    code: "path_escape",
    provider: "local",
  });
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

const settle = async (child: ReturnType<typeof spawn>): Promise<Result> => {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

  const [code, signal] = await Promise.race([
    once(child, "close") as Promise<[number | null, NodeJS.Signals | null]>,
    once(child, "error").then(([error]) => {
      throw error;
    }),
  ]);

  const result: Result = {
    code: code ?? 0,
    stderr: Buffer.concat(stderr).toString(),
    stdout: Buffer.concat(stdout).toString(),
  };

  if (signal) {
    return { ...result, signal };
  }

  return result;
};

const execute = (
  root: string,
  command: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => {
  const child = spawn(command, args, {
    cwd: options.cwd ? safe(root, options.cwd) : root,
    env: { ...process.env, ...options.env },
  });
  return settle(child);
};

const bytes = async (input: Input): Promise<Uint8Array | string> => {
  if (typeof input === "string" || input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  const chunks: Uint8Array[] = [];
  const reader = input.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    chunks.push(next.value);
  }
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

export const local = (options: Local = {}): Adapter<Raw> => ({
  capabilities: {
    environment: true,
    files: true,
    ports: false,
    process: true,
    secrets: false,
    snapshots: false,
    streaming: true,
  },
  async create(input = {}) {
    const root = options.root
      ? pathResolve(options.root)
      : await mkdtemp(join(tmpdir(), "sandbox-sdk-"));

    await mkdir(root, { recursive: true });

    const sandbox: Sandbox<Raw> = {
      capabilities: this.capabilities,
      files: {
        list: async (path = ".") => {
          const base = safe(root, path);
          const names = await readdir(base);
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
        read: (path) => readFile(safe(root, path)),
        remove: (path) =>
          rm(safe(root, path), { force: true, recursive: true }),
        text: (path) => readFile(safe(root, path), "utf-8"),
        write: async (path, value) => {
          const target = safe(root, path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, await bytes(value));
        },
      },
      id: input.id ?? randomUUID(),
      ports: {
        expose: () => unsupported("local", "ports"),
      },
      process: {
        exec: (command, args = [], run = {}) =>
          execute(root, command, args, run),
        spawn: (command, args = [], run = {}) => {
          const controller = new AbortController();
          const child = spawn(command, args, {
            cwd: run.cwd ? safe(root, run.cwd) : root,
            env: { ...process.env, ...input.env, ...run.env },
            signal: controller.signal,
          });
          const output = stream(child);
          return Promise.resolve({
            id: randomUUID(),
            kill: () => {
              controller.abort();
              child.kill();
              return Promise.resolve();
            },
            output,
            result: settle(child),
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
