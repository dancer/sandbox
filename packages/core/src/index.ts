export type Capability =
  | "desktop"
  | "environment"
  | "files"
  | "git"
  | "network"
  | "ports"
  | "process"
  | "pty"
  | "secrets"
  | "snapshots"
  | "streaming"
  | "volumes";

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

export type Capabilities = Readonly<Partial<Record<Capability, Mode>>>;

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
  ok: boolean;
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
  shell(command: string, options?: Exec): Promise<Result>;
  spawn(
    command: string,
    args?: readonly string[],
    options?: Spawn
  ): Promise<Running>;
  spawnShell(command: string, options?: Spawn): Promise<Running>;
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
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
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
  signal?: AbortSignal;
  timeout?: number;
}>;

export type Spawn = Exec;

export type Port = Readonly<{
  host?: string;
  protocol?: "http" | "https" | "tcp";
}>;

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

export type Adapter<Raw = unknown> = Readonly<{
  provider: string;
  capabilities: Capabilities;
  create(options?: Options): Promise<Sandbox<Raw>>;
}>;

export type Options = Readonly<{
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  id?: string;
  metadata?: Readonly<Record<string, string>>;
  ports?: readonly number[];
  template?: string;
  timeout?: number;
}>;

export type Cause = Readonly<{
  cause?: unknown;
}>;

export type Timer = ReturnType<typeof setTimeout>;

export type Code =
  | "aborted"
  | "not_found"
  | "path_escape"
  | "process"
  | "provider"
  | "timeout"
  | "unsupported";

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

export const create = <Raw = unknown>(
  input: Options & { adapter: Adapter<Raw> }
): Promise<Sandbox<Raw>> => {
  const { adapter, ...options } = input;
  return adapter.create(options);
};

export const withSandbox = async <Raw = unknown, Output = unknown>(
  input: Options & { adapter: Adapter<Raw> },
  use: (sandbox: Sandbox<Raw>) => Output | Promise<Output>
): Promise<Output> => {
  const sandbox = await create(input);
  try {
    return await use(sandbox);
  } finally {
    await sandbox.stop();
  }
};

export const supports = (
  subject: { capabilities: Capabilities },
  capability: Capability
): boolean => {
  const value = subject.capabilities[capability];
  return value !== undefined && value !== false;
};

export const unsupported = (provider: string, feature: string): never => {
  throw new SandboxError(`${provider} does not support ${feature}`, {
    code: "unsupported",
    provider,
  });
};

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

export const quote = (value: string): string => {
  if (/^[\w./:@%+=,-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
};

export const command = (value: string, args: readonly string[] = []): string =>
  [value, ...args].map(quote).join(" ");

const noop = (): void => void 0;

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
