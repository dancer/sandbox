import {
  abort,
  bytes,
  command,
  duration,
  sandboxError,
  port,
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

/** native e2b sandbox object exposed as `sandbox.raw` */
export type E2BRaw = E2BSandbox;

/** e2b adapter configuration */
export type E2B = Readonly<{
  /** e2b access token, usually used for template and account operations */
  accessToken?: string;
  /** allow outbound internet access for the sandbox */
  allowInternetAccess?: boolean;
  /** e2b api key; falls back to E2B_API_KEY */
  apiKey?: string;
  /** custom e2b api url for advanced deployments */
  apiUrl?: string;
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** enable e2b debug connection behavior */
  debug?: boolean;
  /** custom e2b domain used for api and preview hosts */
  domain?: string;
  /** default environment variables applied when creating a sandbox */
  env?: Readonly<Record<string, string>>;
  /** extra headers sent to the e2b api */
  headers?: Readonly<Record<string, string>>;
  /** metadata attached to new sandboxes */
  metadata?: Readonly<Record<string, string>>;
  /** request timeout in milliseconds for e2b api calls */
  requestTimeout?: number;
  /** custom sandbox url for advanced or debug deployments */
  sandboxUrl?: string;
  /** secure sandbox controller traffic when supported by e2b */
  secure?: boolean;
  /** e2b template id, template name, or snapshot id used when create input omits template and snapshot */
  template?: string;
  /** sandbox lifetime timeout in milliseconds */
  timeout?: number;
  /** linux user used for file and command operations */
  user?: string;
}>;

type Raw = E2BRaw;

const provider = "e2b";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "derived",
  process: true,
  processExec: true,
  processSpawn: "combined",
  raw: {
    git: true,
    network: true,
    pty: true,
  },
  snapshotCreate: "disk",
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "combined",
};

const present = (value: string | undefined): boolean =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

const validate = (options: E2B): void => {
  if (
    present(options.apiKey) ||
    present(options.accessToken) ||
    present(env("E2B_API_KEY")) ||
    present(env("E2B_ACCESS_TOKEN"))
  ) {
    return;
  }

  throw sandboxError(
    provider,
    "E2B credentials missing. Set E2B_API_KEY or E2B_ACCESS_TOKEN, or pass apiKey or accessToken to e2b().",
    "configuration"
  );
};

const connection = (options: E2B): SandboxConnectOpts => {
  const request = duration(options.requestTimeout, provider, "requestTimeout");
  return {
    ...(options.accessToken === undefined
      ? {}
      : { accessToken: options.accessToken }),
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.apiUrl === undefined ? {} : { apiUrl: options.apiUrl }),
    ...(options.debug === undefined ? {} : { debug: options.debug }),
    ...(options.domain === undefined ? {} : { domain: options.domain }),
    ...(options.headers === undefined
      ? {}
      : { headers: { ...options.headers } }),
    ...(request === undefined ? {} : { requestTimeoutMs: request }),
    ...(options.sandboxUrl === undefined
      ? {}
      : { sandboxUrl: options.sandboxUrl }),
  };
};

const createOptions = (
  options: E2B,
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): SandboxOpts => {
  const timeout = duration(input.timeout ?? options.timeout, provider);
  return {
    ...connection(options),
    ...(options.allowInternetAccess === undefined
      ? {}
      : { allowInternetAccess: options.allowInternetAccess }),
    envs: { ...options.env, ...input.env },
    metadata: { ...options.metadata, ...input.metadata },
    ...(options.secure === undefined ? {} : { secure: options.secure }),
    ...((input.snapshot ?? input.template ?? options.template)
      ? { template: input.snapshot ?? input.template ?? options.template }
      : {}),
    ...(timeout === undefined ? {} : { timeoutMs: timeout }),
  };
};

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

const rejectUnsupported = (feature: string): Promise<never> => {
  try {
    unsupported(provider, feature);
  } catch (error) {
    return Promise.reject(error);
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
  const timeout = duration(options.timeout, provider);
  try {
    return output(
      await raw.commands.run(line, {
        cwd: options.cwd ?? cwd,
        ...(options.env === undefined ? {} : { envs: { ...options.env } }),
        ...(timeout === undefined ? {} : { timeoutMs: timeout }),
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

const readable = (value: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
    },
  });

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
  const timeout = duration(options.timeout, provider);
  const logs = stream();
  try {
    const handle = await raw.commands.run(line, {
      background: true,
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { envs: { ...options.env } }),
      onStderr: logs.append,
      onStdout: logs.append,
      ...(timeout === undefined ? {} : { timeoutMs: timeout }),
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
    stream: async (path) =>
      readable(
        await raw.files.read(path, {
          format: "bytes",
          ...(user === undefined ? {} : { user }),
        })
      ),
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
    expose: async (value, options) => {
      const target = port(value, provider);
      const host = await Promise.resolve(raw.getHost(target));
      const protocol =
        options?.protocol ?? (host.startsWith("localhost") ? "http" : "https");
      return {
        port: target,
        url: `${protocol}://${host}`,
      };
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
    create: async (name) => {
      const snapshot = await raw.createSnapshot(
        name === undefined ? undefined : { name }
      );
      return name === undefined
        ? { id: snapshot.snapshotId }
        : { id: snapshot.snapshotId, name };
    },
    restore: () => rejectUnsupported("in-place snapshot restore"),
  },
  stop: async () => {
    await raw.kill();
  },
});

/** create an E2B adapter with normalized sandbox operations */
export const e2b = (options: E2B = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
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
