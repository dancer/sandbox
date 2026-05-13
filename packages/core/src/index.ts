/** normalized feature flags adapters expose for runtime branching */
export type Capability =
  | "desktop"
  | "environment"
  | "files"
  | "git"
  | "network"
  | "ports"
  | "process"
  | "processExec"
  | "processSpawn"
  | "pty"
  | "secrets"
  | "snapshotCreate"
  | "snapshotRestore"
  | "snapshotSource"
  | "snapshots"
  | "streaming"
  | "volumes";

/** capability mode details when a feature exists but has provider-specific shape */
export type Mode =
  | boolean
  | "combined"
  | "create-time"
  | "derived"
  | "disk"
  | "dynamic"
  | "filesystem"
  | "memory"
  | "separate"
  | "volume";

/** provider capability map used by `supports`, `capabilityMode`, and docs */
export type Capabilities = Readonly<Partial<Record<Capability, Mode>>>;

/** file write input accepted by every adapter */
export type Input =
  | string
  | Uint8Array
  | ArrayBuffer
  | Blob
  | ReadableStream<Uint8Array>;

/** file or directory entry returned by `files.list` */
export type Entry = Readonly<{
  path: string;
  kind: "file" | "directory";
  size?: number;
  modified?: Date;
}>;

/** completed process result with buffered stdout and stderr */
export type Result = Readonly<{
  code: number;
  ok: boolean;
  signal?: string;
  stdout: string;
  stderr: string;
}>;

/** normalized process namespace for one-shot and background commands */
export type Process = Readonly<{
  exec(
    command: string,
    args?: readonly string[],
    options?: Exec
  ): Promise<Result>;
  shell(command: string, options?: Exec): Promise<Result>;
  spawn(
    command: string,
    args?: readonly string[],
    options?: Spawn
  ): Promise<Running>;
  spawnShell(command: string, options?: Spawn): Promise<Running>;
}>;

/** handle returned by background process APIs */
export type Running = Readonly<{
  id: string;
  output: ReadableStream<Uint8Array>;
  result: Promise<Result>;
  kill(signal?: string): Promise<void>;
}>;

/** normalized filesystem namespace scoped to a sandbox root */
export type Files = Readonly<{
  read(path: string): Promise<Uint8Array>;
  text(path: string): Promise<string>;
  write(path: string, input: Input): Promise<void>;
  list(path?: string): Promise<readonly Entry[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
}>;

/** normalized preview URL namespace */
export type Ports = Readonly<{
  expose(port: number, options?: Port): Promise<Url>;
}>;

/** normalized snapshot namespace for capability-gated state capture */
export type Snapshots = Readonly<{
  create(name?: string): Promise<Snapshot>;
  restore(id: string): Promise<void>;
}>;

/** preview URL returned by `ports.expose` */
export type Url = Readonly<{
  url: string;
  port: number;
}>;

/** snapshot identifier returned by `snapshots.create` */
export type Snapshot = Readonly<{
  id: string;
  name?: string;
}>;

/** command execution options shared by exec, shell, spawn, and spawnShell */
export type Exec = Readonly<{
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeout?: number;
}>;

export type Spawn = Exec;

/** preview URL options for adapters that support host or protocol selection */
export type Port = Readonly<{
  host?: string;
  protocol?: "http" | "https" | "tcp";
}>;

/** normalized sandbox instance returned by every adapter */
export type Sandbox<Raw = unknown> = Readonly<{
  capabilities: Capabilities;
  cwd: string;
  files: Files;
  id: string;
  process: Process;
  provider: string;
  ports: Ports;
  raw: Raw;
  snapshots: Snapshots;
  stop(): Promise<void>;
}>;

/** provider adapter contract implemented by each package */
export type Adapter<Raw = unknown> = Readonly<{
  provider: string;
  capabilities: Capabilities;
  create(options?: Options): Promise<Sandbox<Raw>>;
}>;

/** sandbox creation options shared across providers */
export type Options = Readonly<{
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  id?: string;
  metadata?: Readonly<Record<string, string>>;
  ports?: readonly number[];
  snapshot?: string;
  template?: string;
  timeout?: number;
}>;

export type Cause = Readonly<{
  cause?: unknown;
}>;

export type Timer = ReturnType<typeof setTimeout>;

export type Code =
  | "aborted"
  | "configuration"
  | "not_found"
  | "path_escape"
  | "policy"
  | "process"
  | "provider"
  | "timeout"
  | "unsupported";

/** error type thrown by normalized SDK failures */
export class SandboxError extends Error {
  readonly code: Code;

  readonly provider?: string;

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

export const isSandboxError = (error: unknown): error is SandboxError =>
  error instanceof SandboxError;

/** create a sandbox through an adapter without leaking the adapter option */
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

/** create a sandbox, run work, and always attempt cleanup */
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

/** create a normalized provider error */
export const error = (
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

export const abort = (provider: string, cause?: unknown): never => {
  throw error(provider, "Operation aborted", "aborted", cause);
};

/** normalize supported file inputs into bytes or text */
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

export const text = async (input: Input): Promise<string> => {
  const value = await bytes(input);
  return typeof value === "string" ? value : new TextDecoder().decode(value);
};

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
  signal?: AbortSignal
): { aborted(): boolean; clear(): void; signal?: AbortSignal } => {
  if (value === undefined) {
    return signal === undefined
      ? { aborted: () => false, clear: noop }
      : { aborted: () => signal.aborted, clear: noop, signal };
  }

  let aborted = false;
  const controller = new AbortController();
  const timer: Timer = setTimeout(() => {
    aborted = true;
    controller.abort();
  }, value);
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
