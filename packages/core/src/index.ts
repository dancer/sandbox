export type Capability =
  | "files"
  | "process"
  | "ports"
  | "snapshots"
  | "secrets"
  | "environment"
  | "streaming";

export type Capabilities = Readonly<Partial<Record<Capability, boolean>>>;

export type Input =
  | string
  | Uint8Array
  | ArrayBuffer
  | Blob
  | ReadableStream<Uint8Array>;

export type Entry = Readonly<{
  path: string;
  kind: "file" | "directory";
  size?: number;
  modified?: Date;
}>;

export type Result = Readonly<{
  code: number;
  signal?: string;
  stdout: string;
  stderr: string;
}>;

export type Process = Readonly<{
  exec(
    command: string,
    args?: readonly string[],
    options?: Exec
  ): Promise<Result>;
  spawn(
    command: string,
    args?: readonly string[],
    options?: Spawn
  ): Promise<Running>;
}>;

export type Running = Readonly<{
  id: string;
  output: ReadableStream<Uint8Array>;
  result: Promise<Result>;
  kill(signal?: string): Promise<void>;
}>;

export type Files = Readonly<{
  read(path: string): Promise<Uint8Array>;
  text(path: string): Promise<string>;
  write(path: string, input: Input): Promise<void>;
  list(path?: string): Promise<readonly Entry[]>;
  remove(path: string): Promise<void>;
}>;

export type Ports = Readonly<{
  expose(port: number, options?: Port): Promise<Url>;
}>;

export type Snapshots = Readonly<{
  create(name?: string): Promise<Snapshot>;
  restore(id: string): Promise<void>;
}>;

export type Url = Readonly<{
  url: string;
  port: number;
}>;

export type Snapshot = Readonly<{
  id: string;
  name?: string;
}>;

export type Exec = Readonly<{
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  timeout?: number;
}>;

export type Spawn = Exec;

export type Port = Readonly<{
  host?: string;
  protocol?: "http" | "https" | "tcp";
}>;

export type Sandbox<Raw = unknown> = Readonly<{
  id: string;
  provider: string;
  capabilities: Capabilities;
  files: Files;
  process: Process;
  ports: Ports;
  snapshots: Snapshots;
  raw: Raw;
  stop(): Promise<void>;
}>;

export type Adapter<Raw = unknown> = Readonly<{
  provider: string;
  capabilities: Capabilities;
  create(options?: Options): Promise<Sandbox<Raw>>;
}>;

export type Options = Readonly<{
  id?: string;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  timeout?: number;
}>;

export type Cause = Readonly<{
  cause?: unknown;
}>;

export class SandboxError extends Error {
  readonly code: string;

  readonly provider?: string;

  constructor(
    message: string,
    options: Cause & { code: string; provider?: string }
  ) {
    super(message, { cause: options.cause });
    this.name = "SandboxError";
    this.code = options.code;
    if (options.provider !== undefined) {
      this.provider = options.provider;
    }
  }
}

export const create = <Raw = unknown>(
  options: Options & { adapter: Adapter<Raw> }
): Promise<Sandbox<Raw>> => options.adapter.create(options);

export const unsupported = (provider: string, feature: string): never => {
  throw new SandboxError(`${provider} does not support ${feature}`, {
    code: "unsupported",
    provider,
  });
};
