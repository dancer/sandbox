# API Reference

Generated from package declaration output

Run `bun run docs:api` after changing public exports

## @sandbox-sdk/core

Typed primitives for sandbox providers

### types

#### `Capability`

normalized feature flags adapters expose for runtime branching

```ts
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
```

#### `Mode`

capability mode details when a feature exists but has provider-specific shape

```ts
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
```

#### `Capabilities`

provider capability map used by `supports`, `capabilityMode`, and docs

```ts
export type Capabilities = Readonly<Partial<Record<Capability, Mode>>>;
```

#### `Input`

file write input accepted by every adapter

```ts
export type Input =
  | string
  | Uint8Array
  | ArrayBuffer
  | Blob
  | ReadableStream<Uint8Array>;
```

#### `Entry`

file or directory entry returned by `files.list`

```ts
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
```

#### `Result`

completed process result with buffered stdout and stderr

```ts
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
```

#### `Process`

normalized process namespace for one-shot and background commands

```ts
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
```

#### `Running`

handle returned by background process APIs

```ts
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
```

#### `Files`

normalized filesystem namespace scoped to a sandbox root

```ts
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
```

#### `Ports`

normalized preview URL namespace

```ts
export type Ports = Readonly<{
  /** expose a sandbox port and return a reachable URL */
  expose(port: number, options?: Port): Promise<Url>;
}>;
```

#### `Snapshots`

normalized snapshot namespace for capability-gated state capture

```ts
export type Snapshots = Readonly<{
  /** create a snapshot when `snapshotCreate` is supported */
  create(name?: string): Promise<Snapshot>;
  /** restore a snapshot when `snapshotRestore` is supported */
  restore(id: string): Promise<void>;
}>;
```

#### `Url`

preview URL returned by `ports.expose`

```ts
export type Url = Readonly<{
  /** public or local URL for the exposed port */
  url: string;
  /** exposed sandbox port */
  port: number;
}>;
```

#### `Snapshot`

snapshot identifier returned by `snapshots.create`

```ts
export type Snapshot = Readonly<{
  /** provider snapshot id */
  id: string;
  /** optional friendly snapshot name */
  name?: string;
}>;
```

#### `Exec`

command execution options shared by exec, shell, spawn, and spawnShell

```ts
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
```

#### `Spawn`

background process options shared with one-shot execution

```ts
export type Spawn = Exec;
```

#### `Port`

preview URL options for adapters that support host or protocol selection

```ts
export type Port = Readonly<{
  /** custom preview host when the provider supports it */
  host?: string;
  /** preview protocol preference when the provider supports it */
  protocol?: "http" | "https" | "tcp";
}>;
```

#### `Sandbox`

normalized sandbox instance returned by every adapter

```ts
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
```

#### `Adapter`

provider adapter contract implemented by each package

```ts
export type Adapter<Raw = unknown> = Readonly<{
  /** provider name */
  provider: string;
  /** adapter capability map */
  capabilities: Capabilities;
  /** create or connect to a sandbox */
  create(options?: Options): Promise<Sandbox<Raw>>;
}>;
```

#### `Options`

sandbox creation options shared across providers

```ts
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
```

#### `Cause`

```ts
export type Cause = Readonly<{
  cause?: unknown;
}>;
```

#### `Timer`

```ts
export type Timer = ReturnType<typeof setTimeout>;
```

#### `Code`

```ts
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
```

### classes

#### `SandboxError`

error type thrown by normalized SDK failures

```ts
export declare class SandboxError extends Error {
  readonly code: Code;
  readonly provider?: string;
  constructor(
    message: string,
    options: Cause & {
      code: Code;
      provider?: string;
    }
  );
}
```

### functions

#### `isSandboxError`

```ts
export declare const isSandboxError: (error: unknown) => error is SandboxError;
```

#### `create`

create a sandbox through an adapter without leaking the adapter option

```ts
export declare const create: <Raw = unknown>(
  input: Options & {
    adapter: Adapter<Raw>;
  }
) => Promise<Sandbox<Raw>>;
```

#### `withSandbox`

create a sandbox, run work, and always attempt cleanup

```ts
export declare const withSandbox: <Raw = unknown, Output = unknown>(
  input: Options & {
    adapter: Adapter<Raw>;
  },
  use: (sandbox: Sandbox<Raw>) => Output | Promise<Output>
) => Promise<Output>;
```

#### `capabilityMode`

return the advertised mode for a capability or undefined when absent

```ts
export declare const capabilityMode: (
  subject: {
    capabilities: Capabilities;
  },
  capability: Capability
) => Exclude<Mode, false> | undefined;
```

#### `unsupported`

throw a normalized unsupported feature error

```ts
export declare const unsupported: (provider: string, feature: string) => never;
```

#### `requireCapability`

require a capability and throw a typed unsupported error when missing

```ts
export declare const requireCapability: (
  subject: {
    capabilities: Capabilities;
    provider?: string;
  },
  capability: Capability
) => Exclude<Mode, false>;
```

#### `supports`

true when a subject advertises a capability

```ts
export declare const supports: (
  subject: {
    capabilities: Capabilities;
  },
  capability: Capability
) => boolean;
```

#### `error`

create a normalized provider error

```ts
export declare const error: (
  provider: string,
  message: string,
  code?: Code,
  cause?: unknown
) => SandboxError;
```

#### `abort`

```ts
export declare const abort: (provider: string, cause?: unknown) => never;
```

#### `bytes`

normalize supported file inputs into bytes or text

```ts
export declare const bytes: (input: Input) => Promise<Uint8Array | string>;
```

#### `text`

```ts
export declare const text: (input: Input) => Promise<string>;
```

#### `result`

build a normalized command result

```ts
export declare const result: (
  code: number,
  stdout?: string,
  stderr?: string,
  signal?: string
) => Result;
```

#### `quote`

quote one shell argument for POSIX shell execution

```ts
export declare const quote: (value: string) => string;
```

#### `command`

build a shell command string from argv parts

```ts
export declare const command: (
  value: string,
  args?: readonly string[]
) => string;
```

#### `timeout`

create an abort signal that fires when timeout or parent signal fires

```ts
export declare const timeout: (
  value?: number,
  signal?: AbortSignal
) => {
  aborted(): boolean;
  clear(): void;
  signal?: AbortSignal;
};
```

## @sandbox-sdk/local

Local sandbox adapter for Sandbox SDK

### types

#### `Local`

```ts
export type Local = Readonly<{
  /**
   * host environment inheritance policy for local commands
   *
   * `true` passes all host environment variables, `false` passes none, and an
   * array passes only the named variables
   *
   * @default ["HOME", "PATH", "SHELL", "TEMP", "TMP", "TMPDIR"]
   */
  inheritEnv?: boolean | readonly string[];
  /**
   * keep temporary local sandbox files after `stop`
   *
   * custom roots are always left on disk because they are owned by the caller
   *
   * @default false
   */
  keep?: boolean;
  /**
   * host directory used as the sandbox root
   *
   * when omitted, the adapter creates a temporary directory
   */
  root?: string;
}>;
```

### functions

#### `local`

create a local adapter that runs against an isolated host directory

```ts
export declare const local: (options?: Local) => Adapter<Raw>;
```

## @sandbox-sdk/ai

Agent tool helpers for Sandbox SDK

### types

#### `Schema`

json schema object accepted by AI SDK tools

```ts
export type Schema = Readonly<{
  /** whether unknown properties are rejected */
  additionalProperties: false;
  /** json schema property map */
  properties: Readonly<Record<string, unknown>>;
  /** required property names */
  required?: readonly string[];
  /** schema root type */
  type: "object";
}>;
```

#### `Tool`

provider-agnostic tool shape compatible with the AI SDK

```ts
export type Tool<Input, Output> = Readonly<{
  /** prompt-facing tool description */
  description: string;
  /** strict json schema for tool input */
  inputSchema: Schema;
  /** true when model output should match the schema exactly */
  strict?: boolean;
  /** tool implementation */
  execute(input: Input): Promise<Output>;
}>;
```

#### `Name`

built-in sandbox tool name

```ts
export type Name = "exec" | "list" | "preview" | "read" | "write";
```

#### `Context`

context passed to policy hooks before a sandbox side effect

```ts
export type Context<ToolName extends Name = Name> = Readonly<{
  /** default sandbox working directory */
  cwd: string;
  /** sandbox the tool will operate on */
  sandbox: Sandbox;
  /** tool currently being checked */
  tool: ToolName;
}>;
```

#### `Policy`

async policy hook for checking tool input before execution

```ts
export type Policy<Input, ToolName extends Name = Name> = (
  input: Input,
  context: Context<ToolName>
) => Promise<void> | void;
```

#### `Options`

options for creating AI-ready sandbox tools and prompt context

```ts
export type Options = Readonly<{
  /**
   * tools exposed to the model
   *
   * @default ["read", "write", "list", "exec"] plus "preview" when ports are supported
   */
  allow?: readonly Name[];
  /** policy hook called before command execution */
  beforeExec?: Policy<Exec, "exec">;
  /** policy hook called before directory listing */
  beforeList?: Policy<Partial<Path>, "list">;
  /** policy hook called before preview URL exposure */
  beforePreview?: Policy<Preview, "preview">;
  /** policy hook called before file reads */
  beforeRead?: Policy<Path, "read">;
  /** policy hook called before file writes */
  beforeWrite?: Policy<Write, "write">;
  /** working directory described to the agent and used by commands */
  cwd?: string;
  /**
   * maximum stdout and stderr characters returned by the exec tool
   *
   * @default 20000
   */
  maxOutput?: number;
  /**
   * default command timeout in milliseconds for agent executions
   *
   * @default 30000
   */
  timeout?: number;
}>;
```

#### `Kit`

AI tool kit with prompt context and a minimal agent sandbox shape

```ts
export type Kit = Readonly<{
  /** prompt context describing the sandbox, capabilities, and limits */
  description: string;
  /** minimal sandbox object for agent integrations that accept an executeCommand shape */
  sandbox: AgentSandbox;
  /** AI SDK compatible tools keyed by enabled tool name */
  tools: Tools;
}>;
```

#### `AgentSandbox`

small sandbox description object for agents that support executeCommand

```ts
export type AgentSandbox = Readonly<{
  /** advertised sandbox capabilities */
  capabilities: Sandbox["capabilities"];
  /** prompt context describing the sandbox */
  description: string;
  /** run a shell command using the normalized sandbox process API */
  executeCommand(input: Command): Promise<CommandResult>;
  /** provider name */
  provider: string;
  /** default working directory */
  workingDirectory: string;
}>;
```

#### `Tools`

```ts
export type Tools = Readonly<Draft>;
```

#### `Exec`

command input accepted by the exec tool and exec policy

```ts
export type Exec = Readonly<{
  /** argv arguments when running an executable directly */
  args?: readonly string[];
  /** shell command or executable name */
  command: string;
  /** working directory inside the sandbox */
  cwd?: string;
  /** command environment variables */
  env?: Readonly<Record<string, string>>;
}>;
```

#### `Command`

command input used by AI SDK agent integrations

```ts
export type Command = Readonly<{
  /** abort signal forwarded to sandbox command execution */
  abortSignal?: AbortSignal;
  /** shell command to run */
  command: string;
  /** working directory inside the sandbox */
  workingDirectory?: string;
}>;
```

#### `CommandResult`

command result returned by the agent sandbox shape

```ts
export type CommandResult = Readonly<{
  /** command exit code */
  exitCode: number;
  /** buffered stderr */
  stderr: string;
  /** buffered stdout */
  stdout: string;
}>;
```

#### `Path`

path input accepted by read and shared path policies

```ts
export type Path = Readonly<{
  /** file or directory path inside the sandbox */
  path: string;
}>;
```

#### `Write`

write input accepted by the write tool and write policy

```ts
export type Write = Readonly<{
  /** file path inside the sandbox */
  path: string;
  /** utf-8 text to write */
  text: string;
}>;
```

#### `Preview`

preview input accepted by the preview tool and preview policy

```ts
export type Preview = Readonly<{
  /** sandbox port to expose */
  port: number;
}>;
```

#### `ExecResult`

result returned by the exec tool

```ts
export type ExecResult = Readonly<{
  /** command exit code */
  code: number;
  /** true when the command exited successfully */
  ok: boolean;
  /** termination signal when reported by the provider */
  signal?: string;
  /** buffered and capped stderr */
  stderr: string;
  /** buffered and capped stdout */
  stdout: string;
}>;
```

#### `ListResult`

result returned by the list tool

```ts
export type ListResult = Readonly<{
  /** directory entries returned by the sandbox files API */
  entries: Awaited<ReturnType<Sandbox["files"]["list"]>>;
}>;
```

#### `TextResult`

result returned by the read tool

```ts
export type TextResult = Readonly<{
  /** file text */
  text: string;
}>;
```

#### `WriteResult`

result returned by the write tool

```ts
export type WriteResult = Readonly<{
  /** always true when the write succeeded */
  ok: true;
}>;
```

#### `PreviewResult`

result returned by the preview tool

```ts
export type PreviewResult = Readonly<{
  /** exposed preview URL */
  url: string;
}>;
```

### functions

#### `tools`

create AI SDK compatible tools and prompt context for a sandbox

```ts
export declare const tools: (sandbox: Sandbox, options?: Options) => Kit;
```

## @sandbox-sdk/blaxel

Blaxel adapter for Sandbox SDK

### types

#### `Blaxel`

blaxel adapter configuration

```ts
export type Blaxel = Readonly<
  Pick<
    BlaxelConfig,
    | "apiKey"
    | "apikey"
    | "clientCredentials"
    | "disableH2"
    | "proxy"
    | "workspace"
  > & {
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** default environment variables applied when creating a sandbox */
    env?: Readonly<Record<string, string>>;
    /** sandbox expiration time forwarded to blaxel */
    expires?: Date;
    /** default blaxel image for new sandboxes */
    image?: string;
    /** default metadata labels attached to new sandboxes */
    labels?: Readonly<Record<string, string>>;
    /** blaxel lifecycle configuration forwarded to the native sdk */
    lifecycle?: SandboxCreateConfiguration["lifecycle"];
    /** blaxel memory allocation in mib */
    memory?: number;
    /** stable sandbox name for create or reconnect workflows */
    name?: string;
    /** blaxel network configuration forwarded to the native sdk */
    network?: SandboxCreateConfiguration["network"];
    /** extra blaxel sandbox create options */
    options?: Omit<
      SandboxCreateConfiguration,
      | "envs"
      | "expires"
      | "image"
      | "labels"
      | "lifecycle"
      | "memory"
      | "name"
      | "network"
      | "ports"
      | "region"
      | "ttl"
    >;
    /** ports declared at create time and later exposed through previews */
    ports?: readonly number[];
    /** blaxel region such as `us-pdx-1` */
    region?: string;
    /** verify basic filesystem access after creation */
    safe?: boolean;
    /** enable blaxel provider snapshot behavior for the sandbox runtime */
    snapshotEnabled?: boolean;
    /** sandbox ttl string forwarded to blaxel, such as `24h` */
    ttl?: string;
  }
>;
```

### functions

#### `blaxel`

create a blaxel adapter with normalized sandbox operations

```ts
export declare const blaxel: (options?: Blaxel) => Adapter<Raw>;
```

## @sandbox-sdk/cloudflare

Cloudflare Sandbox adapter for Sandbox SDK

### types

#### `Cloudflare`

Cloudflare Sandbox adapter configuration

```ts
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
```

### functions

#### `cloudflare`

create a Cloudflare Sandbox adapter from a Worker binding

```ts
export declare const cloudflare: (options: Cloudflare) => Adapter<Raw>;
```

### re-exports

#### `re-export`

```ts
export type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
```

## @sandbox-sdk/codesandbox

CodeSandbox adapter for Sandbox SDK

### types

#### `CodeSandbox`

codesandbox adapter configuration

```ts
export type CodeSandbox = Readonly<{
  /** existing codesandbox sdk client for tests or custom transport */
  client?: Sdk;
  /** options forwarded to the codesandbox sdk constructor */
  clientOptions?: ClientOptions;
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** sandbox description shown in codesandbox */
  description?: string;
  /** default environment variables injected into the sdk session */
  env?: Readonly<Record<string, string>>;
  /** country hint forwarded when starting the vm */
  ipcountry?: CreateOptions["ipcountry"];
  /** custom sandbox path inside the codesandbox workspace */
  path?: string;
  /** sandbox preview privacy */
  privacy?: CreateOptions["privacy"];
  /** sdk session options forwarded to `sandbox.connect` */
  session?: Omit<SessionOptions, "env">;
  /** stop behavior used by `sandbox.stop` */
  stop?: "delete" | "disconnect" | "hibernate" | "shutdown";
  /** codesandbox tags added when creating a sandbox */
  tags?: readonly string[];
  /** template sandbox id used for new sandboxes */
  template?: string;
  /** sandbox title shown in codesandbox */
  title?: string;
  /** api token. falls back to CSB_API_KEY */
  token?: string;
  /** vm tier forwarded when starting the vm */
  vmTier?: CreateOptions["vmTier"];
}>;
```

### functions

#### `codesandbox`

create a codesandbox adapter with normalized sandbox operations

```ts
export declare const codesandbox: (options?: CodeSandbox) => Adapter<Raw>;
```

## @sandbox-sdk/daytona

Daytona adapter for Sandbox SDK

### types

#### `Daytona`

Daytona adapter configuration

```ts
export type Daytona = DaytonaConfig &
  Readonly<{
    /** archive idle sandbox after this many minutes when supported by Daytona */
    autoArchiveInterval?: number;
    /** delete archived sandbox after this many minutes when supported by Daytona */
    autoDeleteInterval?: number;
    /** stop idle sandbox after this many minutes when supported by Daytona */
    autoStopInterval?: number;
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** delete the Daytona sandbox instead of stopping it during cleanup */
    deleteOnStop?: boolean;
    /** default environment variables applied when creating a sandbox */
    env?: Readonly<Record<string, string>>;
    /** image name or Daytona Image used to create the sandbox */
    image?: string | Image;
    /** labels attached to new sandboxes */
    labels?: Readonly<Record<string, string>>;
    /** Daytona code language label for created sandboxes */
    language?: CodeLanguage | string;
    /** stable Daytona sandbox name used when create input omits id */
    name?: string;
    /** outbound network allow list passed to Daytona */
    networkAllowList?: string;
    /** block outbound network access when supported by Daytona */
    networkBlockAll?: boolean;
    /** signed preview url expiration in seconds */
    previewExpires?: number;
    /** make the Daytona sandbox public when supported */
    public?: boolean;
    /** resource request for new sandboxes */
    resources?: Resources;
    /** use signed preview urls instead of standard preview links */
    signedPreview?: boolean;
    /** Daytona snapshot id used when create input omits snapshot */
    snapshot?: string;
    /** create, stop, and delete timeout in milliseconds */
    timeout?: number;
    /** linux user used for supported Daytona operations */
    user?: string;
  }>;
```

### functions

#### `daytona`

create a Daytona adapter with normalized sandbox operations

```ts
export declare const daytona: (options?: Daytona) => Adapter<Raw>;
```

## @sandbox-sdk/e2b

E2B adapter for Sandbox SDK

### types

#### `E2B`

e2b adapter configuration

```ts
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
```

### functions

#### `e2b`

create an E2B adapter with normalized sandbox operations

```ts
export declare const e2b: (options?: E2B) => Adapter<Raw>;
```

## @sandbox-sdk/modal

Modal Sandbox adapter for Sandbox SDK

### types

#### `Modal`

modal adapter configuration

```ts
export type Modal = Readonly<
  ModalSdk.ModalClientParams & {
    /** modal app name used for new sandboxes */
    app?: string;
    /** existing modal client for custom transport, tests, or advanced auth */
    client?: ModalSdk.ModalClient;
    /** create the modal app if it does not exist */
    createAppIfMissing?: boolean;
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** default environment variables applied when creating a sandbox */
    env?: Readonly<Record<string, string>>;
    /** modal image object or registry tag used for new sandboxes */
    image?: ModalSdk.Image | string;
    /** modal sandbox create options forwarded to the native sdk */
    options?: Omit<
      ModalSdk.SandboxCreateParams,
      "encryptedPorts" | "env" | "timeoutMs" | "workdir"
    >;
    /** encrypted ports declared at create time and later exposed with ports.expose */
    ports?: readonly number[];
    /** default tags attached to new sandboxes */
    tags?: Readonly<Record<string, string>>;
    /** sandbox lifetime timeout in milliseconds */
    timeout?: number;
  }
>;
```

### functions

#### `modal`

create a modal sandbox adapter with normalized sandbox operations

```ts
export declare const modal: (options?: Modal) => Adapter<Raw>;
```

## @sandbox-sdk/vercel

Vercel Sandbox adapter for Sandbox SDK

### types

#### `Source`

source used to seed a new Vercel sandbox

```ts
export type Source =
  | Readonly<{
      /** shallow clone depth for git sources */
      depth?: number;
      /** git branch, tag, or commit to check out */
      revision?: string;
      type: "git";
      /** public git repository url */
      url: string;
    }>
  | Readonly<{
      /** shallow clone depth for private git sources */
      depth?: number;
      /** password or token for the private git source */
      password: string;
      /** git branch, tag, or commit to check out */
      revision?: string;
      type: "git";
      /** private git repository url */
      url: string;
      /** username for the private git source */
      username: string;
    }>
  | Readonly<{
      type: "tarball";
      /** tarball url used as the sandbox source */
      url: string;
    }>;
```

#### `Resources`

Vercel sandbox resource request

```ts
export type Resources = Readonly<{
  /** requested virtual cpu count */
  vcpus: number;
}>;
```

#### `Vercel`

Vercel sandbox adapter configuration

```ts
export type Vercel = Readonly<{
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** default environment variables applied when creating a sandbox */
  env?: Readonly<Record<string, string>>;
  /** custom fetch implementation passed to @vercel/sandbox */
  fetch?: typeof fetch;
  /** Vercel network policy for the sandbox */
  networkPolicy?: NetworkPolicy;
  /** ports declared at create time and later exposed with ports.expose */
  ports?: readonly number[];
  /** Vercel project id; falls back to VERCEL_PROJECT_ID when using access-token auth */
  projectId?: string;
  /** resource request for new sandboxes */
  resources?: Resources;
  /** Vercel runtime id such as node24 or python3.13 */
  runtime?: string;
  /** git or tarball source used for new sandboxes */
  source?: Source;
  /** run commands with sudo when supported by Vercel Sandbox */
  sudo?: boolean;
  /** Vercel team id; falls back to VERCEL_TEAM_ID when using access-token auth */
  teamId?: string;
  /** sandbox lifetime timeout in milliseconds */
  timeout?: number;
  /** Vercel access token; falls back to VERCEL_TOKEN */
  token?: string;
}>;
```

### functions

#### `vercel`

create a Vercel Sandbox adapter with normalized sandbox operations

```ts
export declare const vercel: (options?: Vercel) => Adapter<Raw>;
```

#### `vercelSandbox`

alias for users who prefer the explicit provider name

```ts
export declare const vercelSandbox: (options?: Vercel) => Adapter<Raw>;
```
