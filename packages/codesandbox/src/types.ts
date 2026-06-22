import type { CodeSandbox as NativeSdk, VMTier } from "@codesandbox/sdk";

type NativeSandbox = Awaited<ReturnType<NativeSdk["sandboxes"]["create"]>>;

type NativeClient = Awaited<ReturnType<NativeSandbox["connect"]>>;

export type ClientOptions = NonNullable<
  ConstructorParameters<typeof NativeSdk>[1]
>;

export type LocalCreate = Readonly<{
  automaticWakeupConfig?: Readonly<{ http: boolean; websocket: boolean }>;
  description?: string;
  hibernationTimeoutSeconds?: number;
  id?: string;
  ipcountry?: string;
  path?: string;
  privacy?: "private" | "public" | "public-hosts" | "unlisted";
  tags?: string[];
  title?: string;
  vmTier?: VMTier;
}>;

export type CreateOptions = LocalCreate;

export type SessionOptions = Readonly<{
  env?: Record<string, string>;
  git?: Readonly<{
    accessToken?: string;
    email: string;
    name?: string;
    provider: string;
    username?: string;
  }>;
  hostToken?: unknown;
  id?: string;
  permission?: "read" | "write";
}>;

export type HostToken = Readonly<{
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  sandboxId: string;
  token: string;
  tokenId: string;
}>;

export type HostTokenInfo = Readonly<{
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  tokenId: string;
  tokenPrefix: string;
}>;

export type HostTokens = Readonly<{
  createToken(
    sandboxId: string,
    options: Readonly<{ expiresAt: Date }>
  ): Promise<HostToken>;
  getCookies(
    token: Readonly<{ sandboxId: string; token: string }>
  ): Record<string, string>;
  getHeaders(
    token: Readonly<{ sandboxId: string; token: string }>
  ): Record<string, string>;
  getUrl(
    token: Readonly<{ sandboxId: string; token: string }>,
    port: number,
    protocol?: string
  ): string;
  listTokens(sandboxId: string): Promise<readonly HostTokenInfo[]>;
  revokeAllTokens(sandboxId: string): Promise<void>;
  revokeToken(sandboxId: string, tokenId: string): Promise<void>;
  updateToken(
    sandboxId: string,
    tokenId: string,
    expiresAt: Date | null
  ): Promise<HostTokenInfo>;
}>;

export type Hosts = Readonly<{
  getCookies(): Record<string, string>;
  getHeaders(): Record<string, string>;
  getUrl(port: number, protocol?: string): string;
}>;

export type Background = Readonly<{
  command: string;
  kill(): Promise<void>;
  name?: string;
  onOutput(listener: (value: string) => void): { dispose(): void };
  open(): Promise<string>;
  waitUntilComplete(): Promise<string>;
}>;

export type FileEntry = Readonly<{
  name: string;
  type: "directory" | "file";
}>;

export type FileStat = Readonly<{
  mtime: number;
  size: number;
}>;

export type WatchEvent = Readonly<{
  paths: readonly string[];
  type: "add" | "change" | "remove";
}>;

export type Watcher = Readonly<{
  dispose(): void;
  onEvent(listener: (event: WatchEvent) => void): { dispose(): void };
}>;

export type Terminal = Readonly<{
  id: string;
  kill(): Promise<void>;
  name: string;
  onOutput(listener: (value: string) => void): { dispose(): void };
  open(options?: unknown): Promise<string>;
  run(input: string, options?: unknown): Promise<void>;
  write(input: string, options?: unknown): Promise<void>;
}>;

export type Task = Readonly<{
  command: string;
  id: string;
  name: string;
  open(options?: unknown): Promise<string>;
  restart(): Promise<void>;
  run(): Promise<void>;
  status: string;
  stop(): Promise<void>;
  waitForPort(timeout?: number): Promise<{ host: string; port: number }>;
}>;

export type SetupStep = Readonly<{
  command: string;
  name: string;
  open(options?: unknown): Promise<string>;
  status: string;
  waitUntilComplete(): Promise<void>;
}>;

export type SandboxClient = Readonly<{
  commands: Readonly<{
    getAll?(): Promise<readonly Background[]>;
    run(
      command: string,
      options?: Readonly<{ cwd?: string; env?: Record<string, string> }>
    ): Promise<string>;
    runBackground(
      command: string,
      options?: Readonly<{ cwd?: string; env?: Record<string, string> }>
    ): Promise<Background>;
  }>;
  disconnect(): Promise<void>;
  fs: Readonly<{
    mkdir(path: string, recursive?: boolean): Promise<void>;
    readFile(path: string): Promise<Uint8Array>;
    readTextFile(path: string): Promise<string>;
    readdir(path: string): Promise<readonly FileEntry[]>;
    remove(path: string, recursive?: boolean): Promise<void>;
    stat(path: string): Promise<FileStat>;
    watch(
      path: string,
      options?: Readonly<{ excludes?: readonly string[]; recursive?: boolean }>
    ): Promise<Watcher>;
    writeFile(path: string, content: Uint8Array): Promise<void>;
    writeTextFile(path: string, content: string): Promise<void>;
  }>;
  hosts?: Hosts;
  interpreters: Readonly<{
    javascript(code: string): Promise<string>;
    python(code: string): Promise<string>;
  }>;
  ports: Readonly<{
    get?(port: number): Promise<unknown>;
    getAll?(): Promise<readonly unknown[]>;
    waitForPort(port: number): Promise<{ host: string; port: number }>;
  }>;
  setup: Readonly<{
    currentStepIndex: number;
    getSteps(): SetupStep[];
    run(): Promise<void>;
    status: string;
    waitUntilComplete(): Promise<void>;
  }>;
  tasks: Readonly<{
    get(taskId: string): Promise<Task | undefined>;
    getAll(): Promise<readonly Task[]>;
  }>;
  terminals: Readonly<{
    create(
      command?: "bash" | "dash" | "fish" | "ksh" | "zsh",
      options?: Readonly<{ cwd?: string; env?: Record<string, string> }>
    ): Promise<Terminal>;
    get(shellId: string): Promise<Terminal | undefined>;
    getAll(): Promise<readonly Terminal[]>;
  }>;
  workspacePath: string;
}>;

export type ProviderSandbox = Readonly<{
  bootupType?: string;
  cluster?: string;
  connect(options?: SessionOptions): Promise<SandboxClient>;
  createBrowserSession?(options?: SessionOptions): Promise<unknown>;
  createSession?(options?: SessionOptions): Promise<unknown>;
  id: string;
  isUpToDate?: boolean;
  updateHibernationTimeout?(timeoutSeconds: number): Promise<void>;
  updateTier?(tier: unknown): Promise<void>;
}>;

export type Sdk = Readonly<{
  hosts?: HostTokens;
  sandboxes: Readonly<{
    create(options?: LocalCreate): Promise<ProviderSandbox>;
    delete(id: string): Promise<void>;
    fork?(id: string, options?: LocalCreate): Promise<ProviderSandbox>;
    get?(id: string): Promise<unknown>;
    hibernate(id: string): Promise<void>;
    list?(options?: unknown): Promise<unknown>;
    listRunning?(): Promise<unknown>;
    restart?(id: string, options?: LocalCreate): Promise<ProviderSandbox>;
    resume(id: string): Promise<ProviderSandbox>;
    shutdown(id: string): Promise<void>;
  }>;
}>;

/** internal CodeSandbox contract used by custom clients and tests */
export type Raw = Readonly<{
  client: SandboxClient;
  sandbox: ProviderSandbox;
  sdk: Sdk;
}>;

/**
 * native CodeSandbox sdk, sandbox, and connected session exposed as `sandbox.raw`
 *
 * use raw for provider-specific lifecycle updates, browser sessions, preview token management, terminals, interpreters, tasks, setup state, and file watching
 *
 * use `clientOptions` to customize transport without losing native raw types
 */
export type CodeSandboxRaw = Readonly<{
  /** native CodeSandbox client used to manage sandbox records */
  client: NativeClient;
  /** native sandbox instance connected through the active session */
  sandbox: NativeSandbox;
  /** native SDK instance used for provider-wide operations */
  sdk: NativeSdk;
}>;
