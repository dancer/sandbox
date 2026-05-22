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
  port,
  sandboxError,
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

export { cloudflareBridge } from "./bridge.js";
export type {
  CloudflareBridge,
  CloudflareBridgeJson,
  CloudflareBridgeRaw,
  Mount as CloudflareBridgeMount,
  Persist as CloudflareBridgePersist,
  Pty as CloudflareBridgePty,
  PtyConnection as CloudflareBridgePtyConnection,
  Session as CloudflareBridgeSession,
} from "./bridge.js";
export type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";

type Native = CloudflareSandbox<unknown>;

/** native Cloudflare Sandbox object exposed as `sandbox.raw` */
export type CloudflareRaw = Native;

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
  environment: true,
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: "separate",
  raw: {
    backup: "configured",
    buckets: "configured",
    desktop: "configured",
    git: true,
    interpreter: true,
    pty: true,
    sessions: true,
    tunnels: "dynamic",
    watching: true,
  },
  snapshotCreate: false,
  snapshotRestore: false,
  snapshots: false,
  streaming: "separate",
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

const base64 = (input: Uint8Array): string => {
  const chunks: string[] = [];
  for (let index = 0; index < input.length; index += 32_768) {
    chunks.push(String.fromCodePoint(...input.subarray(index, index + 32_768)));
  }
  return btoa(chunks.join(""));
};

const stream = (content: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(content);
      controller.close();
    },
  });

const readable = (input: Input): input is ReadableStream<Uint8Array> =>
  input instanceof ReadableStream;

const rpc = (options: Cloudflare): boolean =>
  options.options?.transport === "rpc";

const write = async (
  raw: Native,
  path: string,
  input: Input,
  direct: boolean
): Promise<void> => {
  if (direct && readable(input)) {
    await raw.writeFile(path, input);
    return;
  }

  const value = await bytes(input);
  if (typeof value === "string") {
    await raw.writeFile(path, value, { encoding: "utf-8" });
    return;
  }
  await raw.writeFile(path, base64(value), { encoding: "base64" });
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

const validateToken = (value?: string): void => {
  if (value === undefined) {
    return;
  }

  if (/^[a-z0-9_]{1,16}$/u.test(value)) {
    return;
  }

  throw sandboxError(
    provider,
    "Cloudflare preview tokens must be 1 to 16 lowercase letters, numbers, or underscores",
    "configuration"
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
      ...(options.signal === undefined ? {} : { signal: options.signal }),
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

const lazy = <Output>(factory: () => Promise<Output>): Promise<Output> => {
  let promise: Promise<Output> | undefined;
  const get = (): Promise<Output> => {
    promise ??= factory();
    return promise;
  };

  return {
    // oxlint-disable-next-line promise/prefer-await-to-then
    catch: (onrejected) => get().catch(onrejected),
    // oxlint-disable-next-line promise/prefer-await-to-then
    finally: (onfinally) => get().finally(onfinally),
    // oxlint-disable-next-line unicorn/no-thenable promise/prefer-await-to-then promise/prefer-catch
    then: (onfulfilled, onrejected) => get().then(onfulfilled, onrejected),
    [Symbol.toStringTag]: "Promise",
  } as Promise<Output>;
};

const logs = (
  raw: Native,
  process: Awaited<ReturnType<Native["startProcess"]>>
): ReadableStream<Uint8Array> => {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  return new ReadableStream<Uint8Array>(
    {
      async cancel(reason) {
        await reader?.cancel(reason);
      },
      async pull(controller) {
        if (reader === undefined) {
          const output = await raw.streamProcessLogs(process.id);
          reader = output.getReader();
        }
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }
        controller.enqueue(chunk.value);
      },
    },
    { highWaterMark: 0 }
  );
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
    return {
      id: process.id,
      kill: async (signal = "SIGTERM") => {
        await process.kill(signal);
      },
      output: logs(raw, process),
      result: lazy(() => wait(raw, process)),
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
): Sandbox<ProviderRaw> => {
  const direct = rpc(options);

  return {
    capabilities,
    cwd,
    files: {
      exists: async (path) => {
        const output = await wrap(() => raw.exists(path), "exists");
        return output.exists;
      },
      list: async (path = cwd) => {
        const entries = await wrap(
          () => raw.listFiles(path, options.list),
          "list"
        );
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
        await wrap(() => raw.mkdir(path, { recursive: true }), "mkdir");
      },
      read: async (path) => {
        const output = await wrap(
          () => raw.readFile(path, { encoding: "base64" }),
          "read"
        );
        return binary(output.content);
      },
      remove: async (path) => {
        await wrap(() => raw.deleteFile(path), "remove");
      },
      stream: async (path) => {
        if (direct) {
          const output = await wrap(
            () => raw.readFile(path, { encoding: "none" }),
            "stream"
          );
          return output.content;
        }

        const output = await wrap(
          () => raw.readFile(path, { encoding: "base64" }),
          "stream"
        );
        return stream(binary(output.content));
      },
      text: async (path) => {
        const output = await wrap(
          () => raw.readFile(path, { encoding: "utf-8" }),
          "text"
        );
        return output.content;
      },
      write: (path, input) =>
        wrap(() => write(raw, path, input, direct), "write"),
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
        validateToken(input?.token);
        const output = await wrap(
          () =>
            raw.exposePort(target, {
              hostname,
              ...(options.name === undefined ? {} : { name: options.name }),
              ...(input?.token === undefined ? {} : { token: input.token }),
            }),
          "port exposure"
        );
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
      await wrap(() => raw.destroy(), "stop");
    },
  };
};

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
