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
import type {
  CommandHandle,
  McpServer,
  SandboxConnectOpts,
  SandboxLifecycle,
  SandboxNetworkOpts,
  SandboxOpts,
  Volume,
} from "e2b";

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
  /** e2b lifecycle behavior such as pause or kill when timeout is reached */
  lifecycle?: SandboxLifecycle;
  /** metadata attached to new sandboxes */
  metadata?: Readonly<Record<string, string>>;
  /** e2b mcp gateway configuration enabled for new sandboxes */
  mcp?: McpServer;
  /** e2b network policy for outbound traffic and public preview access */
  network?: SandboxNetworkOpts;
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
  /** e2b volume mounts keyed by sandbox mount path */
  volumeMounts?: Readonly<Record<string, Volume | string>>;
}>;

type Raw = E2BRaw;

const provider = "e2b";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "derived",
  process: true,
  processExec: true,
  processSpawn: "separate",
  raw: {
    git: true,
    lifecycle: "dynamic",
    mcp: "create-time",
    metrics: true,
    network: "create-time",
    pty: true,
    volumes: "create-time",
    watching: true,
  },
  snapshotCreate: "disk",
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "separate",
};

const present = (value: string | undefined): boolean =>
  value !== undefined && value.length > 0;

const first = (
  ...values: readonly (string | undefined)[]
): string | undefined => values.find(present);

const env = (name: string): string | undefined =>
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.[name];

const validate = (options: E2B): void => {
  if (
    first(options.apiKey, env("E2B_API_KEY")) !== undefined ||
    first(options.accessToken, env("E2B_ACCESS_TOKEN")) !== undefined
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
  const accessToken = first(options.accessToken, env("E2B_ACCESS_TOKEN"));
  const apiKey = first(options.apiKey, env("E2B_API_KEY"));
  return {
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(present(options.apiUrl) ? { apiUrl: options.apiUrl } : {}),
    ...(options.debug === undefined ? {} : { debug: options.debug }),
    ...(present(options.domain) ? { domain: options.domain } : {}),
    ...(options.headers === undefined
      ? {}
      : { headers: { ...options.headers } }),
    ...(request === undefined ? {} : { requestTimeoutMs: request }),
    ...(present(options.sandboxUrl) ? { sandboxUrl: options.sandboxUrl } : {}),
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
    ...(options.lifecycle === undefined
      ? {}
      : { lifecycle: options.lifecycle }),
    ...(options.mcp === undefined ? {} : { mcp: options.mcp }),
    metadata: { ...options.metadata, ...input.metadata },
    ...(options.network === undefined ? {} : { network: options.network }),
    ...(options.secure === undefined ? {} : { secure: options.secure }),
    ...((input.snapshot ?? input.template ?? options.template)
      ? { template: input.snapshot ?? input.template ?? options.template }
      : {}),
    ...(timeout === undefined ? {} : { timeoutMs: timeout }),
    ...(options.volumeMounts === undefined
      ? {}
      : { volumeMounts: { ...options.volumeMounts } }),
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

const wrap = async <Value>(
  action: () => Promise<Value> | Value,
  feature: string
): Promise<Value> => {
  try {
    return await action();
  } catch (error) {
    throw sandboxError(provider, `${feature} failed`, "provider", error);
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

type Channel = "output" | "stderr" | "stdout";

type Chunk = Readonly<{
  channel: Exclude<Channel, "output">;
  value: Uint8Array;
}>;

const include = (channel: Channel, chunk: Chunk): boolean =>
  channel === "output" || channel === chunk.channel;

const streams = (): Readonly<{
  append(channel: Exclude<Channel, "output">, chunk: string): void;
  close(): void;
  output: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
}> => {
  const encoder = new TextEncoder();
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

  const create = (channel: Channel): ReadableStream<Uint8Array> => {
    let active: ReadableStreamDefaultController<Uint8Array> | undefined;
    return new ReadableStream({
      cancel() {
        if (active !== undefined) {
          controllers[channel].delete(active);
        }
      },
      start(controller) {
        active = controller;
        for (const chunk of chunks) {
          if (include(channel, chunk)) {
            controller.enqueue(chunk.value);
          }
        }
        if (closed) {
          controller.close();
          return;
        }
        controllers[channel].add(controller);
      },
    });
  };

  return {
    append(channel, chunk) {
      if (closed) {
        return;
      }
      const value = encoder.encode(chunk);
      chunks.push({ channel, value });
      for (const stream of ["output", channel] as const) {
        for (const controller of controllers[stream]) {
          controller.enqueue(value);
        }
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const group of Object.values(controllers)) {
        for (const controller of group) {
          controller.close();
        }
        group.clear();
      }
    },
    output: create("output"),
    stderr: create("stderr"),
    stdout: create("stdout"),
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
  const timeout = duration(options.timeout, provider);
  const logs = streams();
  try {
    const handle = await raw.commands.run(line, {
      background: true,
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { envs: { ...options.env } }),
      onStderr: (chunk) => logs.append("stderr", chunk),
      onStdout: (chunk) => logs.append("stdout", chunk),
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
      stderr: logs.stderr,
      stdout: logs.stdout,
    };
  } catch (error) {
    logs.close();
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

const buffer = (input: Uint8Array): ArrayBuffer => {
  const value = new ArrayBuffer(input.byteLength);
  new Uint8Array(value).set(input);
  return value;
};

const content = async (
  input: Input
): Promise<ArrayBuffer | Blob | ReadableStream<Uint8Array> | string> => {
  if (
    typeof input === "string" ||
    input instanceof ArrayBuffer ||
    input instanceof Blob ||
    input instanceof ReadableStream
  ) {
    return input;
  }

  const value = await bytes(input);
  return typeof value === "string" ? value : buffer(value);
};

const createSandbox = (
  raw: Raw,
  cwd: string,
  user: string | undefined
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: (path) => wrap(() => raw.files.exists(path), "exists"),
    list: async (path = cwd) => {
      const entries = await wrap(() => raw.files.list(path), "list");
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
      await wrap(
        () => raw.files.makeDir(path, user === undefined ? {} : { user }),
        "mkdir"
      );
    },
    read: (path) =>
      wrap(
        () =>
          raw.files.read(path, {
            format: "bytes",
            ...(user === undefined ? {} : { user }),
          }),
        "read"
      ),
    remove: async (path) => {
      await wrap(
        () => raw.files.remove(path, user === undefined ? {} : { user }),
        "remove"
      );
    },
    stream: (path) =>
      wrap(
        () =>
          raw.files.read(path, {
            format: "stream",
            ...(user === undefined ? {} : { user }),
          }),
        "stream"
      ),
    text: (path) =>
      wrap(
        () =>
          raw.files.read(path, {
            format: "text",
            ...(user === undefined ? {} : { user }),
          }),
        "text"
      ),
    write: async (path, input) => {
      await wrap(
        async () =>
          raw.files.write(
            path,
            await content(input),
            user === undefined ? {} : { user }
          ),
        "write"
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
      const snapshot = await wrap(
        () => raw.createSnapshot(name === undefined ? undefined : { name }),
        "snapshot"
      );
      return name === undefined
        ? { id: snapshot.snapshotId }
        : { id: snapshot.snapshotId, name };
    },
    restore: () => rejectUnsupported("in-place snapshot restore"),
  },
  stop: async () => {
    await wrap(() => raw.kill(), "stop");
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
      await wrap(
        () =>
          raw.files.makeDir(cwd, options.user ? { user: options.user } : {}),
        "mkdir"
      );
    }

    return createSandbox(raw, cwd, options.user);
  },
  provider,
});
