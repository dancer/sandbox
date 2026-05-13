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
  /** sandbox-relative absolute path */
  path: string;
  /** entry type reported by the provider */
  kind: "file" | "directory";
  /** byte size when the provider reports it */
  size?: number;
  /** last modified time when the provider reports it */
  modified?: Date;
}>;

/** completed process result with buffered stdout and stderr */
export type Result = Readonly<{
  /** process exit code */
  code: number;
  /** true when `code` is 0 and the provider did not report abort or timeout */
  ok: boolean;
  /** termination signal when the provider reports one */
  signal?: string;
  /** buffered stdout as utf-8 text */
  stdout: string;
  /** buffered stderr as utf-8 text */
  stderr: string;
}>;

/** normalized process namespace for one-shot and background commands */
export type Process = Readonly<{
  /** run an executable with explicit argv arguments */
  exec(
    command: string,
    args?: readonly string[],
    options?: Exec
  ): Promise<Result>;
  /** run a shell command string in the sandbox */
  shell(command: string, options?: Exec): Promise<Result>;
  /** start an executable with explicit argv arguments and stream output */
  spawn(
    command: string,
    args?: readonly string[],
    options?: Spawn
  ): Promise<Running>;
  /** start a shell command string and stream output */
  spawnShell(command: string, options?: Spawn): Promise<Running>;
}>;

/** handle returned by background process APIs */
export type Running = Readonly<{
  /** provider process id or generated handle id */
  id: string;
  /** combined output stream when the provider exposes streaming output */
  output: ReadableStream<Uint8Array>;
  /** final process result */
  result: Promise<Result>;
  /** request process termination */
  kill(signal?: string): Promise<void>;
}>;

/** normalized filesystem namespace scoped to a sandbox root */
export type Files = Readonly<{
  /** read a file as bytes */
  read(path: string): Promise<Uint8Array>;
  /** read a file as utf-8 text */
  text(path: string): Promise<string>;
  /** write text, bytes, blobs, array buffers, or readable streams */
  write(path: string, input: Input): Promise<void>;
  /** list entries in a directory */
  list(path?: string): Promise<readonly Entry[]>;
  /** return true when a path exists */
  exists(path: string): Promise<boolean>;
  /** create a directory and missing parents */
  mkdir(path: string): Promise<void>;
  /** remove a file or directory */
  remove(path: string): Promise<void>;
}>;

/** normalized preview URL namespace */
export type Ports = Readonly<{
  /** expose a sandbox port and return a reachable URL */
  expose(port: number, options?: Port): Promise<Url>;
}>;

/** normalized snapshot namespace for capability-gated state capture */
export type Snapshots = Readonly<{
  /** create a snapshot when `snapshotCreate` is supported */
  create(name?: string): Promise<Snapshot>;
  /** restore a snapshot when `snapshotRestore` is supported */
  restore(id: string): Promise<void>;
}>;

/** preview URL returned by `ports.expose` */
export type Url = Readonly<{
  /** public or local URL for the exposed port */
  url: string;
  /** exposed sandbox port */
  port: number;
}>;

/** snapshot identifier returned by `snapshots.create` */
export type Snapshot = Readonly<{
  /** provider snapshot id */
  id: string;
  /** optional friendly snapshot name */
  name?: string;
}>;

/** command execution options shared by exec, shell, spawn, and spawnShell */
export type Exec = Readonly<{
  /** command working directory inside the sandbox */
  cwd?: string;
  /** environment variables for this command */
  env?: Readonly<Record<string, string>>;
  /** abort signal for canceling this command */
  signal?: AbortSignal;
  /** command timeout in milliseconds */
  timeout?: number;
}>;

/** background process options shared with one-shot execution */
export type Spawn = Exec;

/** preview URL options for adapters that support host or protocol selection */
export type Port = Readonly<{
  /** custom preview host when the provider supports it */
  host?: string;
  /** preview protocol preference when the provider supports it */
  protocol?: "http" | "https" | "tcp";
}>;

/** normalized sandbox instance returned by every adapter */
export type Sandbox<Raw = unknown> = Readonly<{
  /** advertised runtime feature support */
  capabilities: Capabilities;
  /** default sandbox working directory */
  cwd: string;
  /** filesystem operations scoped to the sandbox */
  files: Files;
  /** provider sandbox id */
  id: string;
  /** process operations scoped to the sandbox */
  process: Process;
  /** provider name */
  provider: string;
  /** preview URL operations */
  ports: Ports;
  /** raw provider object for advanced provider-specific usage */
  raw: Raw;
  /** snapshot operations gated by capabilities */
  snapshots: Snapshots;
  /** stop, destroy, or release the sandbox according to adapter semantics */
  stop(): Promise<void>;
}>;

/** provider adapter contract implemented by each package */
export type Adapter<Raw = unknown> = Readonly<{
  /** provider name */
  provider: string;
  /** adapter capability map */
  capabilities: Capabilities;
  /** create or connect to a sandbox */
  create(options?: Options): Promise<Sandbox<Raw>>;
}>;

/** sandbox creation options shared across providers */
export type Options = Readonly<{
  /** default sandbox working directory */
  cwd?: string;
  /** environment variables applied at sandbox creation */
  env?: Readonly<Record<string, string>>;
  /** stable sandbox id or provider name when supported */
  id?: string;
  /** provider metadata or labels */
  metadata?: Readonly<Record<string, string>>;
  /** ports declared at create time for providers that require it */
  ports?: readonly number[];
  /** snapshot id used as the sandbox source when supported */
  snapshot?: string;
  /** template id, image, or runtime source depending on provider */
  template?: string;
  /** sandbox lifetime timeout in milliseconds when supported */
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
