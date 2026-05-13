import { Buffer } from "node:buffer";

import { Daytona as DaytonaClient, DaytonaNotFoundError } from "@daytona/sdk";
import type {
  CodeLanguage,
  CreateSandboxBaseParams,
  CreateSandboxFromImageParams,
  CreateSandboxFromSnapshotParams,
  DaytonaConfig,
  Image,
  Resources,
  Sandbox as DaytonaSandbox,
} from "@daytona/sdk";
import {
  abort,
  bytes,
  command,
  error as sandboxError,
  result,
  unsupported,
} from "@sandbox-sdk/core";
import type {
  Adapter,
  Capabilities,
  Entry,
  Exec,
  Input,
  Result,
  Sandbox,
} from "@sandbox-sdk/core";

export type Daytona = DaytonaConfig &
  Readonly<{
    autoArchiveInterval?: number;
    autoDeleteInterval?: number;
    autoStopInterval?: number;
    cwd?: string;
    deleteOnStop?: boolean;
    env?: Readonly<Record<string, string>>;
    image?: string | Image;
    labels?: Readonly<Record<string, string>>;
    language?: CodeLanguage | string;
    name?: string;
    networkAllowList?: string;
    networkBlockAll?: boolean;
    previewExpires?: number;
    public?: boolean;
    resources?: Resources;
    signedPreview?: boolean;
    snapshot?: string;
    timeout?: number;
    user?: string;
  }>;

type Raw = DaytonaSandbox;

const provider = "daytona";

const capabilities: Capabilities = {
  desktop: true,
  environment: true,
  files: true,
  git: true,
  network: "dynamic",
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: false,
  snapshotCreate: false,
  snapshotRestore: false,
  snapshots: false,
  volumes: true,
};

const present = (value: string | undefined): boolean =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

const validate = (options: Daytona): void => {
  const apiKey = options.apiKey ?? env("DAYTONA_API_KEY");
  const jwtToken = options.jwtToken ?? env("DAYTONA_JWT_TOKEN");
  const organizationId =
    options.organizationId ?? env("DAYTONA_ORGANIZATION_ID");
  const target = options.target ?? env("DAYTONA_TARGET");
  if (present(options.jwtToken) && !present(organizationId)) {
    throw sandboxError(
      provider,
      "Daytona JWT authentication requires DAYTONA_ORGANIZATION_ID or organizationId.",
      "configuration"
    );
  }
  if (present(apiKey)) {
    if (present(target)) {
      return;
    }
    throw sandboxError(
      provider,
      "Daytona target missing. Set DAYTONA_TARGET or pass target to daytona().",
      "configuration"
    );
  }
  if (present(jwtToken) && !present(organizationId)) {
    throw sandboxError(
      provider,
      "Daytona JWT authentication requires DAYTONA_ORGANIZATION_ID or organizationId.",
      "configuration"
    );
  }
  if (present(jwtToken) && present(organizationId) && present(target)) {
    return;
  }
  if (present(jwtToken) && present(organizationId)) {
    throw sandboxError(
      provider,
      "Daytona target missing. Set DAYTONA_TARGET or pass target to daytona().",
      "configuration"
    );
  }
  throw sandboxError(
    provider,
    "Daytona credentials missing. Set DAYTONA_API_KEY, or set DAYTONA_JWT_TOKEN and DAYTONA_ORGANIZATION_ID.",
    "configuration"
  );
};

const config = (options: Daytona): DaytonaConfig => ({
  ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
  ...(options.apiUrl === undefined ? {} : { apiUrl: options.apiUrl }),
  ...(options.jwtToken === undefined ? {} : { jwtToken: options.jwtToken }),
  ...(options.organizationId === undefined
    ? {}
    : { organizationId: options.organizationId }),
  ...(options.otelEnabled === undefined
    ? {}
    : { otelEnabled: options.otelEnabled }),
  ...(options.serverUrl === undefined ? {} : { serverUrl: options.serverUrl }),
  ...(options.target === undefined ? {} : { target: options.target }),
  ...(options._experimental === undefined
    ? {}
    : { _experimental: options._experimental }),
});

const params = (
  options: Daytona,
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): CreateSandboxFromImageParams | CreateSandboxFromSnapshotParams => {
  const base: CreateSandboxBaseParams = {
    ...(options.autoArchiveInterval === undefined
      ? {}
      : { autoArchiveInterval: options.autoArchiveInterval }),
    ...(options.autoDeleteInterval === undefined
      ? {}
      : { autoDeleteInterval: options.autoDeleteInterval }),
    ...(options.autoStopInterval === undefined
      ? {}
      : { autoStopInterval: options.autoStopInterval }),
    envVars: { ...options.env, ...input.env },
    labels: { ...options.labels, ...input.metadata },
    ...(options.language === undefined ? {} : { language: options.language }),
    ...((input.id ?? options.name) ? { name: input.id ?? options.name } : {}),
    ...(options.networkAllowList === undefined
      ? {}
      : { networkAllowList: options.networkAllowList }),
    ...(options.networkBlockAll === undefined
      ? {}
      : { networkBlockAll: options.networkBlockAll }),
    ...(options.public === undefined ? {} : { public: options.public }),
    ...(options.user === undefined ? {} : { user: options.user }),
  };

  if (options.image !== undefined) {
    return {
      ...base,
      image: options.image,
      ...(options.resources === undefined
        ? {}
        : { resources: options.resources }),
    };
  }

  return {
    ...base,
    ...((input.template ?? options.snapshot)
      ? { snapshot: input.template ?? options.snapshot }
      : {}),
  };
};

const seconds = (value?: number): number | undefined =>
  value === undefined ? undefined : Math.max(1, Math.ceil(value / 1000));

const missing = (error: unknown): boolean =>
  error instanceof DaytonaNotFoundError ||
  (typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404);

const content = async (input: Input): Promise<Buffer> => {
  const value = await bytes(input);
  return typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
};

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort(provider, signal.reason);
  }
};

const executeLine = async (
  raw: Raw,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  check(options.signal);
  try {
    const output = await raw.process.executeCommand(
      line,
      options.cwd ?? cwd,
      options.env === undefined ? undefined : { ...options.env },
      seconds(options.timeout)
    );
    return result(output.exitCode, output.result, "");
  } catch (error) {
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const execute = (
  raw: Raw,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => executeLine(raw, cwd, command(executable, args), options);

const createSandbox = (
  raw: Raw,
  cwd: string,
  options: Daytona
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: async (path) => {
      try {
        await raw.fs.getFileDetails(path);
        return true;
      } catch (error) {
        if (missing(error)) {
          return false;
        }
        throw sandboxError(
          provider,
          "File exists check failed",
          "provider",
          error
        );
      }
    },
    list: async (path = cwd) => {
      const base = path.replace(/\/$/u, "");
      const entries = await raw.fs.listFiles(path);
      return entries
        .map(
          (entry): Entry => ({
            kind: entry.isDir ? "directory" : "file",
            modified: new Date(entry.modTime),
            path: `${base}/${entry.name}`,
            size: entry.size,
          })
        )
        .toSorted((left, right) => left.path.localeCompare(right.path));
    },
    mkdir: async (path) => {
      await raw.fs.createFolder(path, "755");
    },
    read: async (path) => new Uint8Array(await raw.fs.downloadFile(path)),
    remove: async (path) => {
      await raw.fs.deleteFile(path, true);
    },
    text: async (path) => {
      const output = await raw.fs.downloadFile(path);
      return output.toString("utf-8");
    },
    write: async (path, input) => {
      await raw.fs.uploadFile(await content(input), path);
    },
  },
  id: raw.id,
  ports: {
    expose: async (port) => {
      const preview = options.signedPreview
        ? await raw.getSignedPreviewUrl(port, options.previewExpires)
        : await raw.getPreviewLink(port);
      return {
        port,
        url: preview.url,
      };
    },
  },
  process: {
    exec: (executable, args = [], run = {}) =>
      execute(raw, cwd, executable, args, run),
    shell: (script, run = {}) => executeLine(raw, cwd, script, run),
    spawn: () => unsupported(provider, "background process spawn"),
    spawnShell: () => unsupported(provider, "background shell process spawn"),
  },
  provider,
  raw,
  snapshots: {
    create: () => unsupported(provider, "stable snapshots"),
    restore: () => unsupported(provider, "stable snapshot restore"),
  },
  stop: async () => {
    if (options.deleteOnStop) {
      await raw.delete(seconds(options.timeout));
      return;
    }
    await raw.stop(seconds(options.timeout));
  },
});

export const daytona = (options: Daytona = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const client = new DaytonaClient(config(options));
    const createTimeout = seconds(input.timeout ?? options.timeout);
    const createSettings =
      createTimeout === undefined ? undefined : { timeout: createTimeout };
    const createParams = params(options, input);
    let raw: Raw;
    if (input.id === undefined && options.image === undefined) {
      raw = await client.create(
        createParams as CreateSandboxFromSnapshotParams,
        createSettings
      );
    } else if (input.id === undefined) {
      raw = await client.create(
        createParams as CreateSandboxFromImageParams,
        createSettings
      );
    } else {
      raw = await client.get(input.id);
    }
    const cwd =
      input.cwd ?? options.cwd ?? (await raw.getWorkDir()) ?? "/home/daytona";

    await raw.fs.createFolder(cwd, "755");

    return createSandbox(raw, cwd, options);
  },
  provider,
});
