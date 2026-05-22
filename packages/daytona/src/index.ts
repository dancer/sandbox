import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

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
  VolumeMount,
} from "@daytona/sdk";
import {
  abort,
  bytes,
  command,
  duration,
  sandboxError,
  port,
  quote,
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
  Running,
  Spawn,
  Sandbox,
} from "@sandbox-sdk/core";

/** native Daytona sandbox object exposed as `sandbox.raw` */
export type DaytonaRaw = DaytonaSandbox;

/** Daytona adapter configuration */
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
    /** make the Daytona sandbox ephemeral so stopping it deletes it */
    ephemeral?: boolean;
    /** image name or Daytona Image used to create the sandbox */
    image?: string | Image;
    /** labels attached to new sandboxes */
    labels?: Readonly<Record<string, string>>;
    /** Daytona code language label for created sandboxes */
    language?: CodeLanguage | string;
    /** stable Daytona sandbox name used when create input omits id */
    name?: string;
    /** outbound network allow list passed to Daytona at sandbox creation */
    networkAllowList?: string;
    /** block outbound network access at sandbox creation when supported by Daytona */
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
    /** stream Daytona image snapshot build logs during image-based sandbox creation */
    snapshotLogs?: (chunk: string) => void;
    /** create, stop, and delete timeout in milliseconds */
    timeout?: number;
    /** linux user used for supported Daytona operations */
    user?: string;
    /** Daytona volumes mounted into the created sandbox */
    volumes?: readonly VolumeMount[];
  }>;

type Raw = DaytonaSandbox;

const provider = "daytona";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: "combined",
  raw: {
    desktop: true,
    git: true,
    interpreter: true,
    lifecycle: "dynamic",
    lsp: true,
    network: "create-time",
    previews: true,
    pty: true,
    sessions: true,
    ssh: true,
    volumes: "create-time",
  },
  snapshotCreate: false,
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "combined",
};

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

const stream = (): {
  append(chunk: string): void;
  close(): void;
  output: ReadableStream<Uint8Array>;
} => {
  const encoder = new TextEncoder();
  let close: (() => void) | undefined;
  let closed = false;
  let send: ((chunk: Uint8Array) => void) | undefined;
  return {
    append(chunk) {
      if (!closed) {
        send?.(encoder.encode(chunk));
      }
    },
    close() {
      if (!closed) {
        closed = true;
        close?.();
      }
    },
    output: new ReadableStream({
      start(controller) {
        close = () => controller.close();
        send = (chunk) => controller.enqueue(chunk);
      },
    }),
  };
};

const validate = (options: Daytona): void => {
  const apiKey = options.apiKey ?? env("DAYTONA_API_KEY");
  const jwtToken = options.jwtToken ?? env("DAYTONA_JWT_TOKEN");
  const organizationId =
    options.organizationId ?? env("DAYTONA_ORGANIZATION_ID");
  if (present(options.jwtToken) && !present(organizationId)) {
    throw sandboxError(
      provider,
      "Daytona JWT authentication requires DAYTONA_ORGANIZATION_ID or organizationId.",
      "configuration"
    );
  }
  if (present(apiKey)) {
    return;
  }
  if (present(jwtToken) && !present(organizationId)) {
    throw sandboxError(
      provider,
      "Daytona JWT authentication requires DAYTONA_ORGANIZATION_ID or organizationId.",
      "configuration"
    );
  }
  if (present(jwtToken) && present(organizationId)) {
    return;
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

const baseParams = (
  options: Daytona,
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): CreateSandboxBaseParams => ({
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
  ...(options.ephemeral === undefined ? {} : { ephemeral: options.ephemeral }),
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
  ...(options.volumes === undefined ? {} : { volumes: [...options.volumes] }),
});

const params = (
  options: Daytona,
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): CreateSandboxFromImageParams | CreateSandboxFromSnapshotParams => {
  const snapshot = input.snapshot ?? input.template ?? options.snapshot;
  const base = baseParams(options, input);

  if (snapshot !== undefined) {
    return {
      ...base,
      ...(options.resources === undefined
        ? {}
        : { resources: options.resources }),
      snapshot,
    };
  }

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
    ...(options.resources === undefined
      ? {}
      : { resources: options.resources }),
  };
};

const seconds = (value?: number): number | undefined => {
  const milliseconds = duration(value, provider);
  return milliseconds === undefined
    ? undefined
    : Math.max(1, Math.ceil(milliseconds / 1000));
};

const createSettings = (
  options: Daytona,
  input: Parameters<Adapter<Raw>["create"]>[0]
): Parameters<DaytonaClient["create"]>[1] => {
  const createTimeout = seconds(input?.timeout ?? options.timeout);
  if (createTimeout === undefined && options.snapshotLogs === undefined) {
    return undefined;
  }
  return {
    ...(options.snapshotLogs === undefined
      ? {}
      : { onSnapshotCreateLogs: options.snapshotLogs }),
    ...(createTimeout === undefined ? {} : { timeout: createTimeout }),
  };
};

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

const upload = async (
  input: Input
): Promise<Buffer | ReadableStream<Uint8Array> | Uint8Array> => {
  if (input instanceof ReadableStream || input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return await content(input);
};

const web = (input: Readable): ReadableStream<Uint8Array> =>
  Readable.toWeb(input) as ReadableStream<Uint8Array>;

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
  const timeout = seconds(options.timeout);
  try {
    const output = await raw.process.executeCommand(
      line,
      options.cwd ?? cwd,
      options.env === undefined ? undefined : { ...options.env },
      timeout
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

const runLine = (cwd: string, line: string, options: Exec | Spawn): string => {
  const values = Object.entries(options.env ?? {}).map(([name, value]) =>
    quote(`${name}=${value}`)
  );
  const prefix = values.length === 0 ? "" : `env ${values.join(" ")} `;
  return `cd ${quote(options.cwd ?? cwd)} && ${prefix}${line}`;
};

const spawnLine = async (
  raw: Raw,
  cwd: string,
  line: string,
  options: Spawn
): Promise<Running> => {
  check(options.signal);
  const timeout = seconds(options.timeout);
  const session = `sandbox-sdk-${randomUUID()}`;
  const logs = stream();
  try {
    await raw.process.createSession(session);
    const started = await raw.process.executeSessionCommand(
      session,
      {
        command: runLine(cwd, line, options),
        runAsync: true,
        suppressInputEcho: true,
      },
      timeout
    );
    const id = started.cmdId;
    const output = (async (): Promise<void> => {
      try {
        await raw.process.getSessionCommandLogs(
          session,
          id,
          (chunk) => logs.append(chunk),
          (chunk) => logs.append(chunk)
        );
      } finally {
        logs.close();
      }
    })();
    const final = (async (): Promise<Result> => {
      await output;
      const [state, value] = await Promise.all([
        raw.process.getSessionCommand(session, id),
        raw.process.getSessionCommandLogs(session, id),
      ]);
      return result(
        state.exitCode ?? 0,
        value.stdout ?? value.output ?? "",
        value.stderr ?? ""
      );
    })();

    options.signal?.addEventListener(
      "abort",
      () => {
        void (async () => {
          try {
            await raw.process.deleteSession(session);
          } finally {
            logs.close();
          }
        })();
      },
      { once: true }
    );

    return {
      id,
      kill: async () => {
        await raw.process.deleteSession(session);
        logs.close();
      },
      output: logs.output,
      result: final,
    };
  } catch (error) {
    logs.close();
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const spawn = (
  raw: Raw,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Spawn
): Promise<Running> => spawnLine(raw, cwd, command(executable, args), options);

const rejectUnsupported = (feature: string): Promise<never> => {
  try {
    unsupported(provider, feature);
  } catch (error) {
    return Promise.reject(error);
  }
};

const wrap = async <Value>(
  action: () => Promise<Value> | Value,
  feature: string
): Promise<Value> => {
  try {
    return await action();
  } catch (error) {
    throw sandboxError(provider, `${feature} failed`, "provider", error);
  }
};

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
      const entries = await wrap(() => raw.fs.listFiles(path), "list");
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
      await wrap(() => raw.fs.createFolder(path, "755"), "mkdir");
    },
    read: async (path) =>
      new Uint8Array(await wrap(() => raw.fs.downloadFile(path), "read")),
    remove: async (path) => {
      await wrap(() => raw.fs.deleteFile(path, true), "remove");
    },
    stream: async (path) =>
      web(await wrap(() => raw.fs.downloadFileStream(path), "stream")),
    text: async (path) => {
      const output = await wrap(() => raw.fs.downloadFile(path), "text");
      return output.toString("utf-8");
    },
    write: async (path, input) => {
      await wrap(
        async () => raw.fs.uploadFileStream(await upload(input), path),
        "write"
      );
    },
  },
  id: raw.id,
  ports: {
    expose: async (value) => {
      const target = port(value, provider);
      const preview = options.signedPreview
        ? await wrap(
            () => raw.getSignedPreviewUrl(target, options.previewExpires),
            "port exposure"
          )
        : await wrap(() => raw.getPreviewLink(target), "port exposure");
      return {
        port: target,
        url: preview.url,
      };
    },
  },
  process: {
    exec: (executable, args = [], run = {}) =>
      execute(raw, cwd, executable, args, run),
    shell: (script, run = {}) => executeLine(raw, cwd, script, run),
    spawn: (executable, args = [], run = {}) =>
      spawn(raw, cwd, executable, args, run),
    spawnShell: (script, run = {}) => spawnLine(raw, cwd, script, run),
  },
  provider,
  raw,
  snapshots: {
    create: () => rejectUnsupported("stable snapshots"),
    restore: () => rejectUnsupported("stable snapshot restore"),
  },
  stop: async () => {
    if (options.deleteOnStop) {
      await wrap(() => raw.delete(seconds(options.timeout)), "stop");
      return;
    }
    await wrap(() => raw.stop(seconds(options.timeout)), "stop");
  },
});

/** create a Daytona adapter with normalized sandbox operations */
export const daytona = (options: Daytona = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const client = new DaytonaClient(config(options));
    const createParams = params(options, input);
    const raw =
      input.id === undefined
        ? await client.create(createParams, createSettings(options, input))
        : await client.get(input.id);
    const cwd =
      input.cwd ?? options.cwd ?? (await raw.getWorkDir()) ?? "/home/daytona";

    await wrap(() => raw.fs.createFolder(cwd, "755"), "mkdir");

    return createSandbox(raw, cwd, options);
  },
  provider,
});
