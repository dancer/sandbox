import {
  abort,
  bytes,
  command,
  error as sandboxError,
  result,
  unsupported,
} from "@sandbox-sdk/core";
import type {
  Adapter,
  Capabilities,
  Entry,
  Exec,
  Input,
  Result,
  Running,
  Sandbox,
} from "@sandbox-sdk/core";
import { CommandExitError, FileType, Sandbox as E2BSandbox } from "e2b";
import type { CommandHandle, SandboxConnectOpts, SandboxOpts } from "e2b";

export type E2B = Readonly<{
  accessToken?: string;
  allowInternetAccess?: boolean;
  apiKey?: string;
  apiUrl?: string;
  cwd?: string;
  debug?: boolean;
  domain?: string;
  env?: Readonly<Record<string, string>>;
  headers?: Readonly<Record<string, string>>;
  metadata?: Readonly<Record<string, string>>;
  requestTimeout?: number;
  sandboxUrl?: string;
  secure?: boolean;
  template?: string;
  timeout?: number;
  user?: string;
}>;

type Raw = E2BSandbox;

const provider = "e2b";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  git: true,
  network: true,
  ports: "derived",
  process: true,
  pty: true,
  snapshots: "disk",
  streaming: "combined",
};

const connection = (options: E2B): SandboxConnectOpts => ({
  ...(options.accessToken === undefined
    ? {}
    : { accessToken: options.accessToken }),
  ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
  ...(options.apiUrl === undefined ? {} : { apiUrl: options.apiUrl }),
  ...(options.debug === undefined ? {} : { debug: options.debug }),
  ...(options.domain === undefined ? {} : { domain: options.domain }),
  ...(options.headers === undefined ? {} : { headers: { ...options.headers } }),
  ...(options.requestTimeout === undefined
    ? {}
    : { requestTimeoutMs: options.requestTimeout }),
  ...(options.sandboxUrl === undefined
    ? {}
    : { sandboxUrl: options.sandboxUrl }),
});

const createOptions = (
  options: E2B,
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): SandboxOpts => ({
  ...connection(options),
  ...(options.allowInternetAccess === undefined
    ? {}
    : { allowInternetAccess: options.allowInternetAccess }),
  envs: { ...options.env, ...input.env },
  metadata: { ...options.metadata, ...input.metadata },
  ...(options.secure === undefined ? {} : { secure: options.secure }),
  ...((input.template ?? options.template)
    ? { template: input.template ?? options.template }
    : {}),
  ...((input.timeout ?? options.timeout)
    ? { timeoutMs: input.timeout ?? options.timeout }
    : {}),
});

const output = (value: {
  exitCode: number;
  stderr: string;
  stdout: string;
}): Result => result(value.exitCode, value.stdout, value.stderr);

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort(provider, signal.reason);
  }
};

const executeLine = async (
  raw: Raw,
  cwd: string,
  user: string | undefined,
  line: string,
  options: Exec
): Promise<Result> => {
  check(options.signal);
  try {
    return output(
      await raw.commands.run(line, {
        cwd: options.cwd ?? cwd,
        ...(options.env === undefined ? {} : { envs: { ...options.env } }),
        ...(options.timeout === undefined
          ? {}
          : { timeoutMs: options.timeout }),
        ...(user === undefined ? {} : { user }),
      })
    );
  } catch (error) {
    if (error instanceof CommandExitError) {
      return output(error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const execute = (
  raw: Raw,
  cwd: string,
  user: string | undefined,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Result> =>
  executeLine(raw, cwd, user, command(executable, args), options);

const stream = (): {
  append(chunk: string): void;
  close(): void;
  output: ReadableStream<Uint8Array>;
} => {
  const encoder = new TextEncoder();
  let close: (() => void) | undefined;
  let send: ((chunk: Uint8Array) => void) | undefined;
  return {
    append(chunk) {
      send?.(encoder.encode(chunk));
    },
    close() {
      close?.();
    },
    output: new ReadableStream({
      start(controller) {
        close = () => controller.close();
        send = (chunk) => controller.enqueue(chunk);
      },
    }),
  };
};

const wait = async (handle: CommandHandle): Promise<Result> => {
  try {
    return output(await handle.wait());
  } catch (error) {
    if (error instanceof CommandExitError) {
      return output(error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const spawnLine = async (
  raw: Raw,
  cwd: string,
  user: string | undefined,
  line: string,
  options: Exec
): Promise<Running> => {
  check(options.signal);
  const logs = stream();
  try {
    const handle = await raw.commands.run(line, {
      background: true,
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { envs: { ...options.env } }),
      onStderr: logs.append,
      onStdout: logs.append,
      ...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
      ...(user === undefined ? {} : { user }),
    });
    return {
      id: handle.pid.toString(),
      kill: async () => {
        await handle.kill();
      },
      output: logs.output,
      result: (async () => {
        try {
          return await wait(handle);
        } finally {
          logs.close();
        }
      })(),
    };
  } catch (error) {
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const spawn = (
  raw: Raw,
  cwd: string,
  user: string | undefined,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Running> =>
  spawnLine(raw, cwd, user, command(executable, args), options);

const content = async (input: Input): Promise<ArrayBuffer | string> => {
  const value = await bytes(input);
  if (typeof value === "string") {
    return value;
  }
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
};

const createSandbox = (
  raw: Raw,
  cwd: string,
  user: string | undefined
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: (path) => raw.files.exists(path),
    list: async (path = cwd) => {
      const entries = await raw.files.list(path);
      return entries
        .map((entry): Entry => {
          const item: Entry = {
            kind: entry.type === FileType.DIR ? "directory" : "file",
            path: entry.path,
            size: entry.size,
          };
          return entry.modifiedTime === undefined
            ? item
            : { ...item, modified: entry.modifiedTime };
        })
        .toSorted((left, right) => left.path.localeCompare(right.path));
    },
    mkdir: async (path) => {
      await raw.files.makeDir(path, user === undefined ? {} : { user });
    },
    read: (path) =>
      raw.files.read(path, {
        format: "bytes",
        ...(user === undefined ? {} : { user }),
      }),
    remove: async (path) => {
      await raw.files.remove(path, user === undefined ? {} : { user });
    },
    text: (path) =>
      raw.files.read(path, {
        format: "text",
        ...(user === undefined ? {} : { user }),
      }),
    write: async (path, input) => {
      await raw.files.write(
        path,
        await content(input),
        user === undefined ? {} : { user }
      );
    },
  },
  id: raw.sandboxId,
  ports: {
    expose: (port, options) => {
      const host = raw.getHost(port);
      const protocol =
        options?.protocol ?? (host.startsWith("localhost") ? "http" : "https");
      return Promise.resolve({
        port,
        url: `${protocol}://${host}`,
      });
    },
  },
  process: {
    exec: (executable, args = [], options = {}) =>
      execute(raw, cwd, user, executable, args, options),
    shell: (script, options = {}) =>
      executeLine(raw, cwd, user, script, options),
    spawn: (executable, args = [], options = {}) =>
      spawn(raw, cwd, user, executable, args, options),
    spawnShell: (script, options = {}) =>
      spawnLine(raw, cwd, user, script, options),
  },
  provider,
  raw,
  snapshots: {
    create: async () => {
      const snapshot = await raw.createSnapshot();
      return { id: snapshot.snapshotId };
    },
    restore: () => unsupported(provider, "in-place snapshot restore"),
  },
  stop: async () => {
    await raw.kill();
  },
});

export const e2b = (options: E2B = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    const cwd = input.cwd ?? options.cwd ?? "/home/user";
    const raw =
      input.id === undefined
        ? await E2BSandbox.create(createOptions(options, input))
        : await E2BSandbox.connect(input.id, connection(options));

    if (input.id === undefined) {
      await raw.files.makeDir(cwd, options.user ? { user: options.user } : {});
    }

    return createSandbox(raw, cwd, options.user);
  },
  provider,
});
