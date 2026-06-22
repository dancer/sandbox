import { Buffer } from "node:buffer";
import { dirname } from "node:path/posix";

import {
  SandboxError,
  abort,
  bytes,
  duration,
  port,
  portOptions,
  result,
  sandboxError,
  sandboxPath,
  timeout,
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
} from "@sandbox-sdk/core";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import type { Command as NativeCommand, NetworkPolicy } from "@vercel/sandbox";

export {
  APIError as VercelAPIError,
  Command as VercelCommand,
  CommandFinished as VercelCommandFinished,
  FileSystem as VercelFileSystem,
  Sandbox as VercelSandbox,
  Session as VercelSession,
  Snapshot as VercelSnapshot,
  StreamError as VercelStreamError,
  defineSandboxProxy as defineVercelSandboxProxy,
} from "@vercel/sandbox";
export type {
  CommandOutput as VercelCommandOutput,
  InvalidRequestProxyHandler as VercelInvalidRequestProxyHandler,
  NetworkPolicy as VercelNetworkPolicy,
  NetworkPolicyKeyValueMatcher as VercelNetworkPolicyKeyValueMatcher,
  NetworkPolicyMatch as VercelNetworkPolicyMatch,
  NetworkPolicyMatcher as VercelNetworkPolicyMatcher,
  NetworkPolicyRule as VercelNetworkPolicyRule,
  NetworkTransformer as VercelNetworkTransformer,
  SerializedCommand as SerializedVercelCommand,
  SerializedCommandFinished as SerializedVercelCommandFinished,
  ProxyHandler as VercelProxyHandler,
  ProxyMeta as VercelProxyMeta,
  SerializedSandbox as SerializedVercelSandbox,
  SerializedSnapshot as SerializedVercelSnapshot,
  SnapshotTreeNodeData as VercelSnapshotTreeNodeData,
} from "@vercel/sandbox";

/** native Vercel Sandbox object exposed as `sandbox.raw` for provider-specific controls */
export type VercelRaw = VercelSandbox;

/**
 * minimal Fetch API contract accepted by Vercel Sandbox requests
 *
 * accepts standard fetch implementations and test doubles without requiring runtime-specific static members
 */
export type VercelFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** source used to seed a new Vercel sandbox */
export type Source =
  | Readonly<{
      /** shallow clone depth for git sources */
      depth?: number;
      /** git branch, tag, or commit to check out */
      revision?: string;
      /** git source discriminator */
      type: "git";
      /** public git repository url */
      url: string;
    }>
  | Readonly<{
      /** shallow clone depth for private git sources */
      depth?: number;
      /** password or token for the private git source */
      password: string;
      /** git branch, tag, or commit to check out */
      revision?: string;
      /** git source discriminator */
      type: "git";
      /** private git repository url */
      url: string;
      /** username for the private git source */
      username: string;
    }>
  | Readonly<{
      /** tarball source discriminator */
      type: "tarball";
      /** tarball url used as the sandbox source */
      url: string;
    }>;

/**
 * Vercel Sandbox resource request
 *
 * each requested vcpu includes 2048 MB of memory, subject to Vercel plan limits
 */
export type Resources = Readonly<{
  /** requested positive integer virtual cpu count, subject to Vercel plan limits */
  vcpus: number;
}>;

/**
 * Vercel Sandbox runtime identifier
 *
 * the string fallback accepts a newer Vercel runtime before this package is updated
 */
export type Runtime =
  | "node26"
  | "node24"
  | "node22"
  | "python3.13"
  | (string & { readonly __vercelRuntime?: never });

/** Vercel Sandbox snapshot retention policy */
export type KeepLastSnapshots = Readonly<{
  /** number of snapshots to retain, from 1 through 10 */
  count: number;
  /** expiration in milliseconds applied to retained snapshots, with zero disabling expiration */
  expiration?: number;
  /** delete evicted snapshots immediately instead of keeping their default expiration */
  deleteEvicted?: boolean;
}>;

/** Vercel Sandbox fork source */
export type Fork = Readonly<{
  /** named source sandbox whose current snapshot and configuration seed the fork */
  sourceSandbox: string;
}>;

/**
 * Vercel Sandbox adapter configuration
 *
 * authentication uses `VERCEL_OIDC_TOKEN` when present or `token`, `teamId`, and
 * `projectId` together for explicit access-token authentication
 */
export type Vercel = Readonly<{
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** default process environment for create, fork, and get-or-create; rejects VERCEL_OIDC_TOKEN and VERCEL_TOKEN */
  env?: Readonly<Record<string, string>>;
  /** custom fetch implementation passed to `@vercel/sandbox` */
  fetch?: VercelFetch;
  /** fork every new sandbox from an existing named Vercel sandbox */
  fork?: Fork | string;
  /** reuse a named sandbox when present and create it when absent */
  getOrCreate?: boolean;
  /** retention policy for snapshots created by this sandbox */
  keepLastSnapshots?: KeepLastSnapshots;
  /** provider sandbox name used when the create input does not supply an id */
  name?: string;
  /** outbound network policy for the sandbox, including optional Vercel transformations */
  networkPolicy?: NetworkPolicy;
  /** initial public ports, with create input values taking precedence and a Vercel maximum of four unique ports per sandbox */
  ports?: readonly number[];
  /**
   * control automatic filesystem restoration between Vercel sandbox sessions
   *
   * Vercel defaults to `true`. set `false` when resumed sessions must start without restored files. use durable storage for artifacts that must outlive the sandbox
   */
  persistent?: boolean;
  /** Vercel project id; falls back to VERCEL_PROJECT_ID when using access-token auth */
  projectId?: string;
  /** resource request for new sandboxes */
  resources?: Resources;
  /** Vercel runtime id such as node26, node24, node22, or python3.13 */
  runtime?: Runtime;
  /** signal that cancels sandbox creation, get, get-or-create, or fork requests */
  signal?: AbortSignal;
  /** git or tarball source used for new sandboxes */
  source?: Source;
  /** run normalized commands with sudo when supported by Vercel Sandbox */
  sudo?: boolean;
  /** default expiration in milliseconds for snapshots created through the normalized API */
  snapshotExpiration?: number;
  /** metadata tags attached to the Vercel sandbox, merged with create metadata and limited to five unique keys */
  tags?: Readonly<Record<string, string>>;
  /** Vercel team id; falls back to VERCEL_TEAM_ID when using access-token auth */
  teamId?: string;
  /** requested sandbox lifetime in milliseconds, subject to Vercel plan limits */
  timeout?: number;
  /** Vercel access token; falls back to VERCEL_TOKEN */
  token?: string;
  /** called with the native sandbox when a named get-or-create sandbox is newly created */
  onCreate?: (sandbox: VercelRaw) => Promise<void>;
  /** called with the native sandbox when a named sandbox session resumes */
  onResume?: (sandbox: VercelRaw) => Promise<void>;
}>;

type Raw = VercelRaw;

type VercelCreate = NonNullable<Parameters<typeof VercelSandbox.create>[0]>;

type VercelGet = Parameters<typeof VercelSandbox.get>[0];

type VercelSignal = NonNullable<Parameters<NativeCommand["kill"]>[0]>;

type Authentication = Readonly<{
  fetch?: VercelFetch;
  projectId?: string;
  teamId?: string;
  token?: string;
}>;

const provider = "vercel";

const secrets = ["VERCEL_OIDC_TOKEN", "VERCEL_TOKEN"] as const;

const maximumPorts = 4;

const maximumTags = 5;

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: "separate",
  raw: {
    lifecycle: "dynamic",
    metrics: true,
    network: "dynamic",
    previews: "dynamic",
    pty: true,
    resources: "dynamic",
    sessions: "dynamic",
  },
  snapshotCreate: "disk",
  snapshotRestore: "disk",
  snapshotSource: "create-time",
  snapshots: "disk",
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
    `Vercel provider credentials cannot be forwarded into sandbox env: ${leaked.join(", ")}`,
    "configuration"
  );
};

const decode = (value: string): unknown => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
};

const oidc = (
  token: string | undefined
):
  | {
      projectId: string;
      teamId: string;
      token: string;
    }
  | undefined => {
  if (!present(token)) {
    return undefined;
  }
  try {
    const payload = decode(token.split(".")[1] ?? "");
    if (
      typeof payload === "object" &&
      payload !== null &&
      "owner_id" in payload &&
      "project_id" in payload &&
      typeof payload.owner_id === "string" &&
      typeof payload.project_id === "string"
    ) {
      if (
        "exp" in payload &&
        typeof payload.exp === "number" &&
        payload.exp * 1000 <= Date.now()
      ) {
        throw sandboxError(
          provider,
          "VERCEL_OIDC_TOKEN has expired. Run `vercel env pull .env.local --scope birthstone --yes` and retry.",
          "configuration"
        );
      }
      return {
        projectId: payload.project_id,
        teamId: payload.owner_id,
        token,
      };
    }
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw sandboxError(
      provider,
      "VERCEL_OIDC_TOKEN must be a valid Vercel OIDC token.",
      "configuration",
      error
    );
  }
  throw sandboxError(
    provider,
    "VERCEL_OIDC_TOKEN must include owner_id and project_id claims.",
    "configuration"
  );
};

const credentials = (
  options: Vercel
): {
  projectId?: string;
  teamId?: string;
  token?: string;
} => {
  const projectId = first(options.projectId, env("VERCEL_PROJECT_ID"));
  const teamId = first(options.teamId, env("VERCEL_TEAM_ID"));
  const token = first(options.token, env("VERCEL_TOKEN"));
  if (present(token) || present(teamId) || present(projectId)) {
    return {
      ...(present(projectId) ? { projectId } : {}),
      ...(present(teamId) ? { teamId } : {}),
      ...(present(token) ? { token } : {}),
    };
  }
  const fallback = oidc(env("VERCEL_OIDC_TOKEN"));
  if (fallback !== undefined) {
    return fallback;
  }
  return {
    ...(present(projectId) ? { projectId } : {}),
    ...(present(teamId) ? { teamId } : {}),
    ...(present(token) ? { token } : {}),
  };
};

const validate = (options: Vercel): void => {
  const input = credentials(options);
  if (
    present(input.token) &&
    present(input.teamId) &&
    present(input.projectId)
  ) {
    return;
  }
  if (present(input.token)) {
    throw sandboxError(
      provider,
      "Vercel access token authentication requires VERCEL_TEAM_ID and VERCEL_PROJECT_ID, or pass teamId and projectId to vercel().",
      "configuration"
    );
  }
  throw sandboxError(
    provider,
    "Vercel credentials missing. Set VERCEL_OIDC_TOKEN, or set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID.",
    "configuration"
  );
};

const auth = (options: Vercel): Authentication => ({
  ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  ...credentials(options),
});

const retention = (
  value: KeepLastSnapshots | undefined
): VercelCreate["keepLastSnapshots"] => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value.count) || value.count < 1 || value.count > 10) {
    throw sandboxError(
      provider,
      "keepLastSnapshots.count must be an integer from 1 to 10",
      "configuration"
    );
  }
  const output: NonNullable<VercelCreate["keepLastSnapshots"]> = {
    count: value.count,
  };
  if (value.deleteEvicted !== undefined) {
    output.deleteEvicted = value.deleteEvicted;
  }
  if (value.expiration !== undefined) {
    const expiration = duration(
      value.expiration,
      provider,
      "keepLastSnapshots.expiration"
    );
    if (expiration !== undefined) {
      output.expiration = expiration;
    }
  }
  return output;
};

const declaredPorts = (value: readonly number[]): readonly number[] => {
  const output = [...new Set(value.map((entry) => port(entry, provider)))];
  if (output.length > maximumPorts) {
    throw sandboxError(
      provider,
      `Vercel sandboxes can expose up to ${maximumPorts} ports`,
      "configuration"
    );
  }
  return output;
};

const requestedResources = (
  value: Resources | undefined
): Resources | undefined => {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value.vcpus) || value.vcpus < 1) {
    throw sandboxError(
      provider,
      "resources.vcpus must be a positive integer",
      "configuration"
    );
  }
  return value;
};

const sandboxTags = (
  defaults: Readonly<Record<string, string>> | undefined,
  metadata: Readonly<Record<string, string>> | undefined
): Record<string, string> | undefined => {
  const output = { ...defaults, ...metadata };
  const count = Object.keys(output).length;
  if (count > maximumTags) {
    throw sandboxError(
      provider,
      `Vercel sandboxes support up to ${maximumTags} tags`,
      "configuration"
    );
  }
  return count === 0 ? undefined : output;
};

const createInput = (
  options: Vercel,
  input: NonNullable<Parameters<Adapter<Raw>["create"]>[0]>,
  ports: readonly number[]
): VercelCreate => {
  const snapshot = input.snapshot ?? input.template;
  const environment = { ...options.env, ...input.env };
  const lifetime = duration(input.timeout ?? options.timeout, provider);
  const snapshotExpiration = duration(
    options.snapshotExpiration,
    provider,
    "snapshotExpiration"
  );
  const tags = sandboxTags(options.tags, input.metadata);
  const resources = requestedResources(options.resources);
  assertSandboxEnv(environment);
  return {
    ...auth(options),
    env: environment,
    keepLastSnapshots: retention(options.keepLastSnapshots),
    name: input.id ?? options.name,
    networkPolicy: options.networkPolicy,
    onResume: options.onResume,
    persistent: options.persistent,
    ports: [...ports],
    resources,
    runtime: options.runtime,
    signal: options.signal,
    snapshotExpiration,
    source:
      snapshot === undefined
        ? options.source
        : { snapshotId: snapshot, type: "snapshot" },
    tags,
    ...(lifetime === undefined ? {} : { timeout: lifetime }),
  } as VercelCreate;
};

const getInput = (options: Vercel, id: string): VercelGet =>
  ({
    ...auth(options),
    name: id,
    onResume: options.onResume,
    resume: true,
    signal: options.signal,
  }) as VercelGet;

const forkInput = (
  options: Vercel,
  input: NonNullable<Parameters<Adapter<Raw>["create"]>[0]>,
  ports: readonly number[]
): Parameters<typeof VercelSandbox.fork>[0] => {
  const create = createInput(options, input, ports);
  const source =
    typeof options.fork === "string"
      ? options.fork
      : options.fork?.sourceSandbox;
  return {
    ...create,
    sourceSandbox: source,
  } as Parameters<typeof VercelSandbox.fork>[0];
};

const getOrCreateInput = (
  options: Vercel,
  input: NonNullable<Parameters<Adapter<Raw>["create"]>[0]>,
  ports: readonly number[]
): Parameters<typeof VercelSandbox.getOrCreate>[0] =>
  ({
    ...createInput(options, input, ports),
    onCreate: options.onCreate,
  }) as Parameters<typeof VercelSandbox.getOrCreate>[0];

const stream = (
  source: AsyncIterable<{ data: string; stream: string }>,
  channel?: "stderr" | "stdout"
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async cancel() {
      await iterator.return?.();
    },
    async pull(controller) {
      while (true) {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        if (channel === undefined || next.value.stream === channel) {
          controller.enqueue(encoder.encode(next.value.data));
          return;
        }
      }
    },
  });
};

const fileStream = (
  source: NodeJS.ReadableStream
): ReadableStream<Uint8Array> =>
  new ReadableStream({
    cancel() {
      const value = source as NodeJS.ReadableStream & {
        destroy?: () => void;
      };
      value.destroy?.();
    },
    start(controller) {
      source.on("data", (chunk: string | Uint8Array) => {
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk
        );
      });
      source.on("end", () => {
        controller.close();
      });
      source.on("error", (error) => {
        controller.error(error);
      });
    },
  });

const wrap = async <Value>(
  action: () => Promise<Value> | Value,
  feature: string
): Promise<Value> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw sandboxError(provider, `${feature} failed`, "provider", error);
  }
};

const stopped = (raw: Raw): boolean => {
  try {
    return raw.status === "stopped";
  } catch {
    return true;
  }
};

const stopActive = async (raw: Raw): Promise<void> => {
  if (stopped(raw)) {
    return;
  }
  await raw.stop();
};

const routePorts = (raw: Raw): readonly number[] => {
  try {
    return raw.routes.map((route) => route.port);
  } catch {
    return [];
  }
};

const createRaw = (
  options: Vercel,
  input: NonNullable<Parameters<Adapter<Raw>["create"]>[0]>,
  ports: readonly number[]
): Promise<Raw> => {
  if (input.id !== undefined) {
    return VercelSandbox.get(getInput(options, input.id));
  }
  if (options.fork !== undefined) {
    return VercelSandbox.fork(forkInput(options, input, ports));
  }
  if (options.getOrCreate) {
    return VercelSandbox.getOrCreate(getOrCreateInput(options, input, ports));
  }
  return VercelSandbox.create(createInput(options, input, ports));
};

const read = async (
  raw: Raw,
  path: string,
  cwd: string
): Promise<Uint8Array> => {
  const output = await raw.readFileToBuffer({
    cwd,
    path: sandboxPath(cwd, path),
  });
  if (output === null) {
    throw sandboxError(provider, "Path not found", "not_found");
  }
  return new Uint8Array(output);
};

const streamFile = async (
  raw: Raw,
  path: string,
  cwd: string
): Promise<ReadableStream<Uint8Array>> => {
  const output = await raw.readFile({ cwd, path: sandboxPath(cwd, path) });
  if (output === null) {
    throw sandboxError(provider, "Path not found", "not_found");
  }
  return fileStream(output);
};

const parent = (path: string): string | undefined => {
  const directory = dirname(path);
  return directory === "." || directory === "/" ? undefined : directory;
};

const execute = async (
  raw: Raw,
  cwd: string,
  sudo: boolean | undefined,
  command: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => {
  const deadline = timeout(options.timeout, options.signal, provider);
  const signals =
    deadline.signal === undefined ? {} : { signal: deadline.signal };
  try {
    const output = await raw.runCommand({
      args: [...args],
      cmd: command,
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...signals,
      ...(sudo === undefined ? {} : { sudo }),
      ...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
    });
    const stdout = await output.stdout(signals);
    const stderr = await output.stderr(signals);
    if (options.signal?.aborted) {
      abort(provider, options.signal.reason);
    }
    if (deadline.aborted()) {
      throw sandboxError(provider, "Command timed out", "timeout", output);
    }
    return result(output.exitCode, stdout, stderr);
  } catch (error) {
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    if (deadline.aborted()) {
      throw sandboxError(provider, "Command timed out", "timeout", error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  } finally {
    deadline.clear();
  }
};

const wait = async (
  running: NativeCommand,
  deadline: ReturnType<typeof timeout>,
  signal?: AbortSignal
): Promise<Result> => {
  const signals =
    deadline.signal === undefined ? {} : { signal: deadline.signal };
  try {
    const output = await running.wait(signals);
    const stdout = await output.stdout(signals);
    const stderr = await output.stderr(signals);
    if (signal?.aborted) {
      abort(provider, signal.reason);
    }
    if (deadline.aborted()) {
      throw sandboxError(provider, "Command timed out", "timeout", output);
    }
    return result(output.exitCode, stdout, stderr);
  } catch (error) {
    if (signal?.aborted) {
      abort(provider, error);
    }
    if (deadline.aborted()) {
      throw sandboxError(provider, "Command timed out", "timeout", error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  } finally {
    deadline.clear();
  }
};

const spawn = async (
  raw: Raw,
  cwd: string,
  sudo: boolean | undefined,
  command: string,
  args: readonly string[],
  options: Exec
): Promise<Running> => {
  const deadline = timeout(options.timeout, options.signal, provider);
  const signals =
    deadline.signal === undefined ? {} : { signal: deadline.signal };
  try {
    const running = await raw.runCommand({
      args: [...args],
      cmd: command,
      cwd: options.cwd ?? cwd,
      detached: true,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...signals,
      ...(sudo === undefined ? {} : { sudo }),
      ...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
    });
    const cancel = (): void => {
      void running.kill("SIGTERM");
    };
    const dispose = (): void => {
      deadline.signal?.removeEventListener("abort", cancel);
    };
    if (deadline.signal?.aborted) {
      cancel();
    } else {
      deadline.signal?.addEventListener("abort", cancel, { once: true });
    }
    return {
      id: running.cmdId,
      kill: async (signal = "SIGTERM") => {
        dispose();
        await running.kill(signal as VercelSignal);
      },
      output: stream(running.logs(signals)),
      result: (async () => {
        try {
          return await wait(running, deadline, options.signal);
        } finally {
          dispose();
        }
      })(),
      stderr: stream(running.logs(signals), "stderr"),
      stdout: stream(running.logs(signals), "stdout"),
    };
  } catch (error) {
    deadline.clear();
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    if (deadline.aborted()) {
      throw sandboxError(provider, "Command timed out", "timeout", error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const createSandbox = (
  raw: Raw,
  cwd: string,
  sudo: boolean | undefined,
  ports: readonly number[],
  snapshotExpiration: number | undefined
): Sandbox<Raw> => {
  const exposed = new Set([...ports, ...routePorts(raw)]);
  return {
    capabilities,
    cwd,
    files: {
      exists: (path) =>
        wrap(() => raw.fs.exists(sandboxPath(cwd, path)), "exists"),
      list: async (path = cwd) => {
        const target = sandboxPath(cwd, path);
        const entries = await wrap(
          () => raw.fs.readdir(target, { withFileTypes: true }),
          "list"
        );
        return entries
          .map(
            (entry): Entry => ({
              kind: entry.isDirectory() ? "directory" : "file",
              path: `${target.replace(/\/$/u, "")}/${entry.name}`,
            })
          )
          .toSorted((left, right) => left.path.localeCompare(right.path));
      },
      mkdir: async (path) => {
        await wrap(
          () => raw.fs.mkdir(sandboxPath(cwd, path), { recursive: true }),
          "mkdir"
        );
      },
      read: (path) => wrap(() => read(raw, path, cwd), "read"),
      remove: async (path) => {
        await wrap(
          () =>
            raw.fs.rm(sandboxPath(cwd, path), { force: true, recursive: true }),
          "remove"
        );
      },
      stream: (path) => wrap(() => streamFile(raw, path, cwd), "read"),
      text: async (path) =>
        new TextDecoder().decode(
          await wrap(() => read(raw, path, cwd), "read")
        ),
      write: async (path: string, input: Input) => {
        await wrap(async () => {
          const target = sandboxPath(cwd, path);
          const directory = parent(target);
          if (directory !== undefined) {
            await raw.fs.mkdir(directory, { recursive: true });
          }
          await raw.writeFiles([{ content: await bytes(input), path: target }]);
        }, "write");
      },
    },
    id: raw.name,
    ports: {
      expose: async (value, options) => {
        const target = port(value, provider);
        portOptions(provider, options, "https");
        if (!exposed.has(target)) {
          if (exposed.size >= 4) {
            throw sandboxError(
              provider,
              "Vercel sandboxes can expose up to 4 ports",
              "configuration"
            );
          }
          const next = [...exposed, target];
          await wrap(() => raw.update({ ports: next }), "port update");
          exposed.add(target);
        }
        const preview = await wrap(
          () => ({
            port: target,
            url: raw.domain(target),
          }),
          "port exposure"
        );
        return preview;
      },
    },
    process: {
      exec: (command, args = [], options = {}) =>
        execute(raw, cwd, sudo, command, args, options),
      shell: (command, options = {}) =>
        execute(raw, cwd, sudo, "sh", ["-lc", command], options),
      spawn: (command, args = [], options = {}) =>
        spawn(raw, cwd, sudo, command, args, options),
      spawnShell: (command, options = {}) =>
        spawn(raw, cwd, sudo, "sh", ["-lc", command], options),
    },
    provider,
    raw,
    snapshots: {
      create: async (name) => {
        if (name !== undefined) {
          unsupported(provider, "named snapshots");
        }
        const expiration = duration(
          snapshotExpiration,
          provider,
          "snapshotExpiration"
        );
        const snapshot = await wrap(
          () =>
            raw.snapshot(expiration === undefined ? undefined : { expiration }),
          "snapshot"
        );
        return { id: snapshot.snapshotId };
      },
      restore: async (id) => {
        if (!present(id)) {
          throw sandboxError(
            provider,
            "Vercel snapshot id is required for restore",
            "configuration"
          );
        }
        await wrap(async () => {
          await stopActive(raw);
          await raw.update({ currentSnapshotId: id });
        }, "snapshot restore");
      },
    },
    stop: async () => {
      await wrap(() => stopActive(raw), "stop");
    },
  };
};

/**
 * create a Vercel Sandbox adapter with normalized sandbox operations
 *
 * Vercel does not persist arbitrary snapshot names, so call `snapshots.create()` without a name
 */
export const vercel = (options: Vercel = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const cwd = input.cwd ?? options.cwd ?? "/vercel/sandbox";
    const ports = declaredPorts(input.ports ?? options.ports ?? []);
    const raw = await createRaw(options, input, ports);

    if (input.id === undefined) {
      await raw.fs.mkdir(cwd, { recursive: true });
    }

    return createSandbox(
      raw,
      cwd,
      options.sudo,
      ports,
      options.snapshotExpiration
    );
  },
  provider,
});

/** alias for users who prefer the explicit provider name */
export const vercelSandbox = vercel;
