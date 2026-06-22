/** normalized feature flags adapters expose for runtime branching */
export type Capability =
  | "environment"
  | "files"
  | "ports"
  | "process"
  | "processExec"
  | "processSpawn"
  | "snapshotCreate"
  | "snapshotRestore"
  | "snapshotSource"
  | "snapshots"
  | "streaming";

/** provider-specific capabilities available through `sandbox.raw` */
export type RawCapability =
  | "backup"
  | "buckets"
  | "codegen"
  | "desktop"
  | "drives"
  | "git"
  | "gpu"
  | "interpreter"
  | "lifecycle"
  | "lsp"
  | "mcp"
  | "metrics"
  | "network"
  | "previews"
  | "pty"
  | "resources"
  | "secrets"
  | "sessions"
  | "ssh"
  | "system"
  | "tunnels"
  | "volumes"
  | "watching";

/**
 * capability mode details when a feature exists but has a provider-specific shape
 *
 * check the specific capability before assuming related operations are supported
 */
export type Mode =
  | boolean
  | "combined"
  | "configured"
  | "create-time"
  | "derived"
  | "disk"
  | "dynamic"
  | "filesystem"
  | "memory"
  | "separate"
  | "volume";

/**
 * provider capability map used by `supports`, `capabilityMode`, and docs
 *
 * snapshot create, restore, and source capabilities are intentionally separate
 * because providers do not expose the same snapshot lifecycle
 */
export type Capabilities = Readonly<
  Partial<Record<Capability, Mode>> & {
    /** provider-specific powers available through `sandbox.raw` */
    raw?: Partial<Record<RawCapability, Mode>>;
  }
>;

/**
 * file write input accepted by every adapter
 *
 * readable streams are consumed once by the receiving operation
 */
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
  /** stdout stream when the provider exposes stdout separately */
  stdout?: ReadableStream<Uint8Array>;
  /** stderr stream when the provider exposes stderr separately */
  stderr?: ReadableStream<Uint8Array>;
  /** final process result */
  result: Promise<Result>;
  /** request process termination */
  kill(signal?: string): Promise<void>;
}>;

/** normalized filesystem namespace scoped to a sandbox root */
export type Files = Readonly<{
  /** read a file as a byte stream */
  stream(path: string): Promise<ReadableStream<Uint8Array>>;
  /** read a file as bytes */
  read(path: string): Promise<Uint8Array>;
  /** read a file as utf-8 text */
  text(path: string): Promise<string>;
  /** write text, bytes, blobs, array buffers, or readable streams */
  write(path: string, input: Input): Promise<void>;
  /** list entries in a directory */
  list(path?: string): Promise<readonly Entry[]>;
  /**
   * return whether a file or directory exists
   *
   * resolve relative paths from `sandbox.cwd` and preserve absolute sandbox paths
   */
  exists(path: string): Promise<boolean>;
  /** create a directory and missing parents */
  mkdir(path: string): Promise<void>;
  /** remove a file or directory */
  remove(path: string): Promise<void>;
}>;

/** normalized preview URL namespace */
export type Ports = Readonly<{
  /** expose a sandbox port and return a provider-aware preview; adapters reject options they cannot honor */
  expose(port: number, options?: Port): Promise<Preview>;
}>;

/**
 * normalized snapshot namespace for capability-gated state capture
 *
 * check `snapshotCreate` and `snapshotRestore` independently because creating a
 * snapshot does not imply an adapter can restore one in place
 */
export type Snapshots = Readonly<{
  /** create a snapshot, optionally naming it when the provider persists snapshot names */
  create(name?: string): Promise<Snapshot>;
  /** restore a snapshot when `snapshotRestore` is supported */
  restore(id: string): Promise<void>;
}>;

/** serializable preview endpoint returned by a low-level adapter */
export type Url = Readonly<{
  /** public or local URL for the exposed port */
  url: string;
  /** exposed sandbox port */
  port: number;
}>;

/** private provider options used by the `preview()` helper */
export type PreviewOptions = Readonly<{
  /** provider headers applied only when `Preview.request` runs and override caller-supplied values */
  headers?: Readonly<Record<string, string>>;
  /** provider name used when preview request validation fails */
  provider?: string;
}>;

/**
 * provider-aware preview returned by `ports.expose`
 *
 * `request` adds provider-required access headers without exposing them in returned data. it preserves provider URL query parameters, so treat provider-issued signed or tokenized urls as credentials. redirects are manual by default because provider credentials must not leave the preview origin
 *
 * @example
 * const preview = await sandbox.ports.expose(3000)
 * const response = await preview.request("/health")
 */
export type Preview = Readonly<
  Url & {
    /** request a same-origin preview path with provider-required access headers and query parameters; use `redirect: "manual"` or `"error"` because automatic redirects are rejected */
    request(path?: string, init?: RequestInit): Promise<Response>;
  }
>;

/** snapshot identifier returned by `snapshots.create` */
export type Snapshot = Readonly<{
  /** provider snapshot id */
  id: string;
  /** provider-persisted snapshot name when supported */
  name?: string;
}>;

/**
 * command execution options shared by exec, shell, spawn, and spawnShell
 *
 * command environments apply only to that process and are not adapter credentials
 */
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

/**
 * preview URL options supported by one or more adapters
 *
 * adapters reject unsupported values instead of silently ignoring them. custom domains and other provider-specific preview controls stay on adapter options or `sandbox.raw`
 */
export type Port = Readonly<{
  /** preview protocol preference when the provider supports it */
  protocol?: "http" | "https" | "tcp";
  /** provider-issued preview URL token when the adapter supports it; treat it as a bearer credential */
  token?: string;
}>;

/**
 * normalized sandbox instance returned by every adapter
 *
 * use `capabilities` before optional operations and `raw` only when the
 * provider-specific capability is explicitly needed
 */
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
  /** raw provider object for advanced provider-specific usage outside the normalized contract */
  raw: Raw;
  /** snapshot operations gated by capabilities */
  snapshots: Snapshots;
  /** stop, destroy, or release the sandbox according to adapter semantics */
  stop(): Promise<void>;
}>;

/** stream-first filesystem contract for low-level provider adapters */
export type SandboxRuntimeFiles = Readonly<{
  /** read a file as a byte stream */
  read(path: string): Promise<ReadableStream<Uint8Array>>;
  /** write text, bytes, blobs, array buffers, or readable streams */
  write(path: string, input: Input): Promise<void>;
  /** list entries in a directory */
  list(path?: string): Promise<readonly Entry[]>;
  /**
   * return whether a file or directory exists
   *
   * resolve relative paths before this call because `fromSandboxRuntime()` preserves paths unchanged
   */
  exists(path: string): Promise<boolean>;
  /** create a directory and missing parents */
  mkdir(path: string): Promise<void>;
  /** remove a file or directory */
  remove(path: string): Promise<void>;
}>;

/** process contract for low-level provider adapters */
export type SandboxRuntimeProcess = Readonly<{
  /** run a bounded executable when the provider exposes a direct command result */
  exec?: (
    command: string,
    args?: readonly string[],
    options?: Exec
  ) => Promise<Result>;
  /** run a bounded shell command when the provider exposes a direct command result */
  shell?: (command: string, options?: Exec) => Promise<Result>;
  /** start an executable with explicit argv arguments and stream output */
  spawn?: (
    command: string,
    args?: readonly string[],
    options?: Spawn
  ) => Promise<Running>;
  /** start a shell command string and stream output */
  spawnShell?: (command: string, options?: Spawn) => Promise<Running>;
}>;

/** preview url contract for low-level provider adapters */
export type SandboxRuntimePorts = Readonly<{
  /** expose a sandbox port and return a serializable provider url */
  expose(port: number, options?: Port): Promise<Url>;
}>;

/**
 * low-level vendor contract that keeps large I/O stream-first
 *
 * adapter authors should implement this contract and use `fromSandboxRuntime`
 * instead of buffering provider I/O in an adapter
 */
export type SandboxRuntime<Raw = unknown> = Readonly<{
  /** advertised runtime feature support */
  capabilities: Capabilities;
  /** default sandbox working directory */
  cwd: string;
  /** stream-first filesystem operations scoped to the sandbox */
  files: SandboxRuntimeFiles;
  /** provider sandbox id */
  id: string;
  /** preview URL operations */
  ports: SandboxRuntimePorts;
  /** process operations scoped to the sandbox */
  process: SandboxRuntimeProcess;
  /** provider name */
  provider: string;
  /** raw provider object for advanced provider-specific usage */
  raw: Raw;
  /** snapshot operations gated by capabilities */
  snapshots: Snapshots;
  /** stop, destroy, or release the sandbox according to adapter semantics */
  stop(): Promise<void>;
}>;

/**
 * provider adapter contract implemented by each package
 *
 * adapter configuration belongs in the factory and per-sandbox configuration
 * belongs in `create`
 */
export type Adapter<Raw = unknown> = Readonly<{
  /** provider name */
  provider: string;
  /** adapter capability map */
  capabilities: Capabilities;
  /** create or connect to a sandbox */
  create(options?: Options): Promise<Sandbox<Raw>>;
}>;

/**
 * sandbox creation options shared across providers
 *
 * individual adapters document which options they support and how they map to
 * their provider
 */
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

/** optional cause metadata used by normalized errors */
export type Cause = Readonly<{
  /** original provider, runtime, or platform failure */
  cause?: unknown;
}>;

/** runtime timeout handle type used across browser and node targets */
export type Timer = ReturnType<typeof setTimeout>;

/** normalized error code for sandbox sdk failures */
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
