import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve as pathResolve,
  sep,
} from "node:path";
import { Readable } from "node:stream";

import {
  SandboxError,
  abort,
  bytes,
  duration,
  fromSandboxRuntime,
  port,
  portOptions,
  sandboxPath,
} from "@sandbox-sdk/core";
import type {
  Adapter,
  Entry,
  Exec,
  Result,
  SandboxRuntime,
  Snapshot,
} from "@sandbox-sdk/core";

/**
 * configuration for the local adapter
 *
 * local runs commands on the host in an owned directory and is not an isolation
 * boundary for untrusted code
 */
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
   * existing symlinks must resolve inside this root
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

const contained = (root: string, target: string): boolean => {
  const value = relative(root, target);
  return (
    value.length === 0 ||
    (!isAbsolute(value) && value !== ".." && !value.startsWith(`..${sep}`))
  );
};

const safe = (root: string, path: string): string => {
  const value = path.startsWith("/") ? path.slice(1) : path;
  const target = pathResolve(root, value);
  if (contained(root, target)) {
    return target;
  }
  throw new SandboxError("Path escapes sandbox root", {
    code: "path_escape",
    provider: "local",
  });
};

const inside = (root: string, cwd: string, path?: string): string =>
  safe(root, sandboxPath(cwd, path));

const display = (root: string, target: string): string =>
  `/${relative(root, target).split(sep).join("/")}`;

const missing = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";

const escaped = (): never => {
  throw new SandboxError("Path resolves outside sandbox root", {
    code: "path_escape",
    provider: "local",
  });
};

const ancestor = async (root: string, target: string): Promise<void> => {
  let current = target;
  while (true) {
    try {
      if (!contained(root, await realpath(current))) {
        escaped();
      }
      return;
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
};

const guard = async (root: string, target: string): Promise<void> => {
  let current = root;
  for (const part of relative(root, target).split(sep)) {
    if (part.length === 0) {
      continue;
    }
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (!info.isSymbolicLink()) {
        continue;
      }
      const linked = pathResolve(dirname(current), await readlink(current));
      await ancestor(root, linked);
      try {
        current = await realpath(linked);
      } catch (error) {
        if (!missing(error)) {
          throw error;
        }
        current = linked;
      }
      if (!contained(root, current)) {
        escaped();
      }
    } catch (error) {
      if (missing(error)) {
        return;
      }
      throw error;
    }
  }
};

const locate = async (
  root: string,
  cwd: string,
  path?: string
): Promise<string> => {
  const target = inside(root, cwd, path);
  await guard(root, target);
  return target;
};

const readable = (value: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
    },
  });

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

const fileStream = async (
  root: string,
  cwd: string,
  path: string
): Promise<ReadableStream<Uint8Array>> => {
  const target = await locate(root, cwd, path);
  await wrap(() => stat(target));
  return Readable.toWeb(
    createReadStream(target)
  ) as unknown as ReadableStream<Uint8Array>;
};

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort("local", signal.reason);
  }
};

const execution = (options: Exec): Exec => {
  const value = duration(options.timeout, "local");
  return value === undefined ? options : { ...options, timeout: value };
};

type Channel = "output" | "stderr" | "stdout";

type Chunk = Readonly<{
  channel: Exclude<Channel, "output">;
  value: Uint8Array;
}>;

const matches = (stream: Channel, chunk: Chunk): boolean =>
  stream === "output" || stream === chunk.channel;

const streams = (
  child: ReturnType<typeof spawn>
): Readonly<Record<Channel, ReadableStream<Uint8Array>>> => {
  const chunks: Chunk[] = [];
  const controllers: Record<
    Channel,
    Set<ReadableStreamDefaultController<Uint8Array>>
  > = {
    output: new Set(),
    stderr: new Set(),
    stdout: new Set(),
  };
  let closed = false;
  let failed: unknown;

  const create = (stream: Channel): ReadableStream<Uint8Array> => {
    let active: ReadableStreamDefaultController<Uint8Array> | undefined;
    return new ReadableStream({
      cancel() {
        if (active !== undefined) {
          controllers[stream].delete(active);
        }
      },
      start(controller) {
        active = controller;
        for (const chunk of chunks) {
          if (matches(stream, chunk)) {
            controller.enqueue(chunk.value);
          }
        }
        if (failed !== undefined) {
          controller.error(failed);
          return;
        }
        if (closed) {
          controller.close();
          return;
        }
        controllers[stream].add(controller);
      },
    });
  };

  const enqueue = (channel: Exclude<Channel, "output">, chunk: Buffer) => {
    const value = new Uint8Array(chunk);
    chunks.push({ channel, value });
    for (const stream of ["output", channel] as const) {
      for (const controller of controllers[stream]) {
        controller.enqueue(value);
      }
    }
  };

  const close = () => {
    closed = true;
    for (const group of Object.values(controllers)) {
      for (const controller of group) {
        controller.close();
      }
      group.clear();
    }
  };

  const error = (value: unknown) => {
    failed = value;
    for (const group of Object.values(controllers)) {
      for (const controller of group) {
        controller.error(value);
      }
      group.clear();
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => enqueue("stdout", chunk));
  child.stderr?.on("data", (chunk: Buffer) => enqueue("stderr", chunk));
  child.on("close", close);
  child.on("error", error);

  return {
    output: create("output"),
    stderr: create("stderr"),
    stdout: create("stdout"),
  };
};

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

const start = async (
  root: string,
  cwd: string,
  env: Readonly<Record<string, string>>,
  command: string,
  args: readonly string[],
  options: Exec
): Promise<Readonly<{ child: ReturnType<typeof spawn>; run: Exec }>> => {
  const run = execution(options);
  check(run.signal);
  return {
    child: spawn(command, args, {
      cwd: await locate(root, cwd, run.cwd),
      env: { ...env, ...run.env },
    }),
    run,
  };
};

/**
 * create a local adapter that runs in an owned host directory
 *
 * local is not an isolation boundary for untrusted code. preview URLs always use the local HTTP host for the requested port
 */
export const local = (options: Local = {}): Adapter<Raw> => ({
  capabilities: {
    environment: true,
    fileStreaming: "native",
    files: true,
    ports: "derived",
    process: true,
    processExec: true,
    processSpawn: "separate",
    snapshotCreate: "filesystem",
    snapshotDelete: true,
    snapshotRestore: "filesystem",
    snapshots: "filesystem",
    streaming: "separate",
  },
  async create(input = {}) {
    const location = options.root
      ? mount(options.root)
      : await mkdtemp(join(tmpdir(), "sandbox-sdk-"));
    await mkdir(location, { recursive: true });
    const root = mount(await realpath(location));
    const snapshots = new Map<string, State>();
    const snapshotsRoot = await mkdtemp(join(tmpdir(), "sandbox-sdk-snap-"));
    const cwd = input.cwd ?? "/workspace";
    const env = { ...hostEnv(options.inheritEnv), ...input.env };
    await mkdir(safe(root, cwd), { recursive: true });

    const sandbox: SandboxRuntime<Raw> = {
      capabilities: this.capabilities,
      cwd,
      files: {
        exists: async (path) => {
          try {
            await stat(await locate(root, cwd, path));
            return true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              return false;
            }
            throw error;
          }
        },
        list: async (path = cwd) => {
          const base = await locate(root, cwd, path);
          const names = await wrap(() => readdir(base));
          const entries = await Promise.all(
            names.map(async (name): Promise<Entry> => {
              const target = join(base, name);
              await guard(root, target);
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
          await mkdir(await locate(root, cwd, path), { recursive: true });
        },
        read: async (path) => {
          const target = await locate(root, cwd, path);
          return readable(await wrap(() => readFile(target)));
        },
        remove: async (path) => {
          await rm(await locate(root, cwd, path), {
            force: true,
            recursive: true,
          });
        },
        write: async (path, value) => {
          const target = await locate(root, cwd, path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, await bytes(value));
        },
      },
      id: input.id ?? randomUUID(),
      ports: {
        expose: async (value, preview) => {
          const target = await Promise.resolve(port(value, "local"));
          portOptions("local", preview, "http");
          return {
            port: target,
            url: `http://localhost:${target}`,
          };
        },
      },
      process: {
        spawn: async (command, args = [], run = {}) => {
          const ready = await start(root, cwd, env, command, args, run);
          const { child } = ready;
          const output = streams(child);
          return {
            id: randomUUID(),
            kill: (signal = "SIGTERM") => {
              child.kill(signal as NodeJS.Signals);
              return Promise.resolve();
            },
            ...output,
            result: settle(child, ready.run),
          };
        },
        spawnShell: async (command, run = {}) => {
          const ready = await start(
            root,
            cwd,
            env,
            "sh",
            ["-lc", command],
            run
          );
          const { child } = ready;
          const output = streams(child);
          return {
            id: randomUUID(),
            kill: (signal = "SIGTERM") => {
              child.kill(signal as NodeJS.Signals);
              return Promise.resolve();
            },
            ...output,
            result: settle(child, ready.run),
          };
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
        delete: async (id) => {
          const snapshot = snapshots.get(id);
          if (snapshot === undefined) {
            throw new SandboxError("Snapshot not found", {
              code: "not_found",
              provider: "local",
            });
          }
          snapshots.delete(id);
          await rm(snapshot.path, { force: true, recursive: true });
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

    const current = fromSandboxRuntime(sandbox);
    return {
      ...current,
      files: {
        ...current.files,
        stream: (path) => fileStream(root, cwd, path),
      },
    };
  },
  provider: "local",
});
