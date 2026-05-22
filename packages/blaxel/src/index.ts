import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as joinPath } from "node:path";
import { dirname } from "node:path/posix";

import { SandboxInstance, settings } from "@blaxel/core";
import type {
  Config as BlaxelConfig,
  ProcessResponse,
  SandboxCreateConfiguration,
} from "@blaxel/core";
import {
  abort,
  bytes,
  command,
  duration,
  sandboxError,
  port,
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
  Sandbox,
  Spawn,
  Options,
} from "@sandbox-sdk/core";

import { rejectUnsupported } from "./errors.js";
import type { Blaxel } from "./types.js";

export type { Blaxel, BlaxelRaw } from "./types.js";

type Raw = SandboxInstance;

const provider = "blaxel";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: true,
  raw: {
    codegen: true,
    drives: true,
    lifecycle: true,
    network: "create-time",
    previews: true,
    resources: "create-time",
    sessions: true,
    system: true,
    volumes: "create-time",
    watching: true,
  },
  snapshotCreate: false,
  snapshotRestore: false,
  snapshotSource: false,
  snapshots: false,
  streaming: "combined",
};

const noop = (): void => void 0;

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const credentials = (
  value: BlaxelConfig["clientCredentials"] | undefined
): boolean =>
  typeof value === "string"
    ? present(value)
    : value !== undefined &&
      present(value.clientId) &&
      present(value.clientSecret);

const env = (name: string): string | undefined =>
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.[name];

const configExists = (): boolean =>
  existsSync(joinPath(homedir(), ".blaxel", "config.yaml"));

const readable = (value: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
    },
  });

const validate = (options: Blaxel): void => {
  const apiKey = options.apiKey ?? options.apikey ?? env("BL_API_KEY");
  const clientCredentials =
    options.clientCredentials ?? env("BL_CLIENT_CREDENTIALS");
  const workspace = options.workspace ?? env("BL_WORKSPACE");

  if (
    (present(apiKey) || credentials(clientCredentials)) &&
    present(workspace)
  ) {
    return;
  }
  if (present(apiKey) || credentials(clientCredentials) || present(workspace)) {
    throw sandboxError(
      provider,
      "Blaxel authentication requires BL_WORKSPACE with BL_API_KEY or BL_CLIENT_CREDENTIALS, or matching explicit options.",
      "configuration"
    );
  }
  if (configExists()) {
    return;
  }
  throw sandboxError(
    provider,
    "Blaxel credentials missing. Run bl login, set BL_WORKSPACE with BL_API_KEY or BL_CLIENT_CREDENTIALS, or pass credentials to blaxel().",
    "configuration"
  );
};

const configure = (options: Blaxel): void => {
  if (
    options.apiKey === undefined &&
    options.apikey === undefined &&
    options.clientCredentials === undefined &&
    options.disableH2 === undefined &&
    options.proxy === undefined &&
    options.workspace === undefined
  ) {
    return;
  }

  settings.setConfig({
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.apikey === undefined ? {} : { apikey: options.apikey }),
    ...(options.clientCredentials === undefined
      ? {}
      : { clientCredentials: options.clientCredentials }),
    ...(options.disableH2 === undefined
      ? {}
      : { disableH2: options.disableH2 }),
    ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
    ...(options.workspace === undefined
      ? {}
      : { workspace: options.workspace }),
  });
};

const environment = (
  values?: Readonly<Record<string, string>>
): NonNullable<SandboxCreateConfiguration["envs"]> =>
  Object.entries(values ?? {}).map(([name, value]) => ({ name, value }));

const portConfiguration = (
  ports: readonly number[]
): NonNullable<SandboxCreateConfiguration["ports"]> =>
  ports.map((target) => ({ protocol: "HTTP", target }));

const seconds = (milliseconds?: number): number | undefined => {
  const value = duration(milliseconds, provider);
  if (value === undefined) {
    return undefined;
  }
  if (value === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(value / 1000));
};

const code = (response: Pick<ProcessResponse, "exitCode" | "status">) =>
  response.exitCode ?? (response.status === "completed" ? 0 : 1);

const complete = (response: ProcessResponse): Result =>
  result(code(response), response.stdout ?? "", response.stderr ?? "");

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort(provider, signal.reason);
  }
};

const execute = async (
  raw: Raw,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  check(options.signal);
  const timeout = seconds(options.timeout);
  try {
    const response = await raw.process.exec({
      command: line,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(timeout === undefined ? {} : { timeout }),
      waitForCompletion: true,
      workingDir: options.cwd ?? cwd,
    });
    return complete(response);
  } catch (error) {
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const shell = (
  raw: Raw,
  cwd: string,
  script: string,
  options: Exec
): Promise<Result> => execute(raw, cwd, script, options);

const mkdir = async (raw: Raw, path: string): Promise<void> => {
  await raw.fs.mkdir(path);
};

const write = async (raw: Raw, path: string, input: Input): Promise<void> => {
  const value = await bytes(input);
  await mkdir(raw, dirname(path));
  if (typeof value === "string") {
    await raw.fs.write(path, value);
    return;
  }
  await raw.fs.writeBinary(path, value);
};

const read = async (raw: Raw, path: string): Promise<Uint8Array> => {
  const value = await raw.fs.readBinary(path);
  return new Uint8Array(await value.arrayBuffer());
};

const exists = async (raw: Raw, path: string): Promise<boolean> => {
  try {
    await raw.fs.ls(path);
    return true;
  } catch (error) {
    void error;
  }
  try {
    await raw.fs.readBinary(path);
    return true;
  } catch {
    return false;
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

const list = async (raw: Raw, path: string): Promise<Entry[]> => {
  const entries = await raw.fs.ls(path);
  return [
    ...entries.subdirectories.map(
      (entry): Entry => ({
        kind: "directory",
        path: entry.path,
      })
    ),
    ...entries.files.map(
      (entry): Entry => ({
        kind: "file",
        modified: new Date(entry.lastModified),
        path: entry.path,
        size: entry.size,
      })
    ),
  ].toSorted((left, right) => left.path.localeCompare(right.path));
};

const spawn = async (
  raw: Raw,
  cwd: string,
  line: string,
  options: Spawn
): Promise<Running> => {
  check(options.signal);
  const timeout = seconds(options.timeout);
  const maxWait = duration(options.timeout, provider) ?? 600_000;
  try {
    const response = await raw.process.exec({
      command: line,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(timeout === undefined ? {} : { timeout }),
      waitForCompletion: false,
      workingDir: options.cwd ?? cwd,
    });
    const id = response.pid;
    const encoder = new TextEncoder();
    let close = noop;
    const output = new ReadableStream<Uint8Array>({
      cancel() {
        close();
      },
      start(controller) {
        const stream = raw.process.streamLogs(id, {
          onError(error) {
            controller.error(error);
          },
          onLog(log) {
            controller.enqueue(encoder.encode(log));
          },
        });
        const { close: finish } = stream;
        close = finish;
        void (async () => {
          try {
            await stream.wait();
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        })();
      },
    });
    const process = (async (): Promise<Result> => {
      try {
        return complete(await raw.process.wait(id, { maxWait }));
      } finally {
        close();
      }
    })();

    options.signal?.addEventListener(
      "abort",
      () => {
        void (async () => {
          try {
            await raw.process.kill(id);
          } finally {
            close();
          }
        })();
      },
      { once: true }
    );

    return {
      id,
      kill: async () => {
        await raw.process.kill(id);
        close();
      },
      output,
      result: process,
    };
  } catch (error) {
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const createOptions = (
  options: Blaxel,
  input: Options,
  ports: readonly number[]
): SandboxCreateConfiguration => {
  const name = input.id ?? options.name;
  const image = input.template ?? options.image;
  const envs = { ...options.env, ...input.env };
  const labels = { ...options.labels, ...input.metadata };
  const timeout =
    options.ttl === undefined ? seconds(input.timeout) : undefined;
  const ttl =
    options.ttl ??
    (timeout === undefined ? undefined : `${Math.max(1, timeout)}s`);

  return {
    ...options.options,
    ...(name === undefined ? {} : { name }),
    ...(image === undefined ? {} : { image }),
    ...(options.memory === undefined ? {} : { memory: options.memory }),
    ...(ports.length === 0 ? {} : { ports: portConfiguration(ports) }),
    ...(Object.keys(envs).length === 0 ? {} : { envs: environment(envs) }),
    ...(Object.keys(labels).length === 0 ? {} : { labels }),
    ...(ttl === undefined ? {} : { ttl }),
    ...(options.expires === undefined ? {} : { expires: options.expires }),
    ...(options.lifecycle === undefined
      ? {}
      : { lifecycle: options.lifecycle }),
    ...(options.network === undefined ? {} : { network: options.network }),
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.snapshotEnabled === undefined
      ? {}
      : { snapshotEnabled: options.snapshotEnabled }),
    ...(options.volumes === undefined ? {} : { volumes: [...options.volumes] }),
  };
};

const createSandbox = (raw: Raw, cwd: string): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: (path) => wrap(() => exists(raw, path), "exists"),
    list: (path = cwd) => wrap(() => list(raw, path), "list"),
    mkdir: (path) => wrap(() => mkdir(raw, path), "mkdir"),
    read: (path) => wrap(() => read(raw, path), "read"),
    remove: async (path) => {
      await wrap(() => raw.fs.rm(path, true), "remove");
    },
    stream: async (path) =>
      readable(await wrap(() => read(raw, path), "stream")),
    text: (path) => wrap(() => raw.fs.read(path), "text"),
    write: (path, input) => wrap(() => write(raw, path, input), "write"),
  },
  id: raw.metadata.name,
  ports: {
    expose: async (value) => {
      const target = port(value, provider);
      const preview = await wrap(
        () =>
          raw.previews.createIfNotExists({
            metadata: { name: `sandbox-sdk-${target}` },
            spec: { port: target, public: true },
          }),
        "port exposure"
      );
      const { url } = preview.spec;
      if (!url) {
        throw sandboxError(
          provider,
          "Blaxel preview URL not found",
          "not_found"
        );
      }
      return { port: target, url };
    },
  },
  process: {
    exec: (executable, args = [], options = {}) =>
      execute(raw, cwd, command(executable, args), options),
    shell: (script, options = {}) => shell(raw, cwd, script, options),
    spawn: (executable, args = [], options = {}) =>
      spawn(raw, cwd, command(executable, args), options),
    spawnShell: (script, options = {}) => spawn(raw, cwd, script, options),
  },
  provider,
  raw,
  snapshots: {
    create: () => rejectUnsupported(provider, "normalized snapshot creation"),
    restore: () => rejectUnsupported(provider, "in-place snapshot restore"),
  },
  stop: async () => {
    await wrap(() => raw.delete(), "stop");
  },
});

/** create a blaxel adapter with normalized sandbox operations */
export const blaxel = (options: Blaxel = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    configure(options);
    if (input.snapshot) {
      unsupported(provider, "snapshot source");
    }
    const cwd = input.cwd ?? options.cwd ?? "/app";
    const ports = (input.ports ?? options.ports ?? []).map((value) =>
      port(value, provider)
    );
    const raw =
      input.id === undefined
        ? await SandboxInstance.create(createOptions(options, input, ports), {
            safe: options.safe ?? false,
          })
        : await SandboxInstance.get(input.id);

    await wrap(() => mkdir(raw, cwd), "mkdir");
    return createSandbox(raw, cwd);
  },
  provider,
});
