import type { CodeSandbox as CodeSandboxClient } from "@codesandbox/sdk";

export type ClientOptions = NonNullable<
  ConstructorParameters<typeof CodeSandboxClient>[1]
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
  vmTier?: unknown;
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

export type SandboxClient = Readonly<{
  commands: Readonly<{
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
    writeFile(path: string, content: Uint8Array): Promise<void>;
    writeTextFile(path: string, content: string): Promise<void>;
  }>;
  ports: Readonly<{
    waitForPort(port: number): Promise<{ host: string; port: number }>;
  }>;
  workspacePath: string;
}>;

export type ProviderSandbox = Readonly<{
  connect(options?: SessionOptions): Promise<SandboxClient>;
  id: string;
}>;

export type Sdk = Readonly<{
  sandboxes: Readonly<{
    create(options?: LocalCreate): Promise<ProviderSandbox>;
    delete(id: string): Promise<void>;
    hibernate(id: string): Promise<void>;
    resume(id: string): Promise<ProviderSandbox>;
    shutdown(id: string): Promise<void>;
  }>;
}>;

/** native CodeSandbox sdk, sandbox, and connected session exposed as `sandbox.raw` */
export type Raw = Readonly<{
  client: SandboxClient;
  sandbox: ProviderSandbox;
  sdk: Sdk;
}>;

/** native CodeSandbox raw object exposed as `sandbox.raw` */
export type CodeSandboxRaw = Raw;
