import type {
  ListFilesOptions,
  Sandbox as CloudflareSandbox,
  SandboxOptions,
} from "@cloudflare/sandbox";
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

export type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";

type Native = CloudflareSandbox<unknown>;

/** structural Durable Object namespace binding accepted by the adapter */
export type CloudflareBinding = Readonly<{
  /** return a Durable Object stub for a resolved id */
  get(id: unknown): unknown;
  /** resolve a Durable Object id from a stable sandbox name */
  idFromName(name: string): unknown;
}>;

/** Cloudflare Sandbox adapter configuration */
export type Cloudflare = Readonly<{
  /** Durable Object binding for the Cloudflare Sandbox class, usually `env.Sandbox` */
  binding: CloudflareBinding;
  /**
   * default working directory for normalized file and process operations
   *
   * @default "/workspace"
   */
  cwd?: string;
  /** default environment variables written to the sandbox when it is created */
  env?: Readonly<Record<string, string>>;
  /** custom domain used for preview URLs, required for `ports.expose` */
  hostname?: string;
  /** stable sandbox id used when create input omits id */
  id?: string;
  /** list options forwarded to Cloudflare `listFiles` */
  list?: ListFilesOptions;
  /** friendly preview name forwarded to Cloudflare `exposePort` */
  name?: string;
  /** low-level Cloudflare Sandbox options forwarded to `getSandbox` */
  options?: SandboxOptions;
}>;

const provider = "cloudflare";

const capabilities: Capabilities = {
  desktop: true,
  environment: true,
  files: true,
  git: true,
  network: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: "separate",
  snapshotCreate: false,
  snapshotRestore: false,
  snapshots: false,
  streaming: "separate",
  volumes: "volume",
};

const validate = (options: Cloudflare): void => {
  if (options.binding !== undefined) {
    return;
  }

  throw sandboxError(
    provider,
    "Cloudflare binding missing. Pass the Durable Object binding from env.Sandbox to cloudflare().",
    "configuration"
  );
};

const binary = (content: string): Uint8Array =>
  Uint8Array.from(atob(content), (char) => char.codePointAt(0) ?? 0);

const stream = (content: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(content);
      controller.close();
    },
  });

const readable = (input: Input): input is ReadableStream<Uint8Array> =>
  typeof input === "object" &&
  input !== null &&
  "getReader" in input &&
  typeof input.getReader === "function";

const write = async (
  raw: Native,
  path: string,
  input: Input
): Promise<void> => {
  if (readable(input)) {
    await raw.writeFile(path, input);
    return;
  }

  const value = await bytes(input);
  if (typeof value === "string") {
    await raw.writeFile(path, value, { encoding: "utf-8" });
    return;
  }
  await raw.writeFile(path, stream(value));
};

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

const validatePort = (value: number): number => {
  const target = port(value, provider);
  if (target >= 1024 && target !== 3000) {
    return target;
  }

  throw sandboxError(
    provider,
    "Cloudflare preview ports must be integers from 1024 to 65535, excluding 3000",
    target === 3000 ? "unsupported" : "configuration"
  );
};

const validateHostname = (value: string): void => {
  if (!value.endsWith(".workers.dev")) {
    return;
  }

  throw sandboxError(
    provider,
    "Cloudflare preview URLs require a custom domain because workers.dev does not support wildcard subdomains",
    "unsupported"
  );
};

const executeLine = async (
  raw: Native,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  check(options.signal);
  const timeout = duration(options.timeout, provider);
  try {
    const output = await raw.exec(line, {
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(timeout === undefined ? {} : { timeout }),
    });
    return result(output.exitCode, output.stdout, output.stderr);
  } catch (error) {
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const execute = (
  raw: Native,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => executeLine(raw, cwd, command(executable, args), options);

const wait = async (
  raw: Native,
  process: Awaited<ReturnType<Native["startProcess"]>>
): Promise<Result> => {
  const output = await process.waitForExit();
  const logs = await raw.getProcessLogs(process.id);
  return result(output.exitCode, logs.stdout, logs.stderr);
};

const spawnLine = async (
  raw: Native,
  cwd: string,
  line: string,
  options: Exec
): Promise<Running> => {
  check(options.signal);
  const timeout = duration(options.timeout, provider);
  try {
    const process = await raw.startProcess(line, {
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(timeout === undefined ? {} : { timeout }),
    });
    const output = await raw.streamProcessLogs(process.id);
    return {
      id: process.id,
      kill: async (signal = "SIGTERM") => {
        await process.kill(signal);
      },
      output,
      result: wait(raw, process),
    };
  } catch (error) {
    throw sandboxError(provider, "Process spawn failed", "process", error);
  }
};

const spawn = (
  raw: Native,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Running> => spawnLine(raw, cwd, command(executable, args), options);

const createSandbox = <ProviderRaw>(
  raw: Native,
  cwd: string,
  options: Cloudflare
): Sandbox<ProviderRaw> => ({
  capabilities,
  cwd,
  files: {
    exists: async (path) => {
      const output = await raw.exists(path);
      return output.exists;
    },
    list: async (path = cwd) => {
      const entries = await raw.listFiles(path, options.list);
      return entries.files
        .map(
          (entry): Entry => ({
            kind: entry.type === "directory" ? "directory" : "file",
            modified: new Date(entry.modifiedAt),
            path: entry.absolutePath,
            size: entry.size,
          })
        )
        .toSorted((left, right) => left.path.localeCompare(right.path));
    },
    mkdir: async (path) => {
      await raw.mkdir(path, { recursive: true });
    },
    read: async (path) => {
      const output = await raw.readFile(path, { encoding: "base64" });
      return binary(output.content);
    },
    remove: async (path) => {
      await raw.deleteFile(path);
    },
    stream: async (path) => {
      const output = await raw.readFile(path, { encoding: "base64" });
      return stream(binary(output.content));
    },
    text: async (path) => {
      const output = await raw.readFile(path, { encoding: "utf-8" });
      return output.content;
    },
    write: (path, input) => write(raw, path, input),
  },
  id: options.id ?? "default",
  ports: {
    expose: async (value, input) => {
      const target = validatePort(value);
      const hostname = input?.host ?? options.hostname;
      if (!hostname) {
        throw sandboxError(
          provider,
          "Cloudflare preview URLs require a hostname",
          "unsupported"
        );
      }
      validateHostname(hostname);
      const output = await raw.exposePort(target, {
        hostname,
        ...(options.name === undefined ? {} : { name: options.name }),
      });
      return {
        port: target,
        url: output.url,
      };
    },
  },
  process: {
    exec: (executable, args = [], run = {}) =>
      execute(raw, cwd, executable, args, run),
    shell: (script, run = {}) => executeLine(raw, cwd, script, run),
    spawn: (executable, args = [], run = {}) =>
      spawn(raw, cwd, executable, args, run),
    spawnShell: (script, run = {}) => spawnLine(raw, cwd, script, run),
  },
  provider,
  raw: raw as ProviderRaw,
  snapshots: {
    create: () => rejectUnsupported("snapshots"),
    restore: () => rejectUnsupported("snapshots"),
  },
  stop: async () => {
    await raw.destroy();
  },
});

/** create a Cloudflare Sandbox adapter from a Worker binding */
export const cloudflare = <ProviderRaw = unknown>(
  options: Cloudflare
): Adapter<ProviderRaw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const id = input.id ?? options.id ?? crypto.randomUUID();
    const cwd = input.cwd ?? options.cwd ?? "/workspace";
    const { getSandbox } = await import("@cloudflare/sandbox");
    const raw = getSandbox(
      options.binding as DurableObjectNamespace<Native>,
      id,
      {
        normalizeId: true,
        ...options.options,
      }
    );
    const env = { ...options.env, ...input.env };

    if (Object.keys(env).length > 0) {
      await raw.setEnvVars(env);
    }
    await raw.mkdir(cwd, { recursive: true });

    return createSandbox<ProviderRaw>(raw, cwd, { ...options, id });
  },
  provider,
});
