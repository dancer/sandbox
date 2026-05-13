import type {
  ListFilesOptions,
  Sandbox as CloudflareSandbox,
  SandboxOptions,
} from "@cloudflare/sandbox";
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

export type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";

/** Cloudflare Sandbox adapter configuration */
export type Cloudflare = Readonly<{
  /** Durable Object binding for the Cloudflare Sandbox class, usually `env.Sandbox` */
  binding: DurableObjectNamespace<CloudflareSandbox>;
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

type Raw = CloudflareSandbox;

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

const write = async (raw: Raw, path: string, input: Input): Promise<void> => {
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

const validatePort = (value: number): void => {
  if (
    Number.isInteger(value) &&
    value >= 1024 &&
    value <= 65_535 &&
    value !== 3000
  ) {
    return;
  }

  throw sandboxError(
    provider,
    "Cloudflare preview ports must be integers from 1024 to 65535, excluding 3000",
    "unsupported"
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
  raw: Raw,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  check(options.signal);
  try {
    const output = await raw.exec(line, {
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    });
    return result(output.exitCode, output.stdout, output.stderr);
  } catch (error) {
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const execute = (
  raw: Raw,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => executeLine(raw, cwd, command(executable, args), options);

const wait = async (
  raw: Raw,
  process: Awaited<ReturnType<Raw["startProcess"]>>
): Promise<Result> => {
  const output = await process.waitForExit();
  const logs = await raw.getProcessLogs(process.id);
  return result(output.exitCode, logs.stdout, logs.stderr);
};

const spawnLine = async (
  raw: Raw,
  cwd: string,
  line: string,
  options: Exec
): Promise<Running> => {
  check(options.signal);
  try {
    const process = await raw.startProcess(line, {
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
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
  raw: Raw,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Running> => spawnLine(raw, cwd, command(executable, args), options);

const createSandbox = (
  raw: Raw,
  cwd: string,
  options: Cloudflare
): Sandbox<Raw> => ({
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
    text: async (path) => {
      const output = await raw.readFile(path, { encoding: "utf-8" });
      return output.content;
    },
    write: (path, input) => write(raw, path, input),
  },
  id: options.id ?? "default",
  ports: {
    expose: async (port, input) => {
      validatePort(port);
      const hostname = input?.host ?? options.hostname;
      if (!hostname) {
        throw sandboxError(
          provider,
          "Cloudflare preview URLs require a hostname",
          "unsupported"
        );
      }
      validateHostname(hostname);
      const output = await raw.exposePort(port, {
        hostname,
        ...(options.name === undefined ? {} : { name: options.name }),
      });
      return {
        port,
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
  raw,
  snapshots: {
    create: () => unsupported(provider, "snapshots"),
    restore: () => unsupported(provider, "snapshots"),
  },
  stop: async () => {
    await raw.destroy();
  },
});

/** create a Cloudflare Sandbox adapter from a Worker binding */
export const cloudflare = (options: Cloudflare): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const id = input.id ?? options.id ?? crypto.randomUUID();
    const cwd = input.cwd ?? options.cwd ?? "/workspace";
    const { getSandbox } = await import("@cloudflare/sandbox");
    const raw = getSandbox(options.binding, id, {
      normalizeId: true,
      ...options.options,
    });
    const env = { ...options.env, ...input.env };

    if (Object.keys(env).length > 0) {
      await raw.setEnvVars(env);
    }
    await raw.mkdir(cwd, { recursive: true });

    return createSandbox(raw, cwd, { ...options, id });
  },
  provider,
});
