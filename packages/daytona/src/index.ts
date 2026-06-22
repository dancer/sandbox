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
  port,
  portOptions,
  preview,
  quote,
  result,
  sandboxError,
  sandboxPath,
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

/**
 * native Daytona sandbox object exposed as `sandbox.raw`
 *
 * use `updateNetworkSettings` for dynamic outbound network policy changes on
 * Daytona Tier 3 and Tier 4 targets
 *
 * @example
 * await sandbox.raw.updateNetworkSettings({ networkBlockAll: true })
 * await sandbox.raw.updateNetworkSettings({ networkBlockAll: false })
 */
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
    /** default environment variables for new sandboxes; rejects DAYTONA_API_KEY and DAYTONA_JWT_TOKEN to prevent credential forwarding */
    env?: Readonly<Record<string, string>>;
    /** make the Daytona sandbox ephemeral so stopping it deletes it */
    ephemeral?: boolean;
    /** image name or Daytona Image used to create the sandbox */
    image?: string | Image;
    /** labels attached to new sandboxes */
    labels?: Readonly<Record<string, string>>;
    /** Daytona code language label for created sandboxes */
    language?: CodeLanguage | string;
    /** existing ephemeral sandbox id or name used for runner co-location */
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

type Raw = DaytonaSandbox;

const provider = "daytona";

const secrets = ["DAYTONA_API_KEY", "DAYTONA_JWT_TOKEN"] as const;

const capabilities: Capabilities = {
  environment: true,
  fileStreaming: "native",
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: "separate",
  raw: {
    desktop: true,
    git: true,
    interpreter: true,
    lifecycle: "dynamic",
    lsp: true,
    network: "dynamic",
    previews: true,
    pty: true,
    resources: "dynamic",
    sessions: true,
    ssh: true,
    volumes: "create-time",
  },
  snapshotCreate: false,
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "separate",
};

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const first = (
  ...values: readonly (string | undefined)[]
): string | undefined => values.find(present);

const env = (name: string): string | undefined =>
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.[name];

const assertSandboxEnv = (value: Readonly<Record<string, string>>): void => {
  const leaked = secrets.filter((name) => value[name] !== undefined);
  if (leaked.length === 0) {
    return;
  }
  throw sandboxError(
    provider,
    `Daytona provider credentials cannot be forwarded into sandbox env: ${leaked.join(", ")}`,
    "configuration"
  );
};

type Channel = "output" | "stderr" | "stdout";

type Chunk = Readonly<{
  channel: Exclude<Channel, "output">;
  value: Uint8Array;
}>;

const include = (channel: Channel, chunk: Chunk): boolean =>
  channel === "output" || channel === chunk.channel;

const streams = (): Readonly<{
  append(channel: Exclude<Channel, "output">, chunk: string): void;
  close(): void;
  output: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
}> => {
  const encoder = new TextEncoder();
  const chunks: Chunk[] = [];
  const controllers: Record<
    Channel,
    Set<ReadableStreamDefaultController<Uint8Array>>
  > = {
    output: new Set(),
    stderr: new Set(),
    stdout: new Set(),
  };
  let closed = false;

  const create = (channel: Channel): ReadableStream<Uint8Array> => {
    let active: ReadableStreamDefaultController<Uint8Array> | undefined;
    return new ReadableStream({
      cancel() {
        if (active !== undefined) {
          controllers[channel].delete(active);
        }
      },
      start(controller) {
        active = controller;
        for (const chunk of chunks) {
          if (include(channel, chunk)) {
            controller.enqueue(chunk.value);
          }
        }
        if (closed) {
          controller.close();
          return;
        }
        controllers[channel].add(controller);
      },
    });
  };

  return {
    append(channel, chunk) {
      if (closed) {
        return;
      }
      const value = encoder.encode(chunk);
      chunks.push({ channel, value });
      for (const stream of ["output", channel] as const) {
        for (const controller of controllers[stream]) {
          controller.enqueue(value);
        }
      }
    },
    close() {
      if (!closed) {
        closed = true;
        for (const group of Object.values(controllers)) {
          for (const controller of group) {
            controller.close();
          }
          group.clear();
        }
      }
    },
    output: create("output"),
    stderr: create("stderr"),
    stdout: create("stdout"),
  };
};

const validate = (options: Daytona): void => {
  const apiKey = first(options.apiKey, env("DAYTONA_API_KEY"));
  const jwtToken = first(options.jwtToken, env("DAYTONA_JWT_TOKEN"));
  const organizationId = first(
    options.organizationId,
    env("DAYTONA_ORGANIZATION_ID")
  );
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

const config = (options: Daytona): DaytonaConfig => {
  const apiKey = first(options.apiKey, env("DAYTONA_API_KEY"));
  const jwtToken = first(options.jwtToken, env("DAYTONA_JWT_TOKEN"));
  const organizationId = first(
    options.organizationId,
    env("DAYTONA_ORGANIZATION_ID")
  );
  const target = first(options.target, env("DAYTONA_TARGET"));
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(present(options.apiUrl) ? { apiUrl: options.apiUrl } : {}),
    ...(jwtToken === undefined ? {} : { jwtToken }),
    ...(organizationId === undefined ? {} : { organizationId }),
    ...(options.otelEnabled === undefined
      ? {}
      : { otelEnabled: options.otelEnabled }),
    ...(present(options.serverUrl) ? { serverUrl: options.serverUrl } : {}),
    ...(target === undefined ? {} : { target }),
    ...(options._experimental === undefined
      ? {}
      : { _experimental: options._experimental }),
  };
};

const baseParams = (
  options: Daytona,
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): CreateSandboxBaseParams => {
  const envVars = { ...options.env, ...input.env };
  assertSandboxEnv(envVars);
  return {
    ...(options.autoArchiveInterval === undefined
      ? {}
      : { autoArchiveInterval: options.autoArchiveInterval }),
    ...(options.autoDeleteInterval === undefined
      ? {}
      : { autoDeleteInterval: options.autoDeleteInterval }),
    ...(options.autoStopInterval === undefined
      ? {}
      : { autoStopInterval: options.autoStopInterval }),
    envVars,
    ...(options.ephemeral === undefined
      ? {}
      : { ephemeral: options.ephemeral }),
    labels: { ...options.labels, ...input.metadata },
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.linkedSandbox === undefined
      ? {}
      : { linkedSandbox: options.linkedSandbox }),
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
  };
};

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

const executeBufferedLine = async (
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
  const logs = streams();
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
    let stopped = false;
    const output = (async (): Promise<void> => {
      try {
        await raw.process.getSessionCommandLogs(
          session,
          id,
          (chunk) => logs.append("stdout", chunk),
          (chunk) => logs.append("stderr", chunk)
        );
      } catch (error) {
        if (!stopped || !missing(error)) {
          throw error;
        }
      } finally {
        logs.close();
      }
    })();
    const final = (async (): Promise<Result> => {
      await output;
      if (stopped) {
        return result(143, "", "", "SIGTERM");
      }
      try {
        const [state, value] = await Promise.all([
          raw.process.getSessionCommand(session, id),
          raw.process.getSessionCommandLogs(session, id),
        ]);
        return result(
          state.exitCode ?? 0,
          value.stdout ?? value.output ?? "",
          value.stderr ?? ""
        );
      } catch (error) {
        if (stopped && missing(error)) {
          return result(143, "", "", "SIGTERM");
        }
        throw error;
      }
    })();
    const stop = async (): Promise<void> => {
      if (stopped) {
        return;
      }
      stopped = true;
      try {
        await raw.process.deleteSession(session);
      } catch (error) {
        if (!missing(error)) {
          throw error;
        }
      } finally {
        logs.close();
      }
    };

    const cancel = async (): Promise<void> => {
      try {
        await stop();
      } catch {
        logs.close();
      }
    };
    if (options.signal?.aborted) {
      void cancel();
    } else {
      options.signal?.addEventListener("abort", cancel, { once: true });
    }

    return {
      id,
      kill: stop,
      output: logs.output,
      result: (async () => {
        try {
          return await final;
        } finally {
          options.signal?.removeEventListener("abort", cancel);
        }
      })(),
      stderr: logs.stderr,
      stdout: logs.stdout,
    };
  } catch (error) {
    logs.close();
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const executeLine = async (
  raw: Raw,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  const { signal } = options;
  if (signal !== undefined) {
    const running = await spawnLine(raw, cwd, line, options);
    const output = await running.result;
    if (signal.aborted) {
      abort(provider, signal.reason);
    }
    return output;
  }
  return executeBufferedLine(raw, cwd, line, options);
};

const execute = (
  raw: Raw,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => executeLine(raw, cwd, command(executable, args), options);

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
        await raw.fs.getFileDetails(sandboxPath(cwd, path));
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
      const target = sandboxPath(cwd, path);
      const base = target.replace(/\/$/u, "");
      const entries = await wrap(() => raw.fs.listFiles(target), "list");
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
      await wrap(
        () => raw.fs.createFolder(sandboxPath(cwd, path), "755"),
        "mkdir"
      );
    },
    read: async (path) =>
      new Uint8Array(
        await wrap(() => raw.fs.downloadFile(sandboxPath(cwd, path)), "read")
      ),
    remove: async (path) => {
      await wrap(
        () => raw.fs.deleteFile(sandboxPath(cwd, path), true),
        "remove"
      );
    },
    stream: async (path) =>
      web(
        await wrap(
          () => raw.fs.downloadFileStream(sandboxPath(cwd, path)),
          "stream"
        )
      ),
    text: async (path) => {
      const output = await wrap(
        () => raw.fs.downloadFile(sandboxPath(cwd, path)),
        "text"
      );
      return output.toString("utf-8");
    },
    write: async (path, input) => {
      await wrap(
        async () =>
          raw.fs.uploadFileStream(await upload(input), sandboxPath(cwd, path)),
        "write"
      );
    },
  },
  id: raw.id,
  ports: {
    expose: async (value, input) => {
      const target = port(value, provider);
      portOptions(provider, input, "https");
      const link = options.signedPreview
        ? await wrap(
            () => raw.getSignedPreviewUrl(target, options.previewExpires),
            "port exposure"
          )
        : await wrap(() => raw.getPreviewLink(target), "port exposure");
      return preview(link.url, target, {
        ...(options.signedPreview
          ? {}
          : { headers: { "x-daytona-preview-token": link.token } }),
        provider,
      });
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

/**
 * create a Daytona adapter with normalized sandbox operations
 *
 * standard private previews work through `preview.request()`, which retains Daytona's preview token. standard tokens reset when a sandbox restarts, so expose the port again after restart. set `signedPreview` only when an external client needs a self-contained URL
 */
export const daytona = (options: Daytona = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const client = new DaytonaClient(config(options));
    const raw =
      input.id === undefined
        ? await client.create(
            params(options, input),
            createSettings(options, input)
          )
        : await client.get(input.id);
    const cwd =
      input.cwd ?? options.cwd ?? (await raw.getWorkDir()) ?? "/home/daytona";

    await wrap(() => raw.fs.createFolder(cwd, "755"), "mkdir");

    return createSandbox(raw, cwd, options);
  },
  provider,
});
