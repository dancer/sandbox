import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

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
  processSpawn: "combined",
  snapshotCreate: false,
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  volumes: true,
};

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

const readable = (value: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
    },
  });

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

const params = (
  options: Daytona,
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): CreateSandboxFromImageParams | CreateSandboxFromSnapshotParams => {
  const snapshot = input.snapshot ?? input.template ?? options.snapshot;
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

const runLine = (
  cwd: string,
  line: string,
  options: Exec | Spawn
): string => {
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
    const command = await raw.process.executeSessionCommand(
      session,
      {
        command: runLine(cwd, line, options),
        runAsync: true,
        suppressInputEcho: true,
      },
      timeout
    );
    const id = command.cmdId;
    const output = raw.process
      .getSessionCommandLogs(
        session,
        id,
        (chunk) => logs.append(chunk),
        (chunk) => logs.append(chunk)
      )
      .finally(() => logs.close());
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
        void raw.process.deleteSession(session).finally(() => logs.close());
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
    stream: async (path) =>
      readable(new Uint8Array(await raw.fs.downloadFile(path))),
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
    expose: async (value) => {
      const target = port(value, provider);
      const preview = options.signedPreview
        ? await raw.getSignedPreviewUrl(target, options.previewExpires)
        : await raw.getPreviewLink(target);
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
      await raw.delete(seconds(options.timeout));
      return;
    }
    await raw.stop(seconds(options.timeout));
  },
});

/** create a Daytona adapter with normalized sandbox operations */
export const daytona = (options: Daytona = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const client = new DaytonaClient(config(options));
    const createTimeout = seconds(input.timeout ?? options.timeout);
    const createSettings =
      createTimeout === undefined ? undefined : { timeout: createTimeout };
    const createParams = params(options, input);
    const raw =
      input.id === undefined
        ? await client.create(createParams, createSettings)
        : await client.get(input.id);
    const cwd =
      input.cwd ?? options.cwd ?? (await raw.getWorkDir()) ?? "/home/daytona";

    await raw.fs.createFolder(cwd, "755");

    return createSandbox(raw, cwd, options);
  },
  provider,
});
