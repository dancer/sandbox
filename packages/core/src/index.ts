import type {
  Adapter,
  Capabilities,
  Capability,
  Cause,
  Code,
  Input,
  Mode,
  Options,
  Port,
  Preview,
  PreviewOptions,
  RawCapability,
  Result,
  Running,
  Sandbox,
  SandboxRuntime,
  Timer,
} from "./types.js";

export type {
  Adapter,
  Capabilities,
  Capability,
  Cause,
  Code,
  Entry,
  Exec,
  Files,
  Input,
  Mode,
  Options,
  Port,
  Ports,
  Preview,
  PreviewOptions,
  Process,
  RawCapability,
  Result,
  Running,
  Sandbox,
  SandboxRuntimeFiles,
  SandboxRuntimeProcess,
  SandboxRuntimePorts,
  SandboxRuntime,
  Snapshot,
  Snapshots,
  Spawn,
  Timer,
  Url,
} from "./types.js";

/**
 * normalized error emitted by public sandbox sdk operations
 *
 * use `code` for portable error handling and `provider` to identify the adapter
 * that raised the error
 */
export class SandboxError extends Error {
  /** stable sandbox sdk error code for portable error handling */
  readonly code: Code;

  /** adapter provider name when the failing operation is provider-specific */
  readonly provider?: string;

  /** create a normalized error from an adapter or public helper */
  constructor(
    message: string,
    options: Cause & { code: Code; provider?: string }
  ) {
    super(message, { cause: options.cause });
    this.name = "SandboxError";
    this.code = options.code;
    if (options.provider !== undefined) {
      this.provider = options.provider;
    }
  }
}

/**
 * return whether a value is a normalized sandbox sdk error
 *
 * use this instead of matching provider-specific error messages when handling
 * errors from multiple adapters
 */
export const isSandboxError = (error: unknown): error is SandboxError =>
  error instanceof SandboxError;

/**
 * create a sandbox through an adapter
 *
 * adapter configuration stays on the adapter and per-sandbox options stay in
 * `input`, keeping provider setup separate from a single sandbox request
 */
export const create = <Raw = unknown>(
  input: Options & { adapter: Adapter<Raw> }
): Promise<Sandbox<Raw>> => {
  const { adapter, ...options } = input;
  return adapter.create(options);
};

const stopAfterError = async (
  sandbox: Sandbox,
  cause: unknown
): Promise<void> => {
  try {
    await sandbox.stop();
  } catch (error) {
    const failure = new AggregateError(
      [cause, error],
      "Sandbox use and cleanup failed"
    );
    throw Object.assign(failure, { cause: error });
  }
};

/**
 * create a sandbox, run work, and always attempt cleanup
 *
 * use this for short-lived work where retaining the sandbox after the callback
 * completes would be unexpected
 *
 * @example
 * import { withSandbox } from "@sandbox-sdk/core"
 * import { local } from "@sandbox-sdk/local"
 *
 * const result = await withSandbox({ adapter: local() }, (sandbox) =>
 *   sandbox.process.shell("printf hello")
 * )
 */
export const withSandbox = async <Raw = unknown, Output = unknown>(
  input: Options & { adapter: Adapter<Raw> },
  use: (sandbox: Sandbox<Raw>) => Output | Promise<Output>
): Promise<Output> => {
  const sandbox = await create(input);
  let value: Output;
  try {
    value = await use(sandbox);
  } catch (error) {
    await stopAfterError(sandbox, error);
    throw error;
  }

  await sandbox.stop();
  return value;
};

/** return the advertised mode for a capability or undefined when absent */
export const capabilityMode = (
  subject: { capabilities: Capabilities },
  capability: Capability
): Exclude<Mode, false> | undefined => {
  const value = subject.capabilities[capability];
  return value === undefined || value === false ? undefined : value;
};

/** throw a normalized unsupported feature error */
export const unsupported = (provider: string, feature: string): never => {
  throw new SandboxError(`${provider} does not support ${feature}`, {
    code: "unsupported",
    provider,
  });
};

/** require a capability and throw a typed unsupported error when missing */
export const requireCapability = (
  subject: { capabilities: Capabilities; provider?: string },
  capability: Capability
): Exclude<Mode, false> => {
  const value = capabilityMode(subject, capability);
  if (value !== undefined) {
    return value;
  }
  return unsupported(subject.provider ?? "sandbox", capability);
};

/** true when a subject advertises a capability */
export const supports = (
  subject: { capabilities: Capabilities },
  capability: Capability
): boolean => capabilityMode(subject, capability) !== undefined;

/** return the advertised mode for a provider-specific raw capability */
export const rawCapabilityMode = (
  subject: { capabilities: Capabilities },
  capability: RawCapability
): Exclude<Mode, false> | undefined => {
  const value = subject.capabilities.raw?.[capability];
  return value === undefined || value === false ? undefined : value;
};

/** require a provider-specific raw capability and throw when missing */
export const requireRawCapability = (
  subject: { capabilities: Capabilities; provider?: string },
  capability: RawCapability
): Exclude<Mode, false> => {
  const value = rawCapabilityMode(subject, capability);
  if (value !== undefined) {
    return value;
  }
  return unsupported(subject.provider ?? "sandbox", `raw ${capability}`);
};

/** true when a provider-specific feature is available through `sandbox.raw` */
export const supportsRaw = (
  subject: { capabilities: Capabilities },
  capability: RawCapability
): boolean => rawCapabilityMode(subject, capability) !== undefined;

/** validate and return a normalized tcp port number */
export const port = (value: number, provider = "sandbox"): number => {
  if (Number.isInteger(value) && value >= 1 && value <= 65_535) {
    return value;
  }
  throw new SandboxError("Port must be an integer from 1 to 65535", {
    code: "configuration",
    provider,
  });
};

/**
 * create a provider-aware preview with access headers kept out of serializable data
 *
 * adapter authors pass provider-required request headers here instead of placing credentials in the returned url. requests are limited to the preview origin
 */
export const preview = (
  url: string,
  value: number,
  options: PreviewOptions = {}
): Preview => {
  const provider = options.provider ?? "sandbox";
  const targetPort = port(value, provider);
  let base: URL;

  try {
    base = new URL(url);
  } catch (error) {
    throw new SandboxError("Preview URL is invalid", {
      cause: error,
      code: "provider",
      provider,
    });
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new SandboxError("Preview URL must use HTTP or HTTPS", {
      code: "provider",
      provider,
    });
  }

  const configured = new Headers(options.headers);
  const request = (path?: string, init?: RequestInit): Promise<Response> => {
    let target: URL;

    try {
      target = path === undefined ? new URL(base) : new URL(path, base);
    } catch (error) {
      return Promise.reject(
        new SandboxError("Preview request URL is invalid", {
          cause: error,
          code: "configuration",
          provider,
        })
      );
    }
    if (target.origin !== base.origin) {
      return Promise.reject(
        new SandboxError("Preview requests must stay on the preview origin", {
          code: "configuration",
          provider,
        })
      );
    }

    for (const [name] of base.searchParams) {
      target.searchParams.delete(name);
    }
    for (const [name, entry] of base.searchParams) {
      target.searchParams.append(name, entry);
    }

    const headers = new Headers(init?.headers);
    for (const [name, entry] of configured) {
      headers.set(name, entry);
    }
    return fetch(target, { ...init, headers });
  };
  const output = { port: targetPort, request, url } satisfies Preview;

  Object.defineProperty(output, "request", {
    enumerable: false,
    value: request,
  });
  return Object.freeze(output);
};

/**
 * validate options against an adapter's provider-derived preview URL
 *
 * call this before provider work when URL tokens or a chosen protocol are unavailable. custom domains stay on adapter-specific configuration or `sandbox.raw`
 */
export const portOptions = (
  provider: string,
  options: Port | undefined,
  protocol?: "http" | "https"
): void => {
  if (options !== undefined && "host" in options) {
    unsupported(provider, "custom preview hosts");
  }
  if (options?.token !== undefined) {
    unsupported(provider, "preview URL tokens");
  }
  if (
    protocol !== undefined &&
    options?.protocol !== undefined &&
    options.protocol !== protocol
  ) {
    unsupported(provider, `${options.protocol} preview URLs`);
  }
};

/** validate and return a normalized millisecond duration */
export const duration = (
  value?: number,
  provider = "sandbox",
  name = "timeout"
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  throw new SandboxError(`${name} must be a non-negative integer`, {
    code: "configuration",
    provider,
  });
};

/** create a normalized provider error */
export const sandboxError = (
  provider: string,
  message: string,
  code: Code = "provider",
  cause?: unknown
): SandboxError =>
  new SandboxError(message, {
    cause,
    code,
    provider,
  });

/** throw a normalized aborted error for an adapter operation */
export const abort = (provider: string, cause?: unknown): never => {
  throw sandboxError(provider, "Operation aborted", "aborted", cause);
};

/**
 * normalize supported file input into text or bytes
 *
 * passing a readable stream consumes it exactly once
 */
export const bytes = async (input: Input): Promise<Uint8Array | string> => {
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

/**
 * decode supported file input as utf-8 text
 *
 * passing a readable stream consumes it exactly once
 */
export const text = async (input: Input): Promise<string> => {
  const value = await bytes(input);
  return typeof value === "string" ? value : new TextDecoder().decode(value);
};

/** resolve a sandbox path against the sandbox cwd */
export const sandboxPath = (cwd: string, value?: string): string => {
  const input = value === undefined || value.length === 0 ? cwd : value;
  if (input.startsWith("/")) {
    return new URL(input, "file:///").pathname;
  }
  const base = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return new URL(`${base}${input}`, "file:///").pathname;
};

const read = async (value: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const output = await bytes(value);
  return typeof output === "string" ? new TextEncoder().encode(output) : output;
};

const normalize = async <Value>(
  provider: string,
  feature: string,
  operation: () => Value | Promise<Value>
): Promise<Value> => {
  try {
    return await operation();
  } catch (error) {
    if (isSandboxError(error)) {
      throw error;
    }
    throw sandboxError(provider, `${feature} failed`, "provider", error);
  }
};

const ensure = (
  sandbox: { capabilities: Capabilities; provider: string },
  capability: Capability,
  feature: string
): void => {
  if (!supports(sandbox, capability)) {
    unsupported(sandbox.provider, feature);
  }
};

const settle = async (running: Running): Promise<Result> => {
  const [output, value] = await Promise.all([
    text(running.output),
    running.result,
  ]);
  return value.stdout.length > 0 || value.stderr.length > 0
    ? value
    : { ...value, stdout: output };
};

const guarded = <Value>(
  input: { capabilities: Capabilities; provider: string },
  capability: Capability,
  feature: string,
  operation: () => Value | Promise<Value>
): Promise<Value> => {
  try {
    ensure(input, capability, feature);
    return normalize(input.provider, feature, operation);
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * lift a stream-first provider runtime into the public sandbox api
 *
 * adapter authors implement this lower-level contract to preserve streaming
 * for large files and processes while callers receive the normalized api
 */
export const fromSandboxRuntime = <Raw = unknown>(
  input: SandboxRuntime<Raw>
): Sandbox<Raw> => ({
  capabilities: input.capabilities,
  cwd: input.cwd,
  files: {
    exists: (path) =>
      guarded(input, "files", "files.exists", () => input.files.exists(path)),
    list: (path) =>
      guarded(input, "files", "files.list", () => input.files.list(path)),
    mkdir: (path) =>
      guarded(input, "files", "files.mkdir", () => input.files.mkdir(path)),
    read: (path) =>
      guarded(input, "files", "files.read", async () =>
        read(await input.files.read(path))
      ),
    remove: (path) =>
      guarded(input, "files", "files.remove", () => input.files.remove(path)),
    stream: (path) =>
      guarded(input, "files", "files.stream", () => input.files.read(path)),
    text: (path) =>
      guarded(input, "files", "files.text", async () =>
        text(await read(await input.files.read(path)))
      ),
    write: (path, value) =>
      guarded(input, "files", "files.write", () =>
        input.files.write(path, value)
      ),
  },
  id: input.id,
  ports: {
    expose: async (value, options) => {
      const exposed = await guarded(input, "ports", "ports.expose", () =>
        input.ports.expose(port(value, input.provider), options)
      );
      return preview(exposed.url, exposed.port, { provider: input.provider });
    },
  },
  process: {
    exec: (executable, args, options) =>
      guarded(input, "processExec", "process.exec", async () =>
        settle(await input.process.spawn(executable, args, options))
      ),
    shell: (command, options) =>
      guarded(input, "processExec", "process.shell", async () =>
        settle(await input.process.spawnShell(command, options))
      ),
    spawn: (executable, args, options) =>
      guarded(input, "processSpawn", "process.spawn", () =>
        input.process.spawn(executable, args, options)
      ),
    spawnShell: (command, options) =>
      guarded(input, "processSpawn", "process.spawnShell", () =>
        input.process.spawnShell(command, options)
      ),
  },
  provider: input.provider,
  raw: input.raw,
  snapshots: {
    create: (name) =>
      guarded(input, "snapshotCreate", "snapshots.create", () =>
        input.snapshots.create(name)
      ),
    restore: (id) =>
      guarded(input, "snapshotRestore", "snapshots.restore", () =>
        input.snapshots.restore(id)
      ),
  },
  stop: input.stop,
});

/** build a normalized command result */
export const result = (
  code: number,
  stdout = "",
  stderr = "",
  signal?: string
): Result => ({
  code,
  ok: code === 0,
  ...(signal === undefined ? {} : { signal }),
  stderr,
  stdout,
});

/** quote one shell argument for POSIX shell execution */
export const quote = (value: string): string => {
  if (/^[\w./:@%+=,-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
};

/** build a shell command string from argv parts */
export const command = (value: string, args: readonly string[] = []): string =>
  [value, ...args].map(quote).join(" ");

const noop = (): void => void 0;

/** create an abort signal that fires when timeout or parent signal fires */
export const timeout = (
  value?: number,
  signal?: AbortSignal,
  provider = "sandbox"
): { aborted(): boolean; clear(): void; signal?: AbortSignal } => {
  const delay = duration(value, provider);
  if (delay === undefined) {
    return signal === undefined
      ? { aborted: () => false, clear: noop }
      : { aborted: () => signal.aborted, clear: noop, signal };
  }

  let aborted = false;
  const controller = new AbortController();
  const timer: Timer = setTimeout(() => {
    aborted = true;
    controller.abort();
  }, delay);
  signal?.addEventListener(
    "abort",
    () => {
      aborted = false;
      controller.abort();
    },
    { once: true }
  );

  return {
    aborted: () => aborted,
    clear: () => clearTimeout(timer),
    signal: controller.signal,
  };
};
