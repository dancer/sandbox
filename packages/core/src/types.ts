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
  | "git"
  | "gpu"
  | "interpreter"
  | "lifecycle"
  | "mcp"
  | "network"
  | "previews"
  | "pty"
  | "secrets"
  | "sessions"
  | "system"
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
export type Capabilities = Readonly<
  Partial<Record<Capability, Mode>> & {
    /** provider-specific powers available through `sandbox.raw` */
    raw?: Partial<Record<RawCapability, Mode>>;
  }
>;

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
  /** stable preview token when the provider supports custom preview URLs */
  token?: string;
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

/** stream-first filesystem contract for low-level provider adapters */
export type SimpleInsecureFiles = Readonly<{
  /** read a file as a byte stream */
  read(path: string): Promise<ReadableStream<Uint8Array>>;
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

/** process contract for low-level provider adapters */
export type SimpleInsecureProcess = Readonly<{
  /** start an executable with explicit argv arguments and stream output */
  spawn(
    command: string,
    args?: readonly string[],
    options?: Spawn
  ): Promise<Running>;
  /** start a shell command string and stream output */
  spawnShell(command: string, options?: Spawn): Promise<Running>;
}>;

/** low-level vendor contract that keeps large I/O stream-first */
export type SimpleInsecureSandbox<Raw = unknown> = Readonly<{
  /** advertised runtime feature support */
  capabilities: Capabilities;
  /** default sandbox working directory */
  cwd: string;
  /** stream-first filesystem operations scoped to the sandbox */
  files: SimpleInsecureFiles;
  /** provider sandbox id */
  id: string;
  /** preview URL operations */
  ports: Ports;
  /** process operations scoped to the sandbox */
  process: SimpleInsecureProcess;
  /** provider name */
  provider: string;
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
