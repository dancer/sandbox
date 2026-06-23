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
  | "environment"
  | "files"
  | "fileStreaming"
  | "ports"
  | "process"
  | "processExec"
  | "processSpawn"
  | "snapshotCreate"
  | "snapshotDelete"
  | "snapshotRestore"
  | "snapshotSource"
  | "streaming";
```

#### `RawCapability`

provider-specific capabilities available through `sandbox.raw`

```ts
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
```

#### `Mode`

generic capability mode vocabulary for raw capabilities and custom type composition

```ts
export type Mode =
  | boolean
  | "buffered"
  | "combined"
  | "configured"
  | "create-time"
  | "derived"
  | "disk"
  | "dynamic"
  | "filesystem"
  | "memory"
  | "native"
  | "separate"
  | "volume";
```

#### `CapabilityModes`

allowed modes for each normalized capability

```ts
export type CapabilityModes = Readonly<{
  /** sandbox creation environment support */
  environment: boolean | "separate";
  /** file delivery behavior for `files.stream()` */
  fileStreaming: boolean | "buffered" | "native";
  /** normalized filesystem support */
  files: boolean;
  /** preview port exposure behavior */
  ports: boolean | "create-time" | "derived" | "dynamic";
  /** normalized process namespace support */
  process: boolean;
  /** one-shot process execution support */
  processExec: boolean;
  /** lifecycle-safe background process support */
  processSpawn: boolean | "separate";
  /** normalized snapshot creation behavior */
  snapshotCreate: boolean | "disk" | "filesystem" | "memory" | "volume";
  /** snapshot deletion support */
  snapshotDelete: boolean;
  /** normalized in-place snapshot restore behavior */
  snapshotRestore: boolean | "disk" | "filesystem" | "memory" | "volume";
  /** fresh sandbox creation from a snapshot behavior */
  snapshotSource: boolean | "create-time";
  /** background process output stream behavior */
  streaming: boolean | "combined" | "separate";
}>;
```

#### `Capabilities`

provider capability map used by `supports`, `capabilityMode`, and docs

snapshot create, delete, restore, and source capabilities are intentionally
separate because providers do not expose the same snapshot lifecycle

each normalized capability only accepts its own documented modes

```ts
export type Capabilities = Readonly<
  Partial<CapabilityModes> & {
    /** provider-specific powers available through `sandbox.raw` */
    raw?: Partial<Record<RawCapability, Mode>>;
  }
>;
```

#### `Input`

file write input accepted by every adapter

readable streams are consumed once by the receiving operation

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
  /** stdout stream when the provider exposes stdout separately */
  stdout?: ReadableStream<Uint8Array>;
  /** stderr stream when the provider exposes stderr separately */
  stderr?: ReadableStream<Uint8Array>;
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
  /** read a file as a byte stream and check `fileStreaming` before relying on incremental delivery */
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
```

#### `Ports`

normalized preview URL namespace

```ts
export type Ports = Readonly<{
  /** expose a sandbox port and return a provider-aware preview; adapters reject options they cannot honor */
  expose(port: number, options?: Port): Promise<Preview>;
}>;
```

#### `Snapshots`

normalized snapshot namespace for capability-gated state capture

check snapshot capabilities independently because creating a snapshot does
not imply an adapter can restore or delete one

```ts
export type Snapshots = Readonly<{
  /** create a snapshot, optionally naming it when the provider persists snapshot names */
  create(name?: string): Promise<Snapshot>;
  /** delete a snapshot when `snapshotDelete` is supported */
  delete(id: string): Promise<void>;
  /** restore a snapshot when `snapshotRestore` is supported */
  restore(id: string): Promise<void>;
}>;
```

#### `Url`

serializable preview endpoint returned by a low-level adapter

```ts
export type Url = Readonly<{
  /** public or local URL for the exposed port */
  url: string;
  /** exposed sandbox port */
  port: number;
}>;
```

#### `SandboxRuntimePreview`

preview endpoint returned by a low-level adapter before public wrapping

```ts
export type SandboxRuntimePreview = Readonly<
  Url & {
    /** provider headers attached only through `Preview.request()` and never exposed on the public preview object */
    headers?: Readonly<Record<string, string>>;
  }
>;
```

#### `PreviewOptions`

private provider options used by the `preview()` helper

```ts
export type PreviewOptions = Readonly<{
  /** provider headers applied only when `Preview.request` runs and override caller-supplied values */
  headers?: Readonly<Record<string, string>>;
  /** provider name used when preview request validation fails */
  provider?: string;
}>;
```

#### `Preview`

provider-aware preview returned by `ports.expose`

`request` adds provider-required access headers without exposing them in returned data. it preserves provider URL query parameters, so treat provider-issued signed or tokenized urls as credentials. redirects are manual by default because provider credentials must not leave the preview origin

**example**

```ts
const preview = await sandbox.ports.expose(3000);
const response = await preview.request("/health");
```

```ts
export type Preview = Readonly<
  Url & {
    /** request a same-origin preview path with provider-required access headers and query parameters; use `redirect: "manual"` or `"error"` because automatic redirects are rejected */
    request(path?: string, init?: RequestInit): Promise<Response>;
  }
>;
```

#### `Snapshot`

snapshot identifier returned by `snapshots.create`

```ts
export type Snapshot = Readonly<{
  /** provider snapshot id */
  id: string;
  /** provider-persisted snapshot name when supported; may differ from the requested label */
  name?: string;
}>;
```

#### `Exec`

command execution options shared by exec, shell, spawn, and spawnShell

command environments apply only to that process and are not adapter credentials
command strings and argv are forwarded to the provider, so use paths relative
to `cwd` when portable command behavior matters

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

preview URL options supported by one or more adapters

adapters reject unsupported values instead of silently ignoring them. custom domains and other provider-specific preview controls stay on adapter options or `sandbox.raw`

```ts
export type Port = Readonly<{
  /** preview http(s) protocol preference when supported, use typed provider options or `sandbox.raw` for tcp tunnels */
  protocol?: "http" | "https";
  /** provider-issued preview URL token when the adapter supports it; treat it as a bearer credential */
  token?: string;
}>;
```

#### `Sandbox`

normalized sandbox instance returned by every adapter

use `capabilities` before optional operations and `raw` only when the
provider-specific capability is explicitly needed

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
  /** raw provider object for advanced provider-specific usage outside the normalized contract */
  raw: Raw;
  /** snapshot operations gated by capabilities */
  snapshots: Snapshots;
  /** stop, destroy, or release the sandbox according to adapter semantics */
  stop(): Promise<void>;
}>;
```

#### `SandboxRuntimeFiles`

stream-first filesystem contract for low-level provider adapters

```ts
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
```

#### `SandboxRuntimeProcess`

process contract for low-level provider adapters

```ts
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
```

#### `SandboxRuntimePorts`

preview url contract for low-level provider adapters

```ts
export type SandboxRuntimePorts = Readonly<{
  /** expose a sandbox port and keep provider access headers inside the public preview request wrapper */
  expose(port: number, options?: Port): Promise<SandboxRuntimePreview>;
}>;
```

#### `SandboxRuntime`

low-level vendor contract that keeps large I/O stream-first

adapter authors should implement this contract and use `fromSandboxRuntime`
instead of buffering provider I/O in an adapter

```ts
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
```

#### `Adapter`

provider adapter contract implemented by each package

adapter configuration belongs in the factory and per-sandbox configuration
belongs in `create`

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

individual adapters document which options they support and how they map to
their provider

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

optional cause metadata used by normalized errors

```ts
export type Cause = Readonly<{
  /** original provider, runtime, or platform failure */
  cause?: unknown;
}>;
```

#### `Timer`

runtime timeout handle type used across browser and node targets

```ts
export type Timer = ReturnType<typeof setTimeout>;
```

#### `Code`

normalized error code for sandbox sdk failures

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

normalized error emitted by public sandbox sdk operations

use `code` for portable error handling and `provider` to identify the adapter
that raised the error

```ts
export declare class SandboxError extends Error {
  /** stable sandbox sdk error code for portable error handling */
  readonly code: Code;
  /** adapter provider name when the failing operation is provider-specific */
  readonly provider?: string;
  /** create a normalized error from an adapter or public helper */
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

return whether a value is a normalized sandbox sdk error

use this instead of matching provider-specific error messages when handling
errors from multiple adapters

```ts
export declare const isSandboxError: (error: unknown) => error is SandboxError;
```

#### `create`

create a sandbox through an adapter

adapter configuration stays on the adapter and per-sandbox options stay in
`input`, keeping provider setup separate from a single sandbox request

```ts
export declare const create: <Raw = unknown>(
  input: Options & {
    adapter: Adapter<Raw>;
  }
) => Promise<Sandbox<Raw>>;
```

#### `withSandbox`

create a sandbox, run work, and always attempt cleanup

use this for short-lived work where retaining the sandbox after the callback
completes would be unexpected

**example**

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

const result = await withSandbox({ adapter: local() }, (sandbox) =>
  sandbox.process.shell("printf hello")
);
```

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
export declare const capabilityMode: <Key extends Capability>(
  subject: {
    capabilities: Capabilities;
  },
  capability: Key
) => Exclude<CapabilityModes[Key], false | undefined> | undefined;
```

#### `unsupported`

throw a normalized unsupported feature error

```ts
export declare const unsupported: (provider: string, feature: string) => never;
```

#### `requireCapability`

require a capability and throw a typed unsupported error when missing

```ts
export declare const requireCapability: <Key extends Capability>(
  subject: {
    capabilities: Capabilities;
    provider?: string;
  },
  capability: Key
) => Exclude<CapabilityModes[Key], false | undefined>;
```

#### `supports`

true when a subject advertises a capability

```ts
export declare const supports: <Key extends Capability>(
  subject: {
    capabilities: Capabilities;
  },
  capability: Key
) => boolean;
```

#### `rawCapabilityMode`

return the advertised mode for a provider-specific raw capability

```ts
export declare const rawCapabilityMode: <Key extends RawCapability>(
  subject: {
    capabilities: Capabilities;
  },
  capability: Key
) =>
  | Exclude<NonNullable<Capabilities["raw"]>[Key], false | undefined>
  | undefined;
```

#### `requireRawCapability`

require a provider-specific raw capability and throw when missing

```ts
export declare const requireRawCapability: <Key extends RawCapability>(
  subject: {
    capabilities: Capabilities;
    provider?: string;
  },
  capability: Key
) => Exclude<NonNullable<Capabilities["raw"]>[Key], false | undefined>;
```

#### `supportsRaw`

true when a provider-specific feature is available through `sandbox.raw`

```ts
export declare const supportsRaw: <Key extends RawCapability>(
  subject: {
    capabilities: Capabilities;
  },
  capability: Key
) => boolean;
```

#### `port`

validate and return a normalized tcp port number

```ts
export declare const port: (value: number, provider?: string) => number;
```

#### `preview`

create a provider-aware preview with access headers kept out of serializable data

adapter authors pass provider-required request headers here instead of placing credentials in the returned url. requests are limited to the preview origin and handle redirects manually

```ts
export declare const preview: (
  url: string,
  value: number,
  options?: PreviewOptions
) => Preview;
```

#### `portOptions`

validate options against an adapter's provider-derived preview URL

call this before provider work when URL tokens or a chosen protocol are unavailable. custom domains stay on adapter-specific configuration or `sandbox.raw`

```ts
export declare const portOptions: (
  provider: string,
  options: Port | undefined,
  protocol?: "http" | "https"
) => void;
```

#### `duration`

validate and return a normalized millisecond duration

```ts
export declare const duration: (
  value?: number,
  provider?: string,
  name?: string
) => number | undefined;
```

#### `sandboxError`

create a normalized provider error

```ts
export declare const sandboxError: (
  provider: string,
  message: string,
  code?: Code,
  cause?: unknown
) => SandboxError;
```

#### `abort`

throw a normalized aborted error for an adapter operation

```ts
export declare const abort: (provider: string, cause?: unknown) => never;
```

#### `bytes`

normalize supported file input into text or bytes

passing a readable stream consumes it exactly once

```ts
export declare const bytes: (input: Input) => Promise<Uint8Array | string>;
```

#### `text`

decode supported file input as utf-8 text

passing a readable stream consumes it exactly once

```ts
export declare const text: (input: Input) => Promise<string>;
```

#### `sandboxPath`

resolve a sandbox path against the sandbox cwd

```ts
export declare const sandboxPath: (cwd: string, value?: string) => string;
```

#### `fromSandboxRuntime`

lift a stream-first provider runtime into the public sandbox api

adapter authors implement this lower-level contract to preserve streaming
for large files and processes while callers receive the normalized api

```ts
export declare const fromSandboxRuntime: <Raw = unknown>(
  input: SandboxRuntime<Raw>
) => Sandbox<Raw>;
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
  signal?: AbortSignal,
  provider?: string
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

configuration for the local adapter

local runs commands on the host in an owned directory and is not an isolation
boundary for untrusted code

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
   * existing symlinks must resolve inside this root
   *
   * when omitted, the adapter creates a temporary directory
   */
  root?: string;
}>;
```

### functions

#### `local`

create a local adapter that runs in an owned host directory

local is not an isolation boundary for untrusted code. preview URLs always use the local HTTP host for the requested port

```ts
export declare const local: (options?: Local) => Adapter<Raw>;
```

## @sandbox-sdk/ai

Agent tool helpers for Sandbox SDK

### types

#### `JsonSchema`

json schema payload exposed to the AI SDK

```ts
export type JsonSchema = Readonly<Record<string, unknown>>;
```

#### `Schema`

version-neutral standard schema accepted by AI SDK v6 and v7

```ts
export type Schema<Input = unknown> = Readonly<{
  /** json schema payload used by providers and other agent SDKs */
  jsonSchema: JsonSchema;
  /** standard schema contract used by supported AI SDK versions */
  "~standard": Readonly<{
    /** schema adapter used by standard schema consumers */
    jsonSchema: Readonly<{
      /** return the json schema for accepted input */
      input(): JsonSchema;
      /** return the json schema for produced output */
      output(): JsonSchema;
    }>;
    /** compile-time input and output types for standard schema consumers */
    types?: Readonly<{
      /** input type accepted by the schema */
      input: Input;
      /** output type produced by the schema */
      output: Input;
    }>;
    /** validate unknown input and return the parsed value */
    validate(value: unknown): Readonly<{
      /** validated schema value */
      value: Input;
    }>;
    /** standard schema vendor identifier */
    vendor: "sandbox-sdk";
    /** standard schema protocol version */
    version: 1;
  }>;
}>;
```

#### `Tool`

provider-agnostic tool shape compatible with supported AI SDK versions

```ts
export type Tool<Input, Output> = Readonly<{
  /** prompt-facing tool description */
  description: string;
  /** AI SDK-compatible input schema */
  inputSchema: Schema<Input>;
  /** true when model output should match the schema exactly */
  strict: true;
  /** tool implementation */
  execute(input: Input, options?: unknown): Promise<Output>;
}>;
```

#### `Name`

built-in sandbox tool name

```ts
export type Name = "exec" | "list" | "preview" | "read" | "write";
```

#### `Context`

context passed to a generated tool policy hook before its sandbox operation

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

options for creating model-facing sandbox tools and AI SDK prompt context

the allowlist and file policies apply only to generated tools. `beforeExec`
also applies to session commands. custom AI SDK tools that call
`kit.sandbox` own their authorization boundary

```ts
export type Options = Readonly<{
  /**
   * generated tools exposed to the model
   *
   * requested tools unavailable on the selected sandbox are omitted rather than exposed as calls that fail at runtime
   *
   * @default ["read", "list"]
   */
  allow?: readonly Name[];
  /** policy hook called before generated and session command execution */
  beforeExec?: Policy<Exec, "exec">;
  /** policy hook called before the generated directory listing tool */
  beforeList?: Policy<Partial<Path>, "list">;
  /** policy hook called before the generated preview tool */
  beforePreview?: Policy<Preview, "preview">;
  /** policy hook called before the generated file read tool */
  beforeRead?: Policy<Path, "read">;
  /** policy hook called before the generated file write tool */
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

agent-ready sandbox tools, prompt context, and an AI SDK session

pass this to `aisdk()` for AI SDK v6 and v7 generation calls. `tools` are
model-facing, while `sandbox` is for trusted custom tool callbacks

```ts
export type Kit = Readonly<{
  /** agent-facing context describing the workspace, capabilities, and limits */
  description: string;
  /** sandbox session for AI SDK tool execution */
  sandbox: SandboxSession;
  /** AI SDK-compatible tools keyed by enabled tool name */
  tools: Tools;
}>;
```

#### `AisdkOptions`

options ready to spread into AI SDK v6 or v7 generation calls

AI SDK v6 uses `tools` and `system`. AI SDK v7 also passes
`experimental_sandbox` to custom tool execution

```ts
export type AisdkOptions = Readonly<{
  /** sandbox session forwarded to AI SDK tool execution */
  experimental_sandbox: SandboxSession;
  /** ToolLoopAgent instructions describing the sandbox, available tools, and safety limits */
  instructions: string;
  /** system prompt context describing the sandbox, available tools, and safety limits */
  system: string;
  /** AI SDK-compatible tool set */
  tools: Tools;
}>;
```

#### `SandboxSession`

agent-facing sandbox session compatible with the AI SDK sandbox contract

this restricted session omits host-only lifecycle, networking, and raw
provider controls from `Sandbox`. session methods reject capabilities the
adapter does not advertise before provider work. the generated tool allowlist
does not constrain direct session methods, so custom tools must enforce their own policy

```ts
export type SandboxSession = Readonly<{
  /** normalized capabilities advertised by the underlying sandbox */
  capabilities: Sandbox["capabilities"];
  /** agent-facing sandbox context, including workspace, tools, and limits */
  description: string;
  /** adapter provider name */
  provider: string;
  /** read one file as a byte stream, returning null when it does not exist */
  readFile(input: File): PromiseLike<ReadableStream<Uint8Array> | null>;
  /** read one file as bytes, returning null when it does not exist */
  readBinaryFile(input: File): PromiseLike<Uint8Array | null>;
  /**
   * read one decoded text file, returning null when it does not exist
   *
   * line ranges are 1-based and inclusive, with `endLine` clamped at EOF
   */
  readTextFile(input: TextFile): PromiseLike<string | null>;
  /** run a shell command and return buffered stdout and stderr */
  run(input: Command): PromiseLike<CommandResult>;
  /** start a shell command and return a streaming process handle */
  spawn(input: Command): PromiseLike<SandboxProcess>;
  /** default working directory used when an input does not provide one */
  workingDirectory: string;
  /** write one file from a byte stream */
  writeFile(input: FileWrite): PromiseLike<void>;
  /** write one file from bytes */
  writeBinaryFile(input: BinaryFileWrite): PromiseLike<void>;
  /** write one text file */
  writeTextFile(input: TextFileWrite): PromiseLike<void>;
}>;
```

#### `SandboxBackend`

host-owned sandbox infrastructure kept outside the AI SDK session contract

```ts
export type SandboxBackend<Raw = unknown> = Sandbox<Raw>;
```

#### `NetworkSandboxSession`

host-owned AI SDK session with a separate infrastructure backend

this is itself compatible with the AI SDK sandbox contract. call
`restricted()` before passing a session to untrusted tool execution so raw
provider controls, lifecycle, and networking remain host-owned

```ts
export type NetworkSandboxSession<Raw = unknown> = SandboxSession &
  Readonly<{
    /** host-owned sandbox infrastructure and provider-specific raw controls */
    backend: SandboxBackend<Raw>;
    /** provider sandbox id for host lifecycle and persistence bookkeeping */
    id: string;
    /** default working directory for commands without an explicit override */
    defaultWorkingDirectory: string;
    /** return the bare AI SDK sandbox session without host-owned infrastructure */
    restricted(): SandboxSession;
  }>;
```

#### `SandboxProcess`

streaming process handle compatible with the current AI SDK sandbox contract

consume `stdout` and `stderr` as web streams, then call `wait()` to observe
the exit code. `kill()` is idempotent. `spawn()` rejects when the provider
cannot expose separate stdout and stderr streams

```ts
export type SandboxProcess = Readonly<{
  /** bytes written by the process to standard error */
  stderr: ReadableStream<Uint8Array>;
  /** bytes written by the process to standard output */
  stdout: ReadableStream<Uint8Array>;
  /** terminate the process, safely allowing repeated calls */
  kill(): PromiseLike<void>;
  /** resolve after the process exits with its exit code */
  wait(): PromiseLike<
    Readonly<{
      /** process exit code */
      exitCode: number;
    }>
  >;
}>;
```

#### `Tools`

AI SDK-compatible sandbox tools keyed by the enabled tool name

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
  /** environment variables for this command */
  env?: Readonly<Record<string, string>>;
  /** working directory inside the sandbox */
  workingDirectory?: string;
}>;
```

#### `File`

file read input used by the AI SDK sandbox shape

```ts
export type File = Readonly<{
  /** abort signal checked before and after the filesystem operation */
  abortSignal?: AbortSignal;
  /** absolute or sandbox-relative file path */
  path: string;
}>;
```

#### `TextFile`

text file read input used by the AI SDK sandbox shape

```ts
export type TextFile = File &
  Readonly<{
    /** 1-based inclusive final line, clamped to EOF when it exceeds the file */
    endLine?: number;
    /** text encoding used to decode the file, defaulting to utf-8 */
    encoding?: string;
    /** 1-based inclusive first line, defaulting to the first file line */
    startLine?: number;
  }>;
```

#### `FileWrite`

file stream write input used by the AI SDK sandbox shape

```ts
export type FileWrite = File &
  Readonly<{
    /** byte stream to write */
    content: ReadableStream<Uint8Array>;
  }>;
```

#### `BinaryFileWrite`

binary file write input used by the AI SDK sandbox shape

```ts
export type BinaryFileWrite = File &
  Readonly<{
    /** bytes to write */
    content: Uint8Array;
  }>;
```

#### `TextFileWrite`

text file write input used by the AI SDK sandbox shape

```ts
export type TextFileWrite = File &
  Readonly<{
    /** text to write */
    content: string;
    /** utf-8 text encoding accepted by the normalized filesystem contract */
    encoding?: string;
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
  /** preview URL; treat provider-issued signed or tokenized urls as credentials */
  url: string;
}>;
```

### functions

#### `aisdk`

create AI SDK v6/v7 call options from a sandbox tool kit

**example**

```ts
const sandbox = await create({ adapter: local() });
const kit = tools(sandbox, { allow: ["read", "write", "exec"] });
const result = await generateText({
  model,
  ...aisdk(kit),
  prompt: "inspect the workspace",
});
```

```ts
export declare const aisdk: (kit: Kit) => AisdkOptions;
```

#### `tools`

create model-facing sandbox tools, prompt context, and an AI SDK session

**example**

```ts
const kit = tools(sandbox, {
  allow: ["read", "write", "exec"],
  beforeExec: (input) => {
    if (input.command.includes("rm -rf")) throw new Error("command blocked");
  },
});
```

```ts
export declare const tools: (sandbox: Sandbox, options?: Options) => Kit;
```

#### `network`

create a host-owned AI SDK session with a restricted agent view

**example**

```ts
const session = network(sandbox);
const preview = await session.backend.ports.expose(3000);
const agentSession = session.restricted();
```

```ts
export declare const network: <Raw>(
  sandbox: Sandbox<Raw>,
  options?: Options
) => NetworkSandboxSession<Raw>;
```

## @sandbox-sdk/ai/claude

Agent tool helpers for Sandbox SDK

### types

#### `ToolAnnotations`

annotations accepted by Claude Agent SDK MCP tool definitions

```ts
export type ToolAnnotations = NonNullable<SdkMcpToolDefinition["annotations"]>;
```

#### `ClaudeResult`

MCP tool result returned by generated Claude sandbox handlers

```ts
export type ClaudeResult = Readonly<{
  /** MCP text content returned to Claude Agent SDK */
  content: readonly Readonly<{
    /** serialized sandbox result or error message */
    text: string;
    /** MCP content kind */
    type: "text";
  }>[];
  /** true when the tool execution failed */
  isError?: true;
  /** structured result preserved alongside the text content */
  structuredContent?: Record<string, unknown>;
}>;
```

#### `ClaudeTool`

generated Claude MCP tool exposed for advanced composition and inspection

```ts
export type ClaudeTool = Readonly<{
  /** MCP tool annotations that describe safety and side-effect behavior */
  annotations?: ToolAnnotations;
  /** model-facing tool description */
  description: string;
  /** execute the generated handler with MCP input */
  handler(input: unknown, extra: unknown): Promise<ClaudeResult>;
  /** MCP input schema supplied to Claude Agent SDK */
  inputSchema: unknown;
  /** MCP tool name without the server prefix */
  name: string;
}>;
```

#### `ClaudeTools`

generated Claude Agent SDK integration for one sandbox tool kit

pass `mcpServers`, `allowedTools`, `canUseTool`, and `instructions` to a
Claude Agent SDK query configuration

```ts
export type ClaudeTools = Readonly<{
  /** all MCP tool names exposed by the sandbox server */
  availableTools: readonly string[];
  /** tool names that run without an approval prompt */
  allowedTools: readonly string[];
  /** permission callback ready for query({ options: { canUseTool } }) */
  canUseTool: CanUseTool;
  /** prompt context for query({ options: { systemPrompt } }) */
  instructions: string;
  /** MCP server map ready for query({ options: { mcpServers } }) */
  mcpServers: Readonly<Record<string, McpSdkServerConfigWithInstance>>;
  /** true when the named tool should require approval */
  needsApproval(toolName: string): boolean;
  /** raw in-process MCP server config */
  server: McpSdkServerConfigWithInstance;
  /** MCP server name used in mcp__<server>__<tool> names */
  serverName: string;
  /** raw MCP tool definitions for advanced composition and tests */
  tools: readonly ClaudeTool[];
}>;
```

#### `ClaudeOptions`

options for adapting a sandbox tool kit to the Claude Agent SDK

```ts
export type ClaudeOptions = Readonly<{
  /**
   * per-tool annotations merged onto the generated MCP tools
   *
   * use this when your app wants to tune read-only, destructive, or idempotent hints
   */
  annotations?: Readonly<Partial<Record<Name, ToolAnnotations>>>;
  /**
   * approval policy for generated side-effect tools
   *
   * @default true for exec, preview, and write, false for read and list
   */
  requireApproval?: Approval;
  /**
   * in-process MCP server name
   *
   * @default "sandbox"
   */
  serverName?: string;
  /**
   * MCP server version metadata
   *
   * @default "1.0.0"
   */
  serverVersion?: string;
}>;
```

### functions

#### `claude`

create Claude Agent SDK in-process MCP tools from a sandbox tool kit

**example**

```ts
const integration = claude(
  tools(sandbox, { allow: ["read", "write", "exec"] })
);
const stream = query({
  prompt: "inspect the workspace",
  options: {
    allowedTools: integration.allowedTools,
    canUseTool: integration.canUseTool,
    mcpServers: integration.mcpServers,
  },
});
```

```ts
export declare const claude: (
  kit: Kit,
  { annotations, requireApproval, serverName, serverVersion }?: ClaudeOptions
) => ClaudeTools;
```

## @sandbox-sdk/ai/openai

Agent tool helpers for Sandbox SDK

### types

#### `OpenAITools`

generated OpenAI Agents SDK function tools keyed by sandbox tool name

```ts
export type OpenAITools = Readonly<Partial<Record<Name, FunctionTool>>>;
```

#### `OpenAI`

OpenAI Agents SDK configuration derived from one sandbox tool kit

pass `instructions` to `new Agent()` and `Object.values(tools)` as its tools

```ts
export type OpenAI = Readonly<{
  /** instructions ready for new Agent({ instructions }) */
  instructions: string;
  /** tools ready for new Agent({ tools: Object.values(openai.tools) }) */
  tools: OpenAITools;
}>;
```

#### `OpenAIOptions`

options for adapting a sandbox tool kit to the OpenAI Agents SDK

```ts
export type OpenAIOptions = Readonly<{
  /**
   * prefix for tool names sent to the model
   *
   * @default "sandbox"
   */
  prefix?: string;
  /**
   * approval policy for generated side-effect tools
   *
   * @default true for exec, preview, and write, false for read and list
   */
  requireApproval?: Approval;
}>;
```

### functions

#### `openai`

create OpenAI Agents SDK tools from a sandbox tool kit

**example**

```ts
const integration = openai(
  tools(sandbox, { allow: ["read", "write", "exec"] })
);
const agent = new Agent({
  instructions: integration.instructions,
  tools: Object.values(integration.tools),
});
```

```ts
export declare const openai: (
  kit: Kit,
  { prefix, requireApproval }?: OpenAIOptions
) => OpenAI;
```

## @sandbox-sdk/blaxel

Blaxel adapter for Sandbox SDK

### types

#### `BlaxelRaw`

native Blaxel sandbox exposed as `sandbox.raw`

use this for provider-specific behavior that does not belong in the normalized contract

```ts
export type BlaxelRaw = SandboxInstance;
```

#### `Blaxel`

configure a Blaxel adapter

explicit configuration takes precedence over environment values and provider credentials are never forwarded into the sandbox environment
`@blaxel/core` keeps connection settings process-global, so do not use different Blaxel workspaces or credential sets concurrently in one process

**example**

```ts
blaxel({ workspace: "acme", apiKey: process.env.BL_API_KEY });
```

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
    /** default environment variables for new sandboxes; rejects BL_API_KEY and BL_CLIENT_CREDENTIALS to prevent credential forwarding */
    env?: Readonly<Record<string, string>>;
    /** application-owned identifier stored with the new Blaxel sandbox and usable with `SandboxInstance.getByExternalId` */
    externalId?: string;
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
      | "externalId"
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
      | "volumes"
    >;
    /** ports declared at create time and later exposed through previews; Blaxel reserves port 80 for system operations */
    ports?: readonly number[];
    /** blaxel region such as `us-pdx-1` */
    region?: string;
    /** verify basic filesystem access after creation */
    safe?: boolean;
    /** enable blaxel provider snapshot behavior for the sandbox runtime */
    snapshotEnabled?: boolean;
    /** sandbox ttl string forwarded to blaxel, such as `24h` */
    ttl?: string;
    /** blaxel volumes mounted into the sandbox at creation time */
    volumes?: SandboxCreateConfiguration["volumes"];
  }
>;
```

### functions

#### `updateNetwork`

replace the network configuration for a running Blaxel sandbox and return its refreshed native instance

**example**

```ts
await updateNetwork(sandbox.raw, {
  proxy: { allowedDomains: ["api.example.com"], routing: [] },
});
```

```ts
export declare const updateNetwork: (
  sandbox: Raw | string,
  network: SandboxUpdateNetwork["network"]
) => Promise<Raw>;
```

#### `updateTtl`

replace or request clearing the ttl for a running Blaxel sandbox and return its refreshed native instance
workspace quota tiers can still enforce a ttl after a clear request

**example**

```ts
await updateTtl(sandbox.raw, "1h");
```

```ts
export declare const updateTtl: (
  sandbox: Raw | string,
  ttl: string | null
) => Promise<Raw>;
```

#### `updateLifecycle`

replace or clear the lifecycle configuration for a running Blaxel sandbox and return its refreshed native instance

**example**

```ts
await updateLifecycle(sandbox.raw, {
  expirationPolicies: [{ action: "delete", type: "ttl-idle", value: "1h" }],
});
```

```ts
export declare const updateLifecycle: (
  sandbox: Raw | string,
  lifecycle: SandboxLifecycle | null
) => Promise<Raw>;
```

#### `blaxel`

create a Blaxel adapter with normalized sandbox operations

use `sandbox.raw.previews` for private previews, preview tokens, URL prefixes, and custom domains

```ts
export declare const blaxel: (options?: Blaxel) => Adapter<Raw>;
```

## @sandbox-sdk/cloudflare

Cloudflare Sandbox adapter for Sandbox SDK

### types

#### `CloudflareBridgeFetch`

minimal Fetch API contract accepted by Cloudflare bridge requests

```ts
export type CloudflareBridgeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
```

#### `CloudflareBridgeJson`

generic JSON object returned by bridge utility routes

```ts
export type CloudflareBridgeJson = Readonly<Record<string, unknown>>;
```

#### `CloudflareBridgeTunnel`

public tunnel returned by the Cloudflare bridge

quick tunnels omit `name`, while named tunnels always include the requested DNS label

```ts
export type CloudflareBridgeTunnel =
  | Readonly<{
      /** bridge tunnel id */
      id: string;
      /** port exposed inside the sandbox */
      port: number;
      /** public HTTPS tunnel URL */
      url: string;
      /** public tunnel hostname */
      hostname: string;
      /** ISO timestamp when the bridge created the tunnel */
      createdAt: string;
      /** named tunnel label used for a stable Cloudflare hostname */
      name: string;
    }>
  | Readonly<{
      /** bridge tunnel id */
      id: string;
      /** port exposed inside the sandbox */
      port: number;
      /** public HTTPS tunnel URL */
      url: string;
      /** public tunnel hostname */
      hostname: string;
      /** ISO timestamp when the bridge created the tunnel */
      createdAt: string;
      /** quick tunnels do not have a named DNS label */
      name?: never;
    }>;
```

#### `CloudflareBridgeTunnelOptions`

options for creating a Cloudflare bridge tunnel

```ts
export type CloudflareBridgeTunnelOptions = Readonly<{
  /** optional DNS label for a stable named tunnel */
  name?: string;
}>;
```

#### `CloudflareBridgeRaw`

advanced bridge operations exposed as `sandbox.raw`

this is a bridge-specific contract, not the normalized snapshot or process api

```ts
export type CloudflareBridgeRaw = Readonly<{
  /** create a bridge-managed sandbox and return its id */
  create(): Promise<
    Readonly<{
      /** bridge sandbox id */
      id: string;
    }>
  >;
  /** permanently delete a bridge-managed sandbox */
  delete(id: string): Promise<void>;
  /** fetch implementation used for bridge requests */
  fetch: CloudflareBridgeFetch;
  /** query the bridge health endpoint */
  health(): Promise<CloudflareBridgeJson>;
  /** restore a bridge workspace archive into a sandbox */
  hydrate(id: string, archive: Input): Promise<void>;
  /** mount object storage into a bridge sandbox */
  mount(id: string, input: CloudflareBridgeMount): Promise<void>;
  /** read the bridge OpenAPI document */
  openapi(): Promise<CloudflareBridgeJson>;
  /** bridge prewarm pool controls */
  pool: Readonly<{
    /** prewarm bridge sandbox capacity */
    prime(): Promise<void>;
    /** shut down bridge prewarmed sandboxes */
    shutdownPrewarmed(): Promise<void>;
    /** return bridge prewarm pool statistics */
    stats(): Promise<CloudflareBridgeJson>;
  }>;
  /** export the bridge workspace as a tar archive */
  persist(id: string, options?: CloudflareBridgePersist): Promise<Uint8Array>;
  /** return WebSocket connection details for an interactive terminal */
  pty(id: string, options?: CloudflareBridgePty): CloudflareBridgePtyConnection;
  /** make an authenticated request to an arbitrary bridge route */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** return whether a bridge sandbox is still running */
  running(id: string): Promise<boolean>;
  /** bridge tunnel controls */
  tunnels: Readonly<{
    /**
     * create or return a public HTTPS tunnel for an already-listening sandbox port
     *
     * ports must be integers from 1024 through 65535, excluding 3000. pass `name` only when the bridge Worker is configured for named tunnels
     */
    get(
      id: string,
      port: number,
      options?: CloudflareBridgeTunnelOptions
    ): Promise<CloudflareBridgeTunnel>;
    /** delete a tunnel and its tracked named-tunnel resources when present */
    destroy(id: string, port: number): Promise<void>;
  }>;
  /** bridge execution session controls */
  session: Readonly<{
    /** create an execution session scoped to one sandbox */
    create(
      id: string,
      options?: CloudflareBridgeSession
    ): Promise<
      Readonly<{
        /** bridge execution session id */
        id: string;
      }>
    >;
    /** delete one execution session */
    delete(id: string, session: string): Promise<void>;
  }>;
  /** detach a mounted object-storage bucket from a sandbox */
  unmount(id: string, mountPath: string): Promise<void>;
  /** configured bridge base URL */
  url: string;
}>;
```

#### `CloudflareBridge`

Cloudflare Sandbox bridge adapter configuration

```ts
export type CloudflareBridge = Readonly<{
  /**
   * deployed bridge base URL
   *
   * falls back to `SANDBOX_API_URL`
   */
  url?: string;
  /**
   * bearer token for the bridge
   *
   * falls back to `SANDBOX_API_KEY`
   */
  token?: string;
  /**
   * default sandbox working directory below `/workspace`
   *
   * relative values resolve below `/workspace`, custom directories are created, and paths outside it are rejected before bridge work
   *
   * @default "/workspace"
   */
  cwd?: string;
  /**
   * default environment variables for bridge execution sessions
   *
   * create input values override these defaults. values are copied into the bridge sandbox, so pass only values the sandbox may use. `SANDBOX_API_KEY` is rejected because it authenticates the bridge
   */
  env?: Readonly<Record<string, string>>;
  /** custom fetch implementation for tests or non-standard runtimes */
  fetch?: CloudflareBridgeFetch;
  /** stable sandbox id used when create input omits id */
  id?: string;
  /**
   * optional DNS label for normalized named tunnel previews
   *
   * use it for one named tunnel or as the fallback for one port not listed in `tunnels`. named tunnels require the bridge Worker to have Cloudflare account and zone credentials
   */
  tunnel?: string;
  /** named tunnel labels keyed by port. entries override `tunnel` and labels must be unique within one sandbox */
  tunnels?: CloudflareTunnelNames;
}>;
```

#### `CloudflareBridgePtyConnection`

connection details for the bridge PTY WebSocket route

```ts
export type CloudflareBridgePtyConnection = Readonly<{
  /** headers to pass when the WebSocket client supports custom headers */
  headers: Readonly<Record<string, string>>;
  /** WebSocket URL for `/v1/sandbox/:id/pty` */
  url: string;
}>;
```

#### `CloudflareBridgePersist`

options for `sandbox.raw.persist()`

```ts
export type CloudflareBridgePersist = Readonly<{
  /** workspace-relative paths to exclude from the tar archive */
  excludes?: readonly string[];
}>;
```

#### `CloudflareBridgeSession`

options for creating a bridge execution session

```ts
export type CloudflareBridgeSession = Readonly<{
  /** custom session id */
  id?: string;
  /** initial working directory */
  cwd?: string;
  /** session-scoped environment variables */
  env?: Readonly<Record<string, string>>;
}>;
```

#### `CloudflareBridgeMount`

options for mounting an object-storage bucket through the bridge

```ts
export type CloudflareBridgeMount = Readonly<{
  /** bucket name or Worker R2 binding name */
  bucket: string;
  /** absolute mount path inside the sandbox */
  mountPath: string;
  /** bridge mount options forwarded to Cloudflare */
  options?: Readonly<Record<string, unknown>>;
}>;
```

#### `CloudflareBridgePty`

options for the raw bridge PTY WebSocket route

```ts
export type CloudflareBridgePty = Readonly<{
  /** terminal width in columns */
  cols?: number;
  /** terminal height in rows */
  rows?: number;
  /** bridge session id used to scope the terminal */
  session?: string;
  /** shell binary to run inside the terminal */
  shell?: string;
}>;
```

#### `CloudflareTunnelNames`

named Cloudflare tunnel labels keyed by sandbox port. labels must be unique within one sandbox

```ts
export type CloudflareTunnelNames = Readonly<Record<number, string>>;
```

#### `CloudflareRaw`

native Cloudflare Sandbox object exposed as `sandbox.raw` for Worker-only features

```ts
export type CloudflareRaw = Native;
```

#### `CloudflareBinding`

Cloudflare Worker Durable Object namespace for a native Sandbox class

```ts
export type CloudflareBinding<
  ProviderRaw extends CloudflareRaw = CloudflareRaw,
> = DurableObjectNamespace<ProviderRaw>;
```

#### `CloudflareBackups`

native Cloudflare R2 backup options for normalized filesystem snapshots

`dir` is the sandbox cwd and `name` comes from `snapshots.create(name?)`
configure `BACKUP_BUCKET` and production R2 credentials on the Worker before enabling this

```ts
export type CloudflareBackups = Readonly<Omit<BackupOptions, "dir" | "name">>;
```

#### `Cloudflare`

Cloudflare Worker-native Sandbox adapter configuration

`ProviderRaw` is inferred from `binding`, so `sandbox.raw` keeps the exact native Cloudflare Sandbox environment type

use `cloudflareBridge()` for a deployed HTTP bridge outside a Cloudflare Worker

```ts
export type Cloudflare<ProviderRaw extends CloudflareRaw = CloudflareRaw> =
  Readonly<{
    /** required Durable Object binding for the Cloudflare Sandbox class, usually `env.Sandbox` */
    binding: CloudflareBinding<ProviderRaw>;
    /** configured R2 backups that enable normalized filesystem snapshot create and restore */
    backups?: CloudflareBackups;
    /**
     * default working directory for normalized file and process operations
     *
     * @default "/workspace"
     */
    cwd?: string;
    /**
     * default environment variables written to the selected sandbox
     *
     * values cross the Worker-to-sandbox trust boundary. pass only secrets the sandbox may use, and keep host-only credentials behind a Worker proxy
     */
    env?: Readonly<Record<string, string>>;
    /** stable sandbox id used when create input omits id */
    id?: string;
    /** list options forwarded to Cloudflare `listFiles` */
    list?: ListFilesOptions;
    /**
     * optional named tunnel label with lowercase letters, digits, and internal hyphens
     *
     * use it for one named tunnel or as the fallback for one port not listed in `tunnels`. named tunnels require Worker-side API token, account, and zone configuration
     */
    tunnel?: string;
    /** named tunnel labels keyed by port. entries override `tunnel` and labels must be unique within one sandbox */
    tunnels?: CloudflareTunnelNames;
    /**
     * low-level options forwarded to `getSandbox`, with the current RPC transport enforced
     *
     * normalized commands are sessionless by default. set `enableDefaultSession: true` only when native raw operations need shared shell state
     */
    options?: Omit<SandboxOptions, "transport">;
  }>;
```

### functions

#### `cloudflareBridge`

create a Cloudflare Sandbox adapter that talks to the official HTTP bridge

`ports.expose()` creates an ephemeral HTTPS quick tunnel by default. configure `tunnel` for one named port or `tunnels` for per-port labels when the bridge Worker has the required Cloudflare credentials

```ts
export declare const cloudflareBridge: (
  options?: CloudflareBridge
) => Adapter<CloudflareBridgeRaw>;
```

#### `cloudflare`

create a Cloudflare Sandbox adapter from a Worker binding

`sandbox.raw` preserves the native Sandbox type from `binding` and defaults to `CloudflareRaw`

```ts
export declare const cloudflare: <
  ProviderRaw extends CloudflareRaw = CloudflareRaw,
>(
  options: Cloudflare<ProviderRaw>
) => Adapter<ProviderRaw>;
```

## @sandbox-sdk/codesandbox

CodeSandbox adapter for Sandbox SDK

### types

#### `CodeSandboxRaw`

native CodeSandbox sdk, sandbox, and connected session exposed as `sandbox.raw`

use raw for provider-specific lifecycle updates, browser sessions, preview token management, terminals, interpreters, tasks, setup state, and file watching

use `clientOptions` to customize transport without losing native raw types

```ts
export type CodeSandboxRaw = Readonly<{
  /** native CodeSandbox client used to manage sandbox records */
  client: NativeClient;
  /** native sandbox instance connected through the active session */
  sandbox: NativeSandbox;
  /** native SDK instance used for provider-wide operations */
  sdk: NativeSdk;
}>;
```

#### `CodeSandbox`

CodeSandbox adapter configuration

pass a native CodeSandbox client when reusing an existing client or custom fetch transport

```ts
export type CodeSandbox = Readonly<{
  /** wakeup behavior for hibernated CodeSandbox VMs */
  automaticWakeupConfig?: CreateOptions["automaticWakeupConfig"];
  /** existing native CodeSandbox sdk client for dependency injection or custom fetch transport */
  client?: CodeSandboxRaw["sdk"];
  /** options forwarded to the codesandbox sdk constructor */
  clientOptions?: ClientOptions;
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** sandbox description shown in codesandbox */
  description?: string;
  /** default environment variables injected into the sdk session; rejects CSB_API_KEY to prevent credential forwarding */
  env?: Readonly<Record<string, string>>;
  /** country hint forwarded when starting the vm */
  ipcountry?: CreateOptions["ipcountry"];
  /** custom sandbox path inside the codesandbox workspace */
  path?: string;
  /** sandbox preview privacy for newly created sandboxes */
  privacy?: CreateOptions["privacy"];
  /** sdk session options forwarded to `sandbox.connect`; custom ids must be 20 characters or less */
  session?: Omit<SessionOptions, "env">;
  /**
   * lifecycle action used by `sandbox.stop`
   *
   * hibernate keeps a memory snapshot for resume. shutdown starts from a clean boot on the next resume, while delete permanently removes the sandbox
   */
  stop?: "delete" | "disconnect" | "hibernate" | "shutdown";
  /** codesandbox tags added when creating a sandbox */
  tags?: readonly string[];
  /**
   * template sandbox id used for new sandboxes
   *
   * create input template or snapshot overrides this default and creates a new sandbox instead of resuming one
   */
  template?: string;
  /** default idle hibernation timeout in milliseconds for new sandboxes, rounded up to a whole second */
  timeout?: number;
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

create a CodeSandbox adapter with normalized sandbox operations

create with id resumes an existing sandbox. create with template or snapshot starts a new sandbox from an existing sandbox id. normalized snapshot creation hibernates the source and returns its id for a later create. CodeSandbox does not persist arbitrary snapshot names, so call `snapshots.create()` without a name

```ts
export declare const codesandbox: (
  options?: CodeSandbox
) => Adapter<CodeSandboxRaw>;
```

## @sandbox-sdk/daytona

Daytona adapter for Sandbox SDK

### types

#### `DaytonaRaw`

native Daytona sandbox object exposed as `sandbox.raw`

use `updateNetworkSettings` for dynamic outbound network policy changes on
Daytona Tier 3 and Tier 4 targets

**example**

```ts
await sandbox.raw.updateNetworkSettings({ networkBlockAll: true });
await sandbox.raw.updateNetworkSettings({ networkBlockAll: false });
```

```ts
export type DaytonaRaw = DaytonaSandbox;
```

#### `Daytona`

Daytona adapter configuration

```ts
export type Daytona = DaytonaConfig &
  Readonly<{
    /** archive a stopped sandbox after this many minutes; Daytona requires a non-negative integer */
    autoArchiveInterval?: number;
    /** delete a stopped sandbox after this many minutes; use -1 to disable or 0 to delete immediately */
    autoDeleteInterval?: number;
    /** stop an idle sandbox after this many minutes; use 0 to disable */
    autoStopInterval?: number;
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** delete the Daytona sandbox instead of stopping it during cleanup */
    deleteOnStop?: boolean;
    /** default environment variables for new sandboxes; rejects DAYTONA_API_KEY and DAYTONA_JWT_TOKEN to prevent credential forwarding */
    env?: Readonly<Record<string, string>>;
    /** make the Daytona sandbox ephemeral; Daytona forces autoDeleteInterval to 0 */
    ephemeral?: boolean;
    /** image name or Daytona Image used to create the sandbox */
    image?: string | Image;
    /** labels attached to new sandboxes */
    labels?: Readonly<Record<string, string>>;
    /** Daytona code language label for created sandboxes */
    language?: CodeLanguage | string;
    /** existing ephemeral sandbox id or name used for runner co-location; requires autoDeleteInterval: 0, usually through ephemeral: true */
    linkedSandbox?: string;
    /** stable Daytona sandbox name used when create input omits id */
    name?: string;
    /** outbound network allow list passed to Daytona at sandbox creation */
    networkAllowList?: string;
    /** block outbound network access at sandbox creation when supported by Daytona */
    networkBlockAll?: boolean;
    /** signed preview URL expiration in seconds; set explicitly because Daytona defaults to 60 seconds */
    previewExpires?: number;
    /** make the Daytona sandbox public when supported */
    public?: boolean;
    /** resource request for new sandboxes */
    resources?: Resources;
    /** use a self-contained signed preview URL for external clients; `preview.request()` handles standard private preview headers */
    signedPreview?: boolean;
    /** Daytona snapshot id used when create input omits snapshot */
    snapshot?: string;
    /** stream Daytona image snapshot build logs during image-based sandbox creation */
    snapshotLogs?: (chunk: string) => void;
    /** create, stop, and delete timeout in milliseconds */
    timeout?: number;
    /** linux user used for supported Daytona operations */
    user?: string;
    /** Daytona volumes mounted into the created sandbox */
    volumes?: readonly VolumeMount[];
  }>;
```

### functions

#### `daytona`

create a Daytona adapter with normalized sandbox operations

standard private previews work through `preview.request()`, which retains Daytona's preview token. standard tokens reset when a sandbox restarts, so expose the port again after restart. set `signedPreview` only when an external client needs a self-contained URL

```ts
export declare const daytona: (options?: Daytona) => Adapter<Raw>;
```

## @sandbox-sdk/e2b

E2B adapter for Sandbox SDK

### types

#### `E2BRaw`

native E2B sandbox object exposed as `sandbox.raw`

`preview.request()` adds `trafficAccessToken` when E2B restricts preview traffic

```ts
export type E2BRaw = E2BSandbox;
```

#### `E2B`

e2b adapter configuration

```ts
export type E2B = Readonly<{
  /** e2b access token, usually used for template and account operations */
  accessToken?: string;
  /** additional headers sent to the E2B control plane */
  apiHeaders?: Readonly<Record<string, string>>;
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
  /** default environment variables for new sandboxes; rejects E2B_API_KEY and E2B_ACCESS_TOKEN to prevent credential forwarding */
  env?: Readonly<Record<string, string>>;
  /** integration identifier appended to the E2B user agent */
  integration?: string;
  /** e2b lifecycle behavior such as pause or kill when timeout is reached */
  lifecycle?: SandboxLifecycle;
  /** metadata attached to new sandboxes */
  metadata?: Readonly<Record<string, string>>;
  /** e2b mcp gateway configuration enabled for new sandboxes */
  mcp?: McpServer;
  /** E2B network policy for outbound traffic and previews; `preview.request()` retains traffic access credentials for restricted previews */
  network?: SandboxNetworkOpts;
  /** request timeout in milliseconds for e2b api calls */
  requestTimeout?: number;
  /** HTTP proxy used for E2B control-plane and sandbox requests */
  proxy?: string;
  /** custom sandbox url for advanced or debug deployments */
  sandboxUrl?: string;
  /** secure sandbox controller traffic when supported by e2b */
  secure?: boolean;
  /**
   * e2b template id or template name used when the create input omits `template`
   *
   * pass snapshot ids through `create({ snapshot })` so snapshot state stays distinct from provider templates
   */
  template?: string;
  /** sandbox lifetime timeout in milliseconds */
  timeout?: number;
  /** linux user used for file and command operations */
  user?: string;
  /** validate the E2B API key format before provider requests */
  validateApiKey?: boolean;
  /** e2b volume mounts keyed by sandbox mount path */
  volumeMounts?: Readonly<Record<string, Volume | string>>;
}>;
```

### functions

#### `e2b`

create an E2B adapter with normalized sandbox operations

E2B snapshots capture filesystem and memory state. creation briefly pauses the source sandbox and drops active command, pty, and WebSocket connections. create a fresh sandbox with `create({ snapshot })`; in-place restore is not normalized
named snapshots return E2B's provider-persisted canonical name, which can include a namespace and tag

`ports.expose()` returns E2B's derived HTTP or HTTPS URL. when `network.allowPublicTraffic` is false, `preview.request()` adds E2B's traffic access header without exposing it in serializable data

```ts
export declare const e2b: (options?: E2B) => Adapter<Raw>;
```

## @sandbox-sdk/modal

Modal Sandbox adapter for Sandbox SDK

### types

#### `ModalRaw`

native Modal sandbox object exposed as `sandbox.raw`

```ts
export type ModalRaw = ModalSdk.Sandbox;
```

#### `Modal`

modal adapter configuration

```ts
export type Modal = Readonly<
  ModalSdk.ModalClientParams & {
    /** modal app name used for new sandboxes */
    app?: string;
    /** block all sandbox network access */
    blockNetwork?: CreateParams["blockNetwork"];
    /** cloud provider placement forwarded to Modal */
    cloud?: CreateParams["cloud"];
    /** cloud bucket mounts attached to the sandbox */
    cloudBucketMounts?: CreateParams["cloudBucketMounts"];
    /** entrypoint command for the sandbox main process */
    command?: CreateParams["command"];
    /** existing modal client for custom transport, tests, or advanced auth */
    client?: ModalSdk.ModalClient;
    /** create the modal app if it does not exist */
    createAppIfMissing?: boolean;
    /** modal sandbox cpu reservation */
    cpu?: CreateParams["cpu"];
    /** modal sandbox cpu hard limit */
    cpuLimit?: CreateParams["cpuLimit"];
    /**
     * custom domain for Modal sandbox connections
     *
     * use a Modal-provisioned domain. it applies when the sandbox is created, not per `ports.expose()` call
     */
    customDomain?: CreateParams["customDomain"];
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** default environment variables for new sandboxes; rejects MODAL_TOKEN_ID and MODAL_TOKEN_SECRET to prevent credential forwarding */
    env?: Readonly<Record<string, string>>;
    /** experimental Modal sandbox create options forwarded to the native sdk */
    experimentalOptions?: CreateParams["experimentalOptions"];
    /** Modal GPU reservation such as `T4` or `A100-80GB:4` */
    gpu?: CreateParams["gpu"];
    /** extra encrypted HTTP/2 tunnel ports forwarded to Modal */
    h2Ports?: CreateParams["h2Ports"];
    /** include Modal OIDC identity token inside the sandbox */
    includeOidcIdentityToken?: CreateParams["includeOidcIdentityToken"];
    /** inbound CIDR allowlist for Modal tunnels and connect tokens */
    inboundCidrAllowlist?: CreateParams["inboundCidrAllowlist"];
    /** idle termination timeout in milliseconds */
    idleTimeout?: number;
    /** modal image object or registry tag used for new sandboxes */
    image?: ModalSdk.Image | string;
    /** modal sandbox memory reservation in mib */
    memoryMiB?: CreateParams["memoryMiB"];
    /** modal sandbox memory hard limit in mib */
    memoryLimitMiB?: CreateParams["memoryLimitMiB"];
    /** optional Modal sandbox name */
    name?: CreateParams["name"];
    /** published Modal image name, optionally including a tag; cannot be combined with image */
    namedImage?: string;
    /** modal sandbox create options forwarded to the native sdk */
    options?: Omit<
      ModalSdk.SandboxCreateParams,
      "encryptedPorts" | "env" | "timeoutMs" | "workdir"
    >;
    /** outbound CIDR allowlist for sandbox network access */
    outboundCidrAllowlist?: CreateParams["outboundCidrAllowlist"];
    /** outbound domain allowlist with optional wildcard prefixes such as *.example.com */
    outboundDomainAllowlist?: CreateParams["outboundDomainAllowlist"];
    /**
     * encrypted ports declared for new sandboxes at create time
     *
     * reconnecting by id discovers existing Modal tunnels without repeating this option
     */
    ports?: readonly number[];
    /** enable a pty for the Modal sandbox entrypoint */
    pty?: CreateParams["pty"];
    /** Modal proxy used in front of the sandbox */
    proxy?: CreateParams["proxy"];
    /** readiness probe used before Modal marks the sandbox ready */
    readinessProbe?: CreateParams["readinessProbe"];
    /** Modal regions used for sandbox placement */
    regions?: CreateParams["regions"];
    /** Modal secrets injected as sandbox environment variables */
    secrets?: CreateParams["secrets"];
    /** filesystem snapshot timeout in milliseconds, rounded up to a whole second */
    snapshotTimeout?: number;
    /** filesystem snapshot retention as whole seconds in milliseconds, or null for no expiry */
    snapshotTtl?: number | null;
    /** stop behavior used by `sandbox.stop` */
    stop?: "detach" | "terminate";
    /** default tags attached to new sandboxes */
    tags?: Readonly<Record<string, string>>;
    /** sandbox lifetime timeout in milliseconds */
    timeout?: number;
    /** unencrypted tunnel ports forwarded to Modal */
    unencryptedPorts?: CreateParams["unencryptedPorts"];
    /** enable verbose Modal sandbox logging */
    verbose?: CreateParams["verbose"];
    /** Modal volumes mounted into the sandbox */
    volumes?: CreateParams["volumes"];
  }
>;
```

### functions

#### `modal`

create a Modal sandbox adapter with normalized file, command, port, and filesystem snapshot operations

filesystem snapshots return an image id for a new sandbox through the shared snapshot create option. Modal does not persist arbitrary snapshot names, so call `snapshots.create()` without a name. in-place restore and normalized background process handles are unavailable

use Modal create options and `sandbox.raw` for provider-specific private tunnels and direct TCP controls

```ts
export declare const modal: (options?: Modal) => Adapter<Raw>;
```

## @sandbox-sdk/vercel

Vercel Sandbox adapter for Sandbox SDK

### types

#### `VercelRaw`

native Vercel Sandbox object exposed as `sandbox.raw` for provider-specific controls

```ts
export type VercelRaw = VercelSandbox;
```

#### `VercelFetch`

minimal Fetch API contract accepted by Vercel Sandbox requests

accepts standard fetch implementations and test doubles without requiring runtime-specific static members

```ts
export type VercelFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
```

#### `Source`

source used to seed a new Vercel sandbox

```ts
export type Source =
  | Readonly<{
      /** positive integer shallow clone depth for git sources */
      depth?: number;
      /** git branch, tag, or commit to check out */
      revision?: string;
      /** git source discriminator */
      type: "git";
      /** public git repository url */
      url: string;
    }>
  | Readonly<{
      /** positive integer shallow clone depth for private git sources */
      depth?: number;
      /** password or token for the private git source */
      password: string;
      /** git branch, tag, or commit to check out */
      revision?: string;
      /** git source discriminator */
      type: "git";
      /** private git repository url */
      url: string;
      /** username for the private git source */
      username: string;
    }>
  | Readonly<{
      /** tarball source discriminator */
      type: "tarball";
      /** tarball url used as the sandbox source */
      url: string;
    }>;
```

#### `Resources`

Vercel Sandbox resource request

each requested vcpu includes 2048 MB of memory, subject to Vercel plan limits

```ts
export type Resources = Readonly<{
  /** requested positive integer virtual cpu count, subject to Vercel plan limits */
  vcpus: number;
}>;
```

#### `Runtime`

Vercel Sandbox runtime identifier

the string fallback accepts a newer Vercel runtime before this package is updated

```ts
export type Runtime =
  | "node26"
  | "node24"
  | "node22"
  | "python3.13"
  | (string & {
      readonly __vercelRuntime?: never;
    });
```

#### `KeepLastSnapshots`

Vercel Sandbox snapshot retention policy

```ts
export type KeepLastSnapshots = Readonly<{
  /** number of snapshots to retain, from 1 through 10 */
  count: number;
  /** expiration in milliseconds applied to retained snapshots, with zero disabling expiration */
  expiration?: number;
  /** delete evicted snapshots immediately instead of keeping their default expiration */
  deleteEvicted?: boolean;
}>;
```

#### `Fork`

Vercel Sandbox fork source

Vercel uses the source sandbox's current snapshot when one exists. stop or
snapshot the source before forking to copy filesystem state. without a
snapshot, Vercel copies configuration into a fresh runtime. forks inherit
the source runtime and cannot select a runtime override

```ts
export type Fork = Readonly<{
  /** named source sandbox whose current snapshot and configuration seed the fork */
  sourceSandbox: string;
}>;
```

#### `Vercel`

Vercel Sandbox adapter configuration

authentication uses `VERCEL_OIDC_TOKEN` when present or `token`, `teamId`, and
`projectId` together for explicit access-token authentication

```ts
export type Vercel = Readonly<{
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** default process environment for create, fork, and get-or-create; rejects VERCEL_OIDC_TOKEN and VERCEL_TOKEN */
  env?: Readonly<Record<string, string>>;
  /** custom fetch implementation passed to `@vercel/sandbox` */
  fetch?: VercelFetch;
  /**
   * fork every new sandbox from an existing named Vercel sandbox
   *
   * cannot be combined with `runtime`, `source`, `getOrCreate`, or create input
   * `id`, `snapshot`, or `template` because those select a different native creation path
   */
  fork?: Fork | string;
  /** reuse a named sandbox when present and create it when absent */
  getOrCreate?: boolean;
  /** retention policy for snapshots created by this sandbox */
  keepLastSnapshots?: KeepLastSnapshots;
  /** provider sandbox name used when the create input does not supply an id */
  name?: string;
  /** outbound network policy for the sandbox, including optional Vercel transformations */
  networkPolicy?: NetworkPolicy;
  /** initial public ports, with create input values taking precedence and a Vercel maximum of four unique ports per sandbox */
  ports?: readonly number[];
  /**
   * control automatic filesystem restoration between Vercel sandbox sessions
   *
   * Vercel defaults to `true`. set `false` when resumed sessions must start without restored files. use durable storage for artifacts that must outlive the sandbox
   */
  persistent?: boolean;
  /** Vercel project id; falls back to VERCEL_PROJECT_ID when using access-token auth */
  projectId?: string;
  /** resource request for new sandboxes */
  resources?: Resources;
  /** Vercel runtime id such as node26, node24, node22, or python3.13 */
  runtime?: Runtime;
  /** signal that cancels sandbox creation, get, get-or-create, or fork requests */
  signal?: AbortSignal;
  /** git or tarball source used for new sandboxes */
  source?: Source;
  /** run normalized commands with sudo when supported by Vercel Sandbox */
  sudo?: boolean;
  /** default expiration in milliseconds for snapshots created through the normalized API */
  snapshotExpiration?: number;
  /** metadata tags attached to the Vercel sandbox, merged with create metadata and limited to five unique keys */
  tags?: Readonly<Record<string, string>>;
  /** Vercel team id; falls back to VERCEL_TEAM_ID when using access-token auth */
  teamId?: string;
  /** requested sandbox lifetime in milliseconds, subject to Vercel plan limits */
  timeout?: number;
  /** Vercel access token; falls back to VERCEL_TOKEN */
  token?: string;
  /** called with the native sandbox when a named get-or-create sandbox is newly created */
  onCreate?: (sandbox: VercelRaw) => Promise<void>;
  /** called with the native sandbox when a named sandbox session resumes */
  onResume?: (sandbox: VercelRaw) => Promise<void>;
}>;
```

### functions

#### `vercel`

create a Vercel Sandbox adapter with normalized sandbox operations

Vercel does not persist arbitrary snapshot names, so call `snapshots.create()` without a name

```ts
export declare const vercel: (options?: Vercel) => Adapter<Raw>;
```
