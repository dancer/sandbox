import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as joinPath } from "node:path";
import { dirname } from "node:path/posix";

import { SandboxInstance, settings } from "@blaxel/core";
import type {
  Config as BlaxelConfig,
  ProcessResponse,
  SandboxCreateConfiguration,
  SandboxLifecycle,
  SandboxUpdateNetwork,
} from "@blaxel/core";
import {
  abort,
  bytes,
  command,
  duration,
  port,
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
  Sandbox,
  Spawn,
  Options,
} from "@sandbox-sdk/core";

import { rejectUnsupported } from "./errors.js";
import type { Blaxel } from "./types.js";

export type { Blaxel, BlaxelRaw } from "./types.js";
export type { SandboxLifecycle, SandboxUpdateNetwork } from "@blaxel/core";

type Raw = SandboxInstance;

const provider = "blaxel";

const secrets = ["BL_API_KEY", "BL_CLIENT_CREDENTIALS"] as const;

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: "separate",
  raw: {
    codegen: true,
    drives: true,
    lifecycle: true,
    network: "dynamic",
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
  streaming: "separate",
};

const rawName = (sandbox: Raw | string): string => {
  const name = typeof sandbox === "string" ? sandbox : sandbox.metadata.name;
  if (name !== undefined && name.length > 0) {
    return name;
  }
  throw sandboxError(
    provider,
    "Blaxel sandbox name missing. Pass a native sandbox with metadata.name or a sandbox name.",
    "configuration"
  );
};

/**
 * replace the network configuration for a running Blaxel sandbox and return its refreshed native instance
 *
 * @example
 * await updateNetwork(sandbox.raw, { proxy: { allowedDomains: ["api.example.com"], routing: [] } })
 */
export const updateNetwork = (
  sandbox: Raw | string,
  network: SandboxUpdateNetwork["network"]
): Promise<Raw> => {
  const update: SandboxUpdateNetwork = network === undefined ? {} : { network };
  return SandboxInstance.updateNetwork(rawName(sandbox), update);
};

/**
 * replace or request clearing the ttl for a running Blaxel sandbox and return its refreshed native instance
 * workspace quota tiers can still enforce a ttl after a clear request
 *
 * @example
 * await updateTtl(sandbox.raw, "1h")
 */
export const updateTtl = (
  sandbox: Raw | string,
  ttl: string | null
): Promise<Raw> => SandboxInstance.updateTtl(rawName(sandbox), ttl);

/**
 * replace or clear the lifecycle configuration for a running Blaxel sandbox and return its refreshed native instance
 *
 * @example
 * await updateLifecycle(sandbox.raw, {
 *   expirationPolicies: [{ action: "delete", type: "ttl-idle", value: "1h" }],
 * })
 */
export const updateLifecycle = (
  sandbox: Raw | string,
  lifecycle: SandboxLifecycle | null
): Promise<Raw> => SandboxInstance.updateLifecycle(rawName(sandbox), lifecycle);

const noop = (): void => void 0;

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
    `Blaxel provider credentials cannot be forwarded into sandbox env: ${leaked.join(", ")}`,
    "configuration"
  );
};

const sandboxEnv = (
  options: Blaxel,
  input: Options
): Readonly<Record<string, string>> => {
  const value = { ...options.env, ...input.env };
  assertSandboxEnv(value);
  return value;
};

const credentials = (
  value: BlaxelConfig["clientCredentials"] | undefined
): boolean =>
  typeof value === "string"
    ? present(value)
    : value !== undefined &&
      present(value.clientId) &&
      present(value.clientSecret);

const credential = (
  value: BlaxelConfig["clientCredentials"] | undefined
): BlaxelConfig["clientCredentials"] | undefined => {
  if (typeof value === "string") {
    return first(value, env("BL_CLIENT_CREDENTIALS"));
  }
  if (credentials(value)) {
    return value;
  }
  return env("BL_CLIENT_CREDENTIALS");
};

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
  const apiKey = first(options.apiKey, options.apikey, env("BL_API_KEY"));
  const clientCredentials = credential(options.clientCredentials);
  const workspace = first(options.workspace, env("BL_WORKSPACE"));

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
  const apiKey = first(options.apiKey, options.apikey, env("BL_API_KEY"));
  const clientCredentials = credential(options.clientCredentials);
  const workspace = first(options.workspace, env("BL_WORKSPACE"));

  if (
    apiKey === undefined &&
    clientCredentials === undefined &&
    options.disableH2 === undefined &&
    options.proxy === undefined &&
    workspace === undefined
  ) {
    return;
  }

  settings.setConfig({
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(clientCredentials === undefined ? {} : { clientCredentials }),
    ...(options.disableH2 === undefined
      ? {}
      : { disableH2: options.disableH2 }),
    ...(options.proxy === undefined ? {} : { proxy: options.proxy }),
    ...(workspace === undefined ? {} : { workspace }),
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

type Channel = "output" | "stderr" | "stdout";

const streams = (): Readonly<{
  append(channel: Channel, chunk: string): void;
  close(): void;
  error(error: unknown): void;
  output: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
}> => {
  const encoder = new TextEncoder();
  const chunks: Record<Channel, Uint8Array[]> = {
    output: [],
    stderr: [],
    stdout: [],
  };
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
        for (const chunk of chunks[channel]) {
          controller.enqueue(chunk);
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
      chunks[channel].push(value);
      for (const controller of controllers[channel]) {
        controller.enqueue(value);
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const group of Object.values(controllers)) {
        for (const controller of group) {
          controller.close();
        }
        group.clear();
      }
    },
    error(error) {
      if (closed) {
        return;
      }
      closed = true;
      for (const group of Object.values(controllers)) {
        for (const controller of group) {
          controller.error(error);
        }
        group.clear();
      }
    },
    output: create("output"),
    stderr: create("stderr"),
    stdout: create("stdout"),
  };
};

const executeBuffered = async (
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
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

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

const status = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(error.message);
    if (
      typeof value === "object" &&
      value !== null &&
      "status" in value &&
      typeof value.status === "number"
    ) {
      return value.status;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const exists = async (raw: Raw, path: string): Promise<boolean> => {
  try {
    await raw.fs.ls(path);
    return true;
  } catch (error) {
    const value = status(error);
    if (value === 404) {
      return false;
    }
    if (value !== undefined) {
      throw error;
    }
  }
  try {
    await raw.fs.readBinary(path);
    return true;
  } catch (error) {
    if (status(error) === 404) {
      return false;
    }
    throw error;
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
  const logs = streams();
  let close = noop;
  try {
    const response = await raw.process.exec({
      command: line,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(timeout === undefined ? {} : { timeout }),
      waitForCompletion: false,
      workingDir: options.cwd ?? cwd,
    });
    const id = response.pid;

    const stream = raw.process.streamLogs(id, {
      onError(error) {
        close();
        logs.error(error);
      },
      onLog(log) {
        logs.append("output", log);
      },
      onStderr(log) {
        logs.append("stderr", log);
      },
      onStdout(log) {
        logs.append("stdout", log);
      },
    });
    ({ close } = stream);
    void (async () => {
      try {
        await stream.wait();
      } finally {
        logs.close();
      }
    })();

    const process = (async (): Promise<Result> => {
      try {
        return complete(await raw.process.wait(id, { maxWait }));
      } finally {
        close();
        logs.close();
      }
    })();

    const cancel = (): void => {
      void (async () => {
        try {
          await raw.process.kill(id);
        } finally {
          close();
          logs.close();
        }
      })();
    };
    if (options.signal?.aborted) {
      cancel();
    } else {
      options.signal?.addEventListener("abort", cancel, { once: true });
    }

    return {
      id,
      kill: async () => {
        options.signal?.removeEventListener("abort", cancel);
        await raw.process.kill(id);
        close();
        logs.close();
      },
      output: logs.output,
      result: (async () => {
        try {
          return await process;
        } finally {
          options.signal?.removeEventListener("abort", cancel);
        }
      })(),
      stderr: logs.stderr,
      stdout: logs.stdout,
    };
  } catch (error) {
    close();
    logs.close();
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const execute = async (
  raw: Raw,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  const { signal } = options;
  if (signal !== undefined) {
    const running = await spawn(raw, cwd, line, options);
    const output = await running.result;
    if (signal.aborted) {
      abort(provider, signal.reason);
    }
    return output;
  }
  return executeBuffered(raw, cwd, line, options);
};

const shell = (
  raw: Raw,
  cwd: string,
  script: string,
  options: Exec
): Promise<Result> => execute(raw, cwd, script, options);

const sandboxName = (value: string | undefined): string | undefined => {
  if (value !== undefined && value.length > 49) {
    throw sandboxError(
      provider,
      "Blaxel sandbox names must be 49 characters or fewer",
      "configuration"
    );
  }
  return value;
};

const createOptions = (
  options: Blaxel,
  input: Options,
  ports: readonly number[],
  envs: Readonly<Record<string, string>>
): SandboxCreateConfiguration => {
  const name = sandboxName(input.id ?? options.name);
  const image = input.template ?? options.image;
  const labels = { ...options.labels, ...input.metadata };
  const timeout =
    options.ttl === undefined ? seconds(input.timeout) : undefined;
  const ttl =
    options.ttl ??
    (timeout === undefined ? undefined : `${Math.max(1, timeout)}s`);

  return {
    ...options.options,
    ...(options.externalId === undefined
      ? {}
      : { externalId: options.externalId }),
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
    exists: (path) => wrap(() => exists(raw, sandboxPath(cwd, path)), "exists"),
    list: (path = cwd) => wrap(() => list(raw, sandboxPath(cwd, path)), "list"),
    mkdir: (path) => wrap(() => mkdir(raw, sandboxPath(cwd, path)), "mkdir"),
    read: (path) => wrap(() => read(raw, sandboxPath(cwd, path)), "read"),
    remove: async (path) => {
      await wrap(() => raw.fs.rm(sandboxPath(cwd, path), true), "remove");
    },
    stream: async (path) =>
      readable(await wrap(() => read(raw, sandboxPath(cwd, path)), "stream")),
    text: (path) => wrap(() => raw.fs.read(sandboxPath(cwd, path)), "text"),
    write: (path, input) =>
      wrap(() => write(raw, sandboxPath(cwd, path), input), "write"),
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
    if (input.snapshot) {
      unsupported(provider, "snapshot source");
    }
    const envs = input.id === undefined ? sandboxEnv(options, input) : {};
    configure(options);
    const cwd = input.cwd ?? options.cwd ?? "/app";
    const ports = (input.ports ?? options.ports ?? []).map((value) =>
      port(value, provider)
    );
    const raw =
      input.id === undefined
        ? await SandboxInstance.create(
            createOptions(options, input, ports, envs),
            {
              safe: options.safe ?? false,
            }
          )
        : await SandboxInstance.get(input.id);

    await wrap(() => mkdir(raw, cwd), "mkdir");
    return createSandbox(raw, cwd);
  },
  provider,
});
