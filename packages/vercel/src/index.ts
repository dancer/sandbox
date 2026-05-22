import {
  SandboxError,
  abort,
  bytes,
  duration,
  sandboxError,
  port,
  result,
  timeout,
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

/** native Vercel Sandbox object exposed as `sandbox.raw` */
export type VercelRaw = VercelSandbox;

/** source used to seed a new Vercel sandbox */
export type Source =
  | Readonly<{
      /** shallow clone depth for git sources */
      depth?: number;
      /** git branch, tag, or commit to check out */
      revision?: string;
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
      type: "git";
      /** private git repository url */
      url: string;
      /** username for the private git source */
      username: string;
    }>
  | Readonly<{
      type: "tarball";
      /** tarball url used as the sandbox source */
      url: string;
    }>;

/** Vercel sandbox resource request */
export type Resources = Readonly<{
  /** requested virtual cpu count */
  vcpus: number;
}>;

/** Vercel sandbox runtime id */
export type Runtime =
  | "node26"
  | "node24"
  | "node22"
  | "python3.13"
  | (string & { readonly __vercelRuntime?: never });

/** Vercel sandbox snapshot retention policy */
export type KeepLastSnapshots = Readonly<{
  /** number of snapshots to retain */
  count: number;
  /** expiration in milliseconds applied to retained snapshots */
  expiration?: number;
  /** delete evicted snapshots immediately when true */
  deleteEvicted?: boolean;
}>;

/** Vercel sandbox fork source */
export type Fork = Readonly<{
  /** source sandbox name to fork from */
  sourceSandbox: string;
}>;

/** Vercel sandbox adapter configuration */
export type Vercel = Readonly<{
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** default environment variables applied when creating a sandbox */
  env?: Readonly<Record<string, string>>;
  /** custom fetch implementation passed to @vercel/sandbox */
  fetch?: typeof fetch;
  /** fork a new sandbox from an existing named Vercel sandbox */
  fork?: Fork | string;
  /** use Sandbox.getOrCreate for idempotent named sandbox creation */
  getOrCreate?: boolean;
  /** retain only the most recent snapshots for this sandbox */
  keepLastSnapshots?: KeepLastSnapshots;
  /** Vercel sandbox name for create and getOrCreate flows */
  name?: string;
  /** Vercel network policy for the sandbox */
  networkPolicy?: NetworkPolicy;
  /** ports exposed when the sandbox is created; ports.expose can add more later */
  ports?: readonly number[];
  /** enable or disable automatic restore between Vercel sandbox sessions */
  persistent?: boolean;
  /** Vercel project id; falls back to VERCEL_PROJECT_ID when using access-token auth */
  projectId?: string;
  /** resource request for new sandboxes */
  resources?: Resources;
  /** Vercel runtime id such as node26, node24, node22, or python3.13 */
  runtime?: Runtime;
  /** abort signal for sandbox creation, get, getOrCreate, or fork */
  signal?: AbortSignal;
  /** git or tarball source used for new sandboxes */
  source?: Source;
  /** run commands with sudo when supported by Vercel Sandbox */
  sudo?: boolean;
  /** expiration in milliseconds for snapshots created through the normalized api */
  snapshotExpiration?: number;
  /** metadata tags attached to the Vercel sandbox */
  tags?: Readonly<Record<string, string>>;
  /** Vercel team id; falls back to VERCEL_TEAM_ID when using access-token auth */
  teamId?: string;
  /** sandbox lifetime timeout in milliseconds */
  timeout?: number;
  /** Vercel access token; falls back to VERCEL_TOKEN */
  token?: string;
  /** called by @vercel/sandbox when a named sandbox is newly created */
  onCreate?: (sandbox: VercelRaw) => Promise<void>;
  /** called by @vercel/sandbox when a named sandbox session resumes */
  onResume?: (sandbox: VercelRaw) => Promise<void>;
}>;

type Raw = VercelRaw;

type VercelCreate = NonNullable<Parameters<typeof VercelSandbox.create>[0]>;

type VercelGet = Parameters<typeof VercelSandbox.get>[0];

type VercelSignal = NonNullable<Parameters<NativeCommand["kill"]>[0]>;

const provider = "vercel";

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

const env = (name: string): string | undefined =>
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.[name];

const decode = (value: string): unknown => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(globalThis.atob(padded));
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
  const projectId = options.projectId ?? env("VERCEL_PROJECT_ID");
  const teamId = options.teamId ?? env("VERCEL_TEAM_ID");
  const token = options.token ?? env("VERCEL_TOKEN");
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

const auth = (
  options: Vercel
): Pick<VercelCreate, "fetch"> & {
  projectId?: string;
  teamId?: string;
  token?: string;
} => ({
  ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  ...credentials(options),
});

const createInput = (
  options: Vercel,
  input: NonNullable<Parameters<Adapter<Raw>["create"]>[0]>,
  ports: readonly number[]
): VercelCreate => {
  const snapshot = input.snapshot ?? input.template;
  const lifetime = duration(input.timeout ?? options.timeout, provider);
  return {
    ...auth(options),
    env: { ...options.env, ...input.env },
    keepLastSnapshots: options.keepLastSnapshots,
    name: input.id ?? options.name,
    networkPolicy: options.networkPolicy,
    onResume: options.onResume,
    persistent: options.persistent,
    ports: [...ports],
    resources: options.resources,
    runtime: options.runtime,
    signal: options.signal,
    snapshotExpiration: options.snapshotExpiration,
    source:
      snapshot === undefined
        ? options.source
        : { snapshotId: snapshot, type: "snapshot" },
    tags:
      input.metadata === undefined && options.tags === undefined
        ? undefined
        : { ...options.tags, ...input.metadata },
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
  source: AsyncIterable<{ data: string; stream: string }>
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(next.value.data));
    },
  });
};

const readable = (value: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
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
  const output = await raw.readFileToBuffer({ cwd, path });
  if (output === null) {
    throw sandboxError(provider, "Path not found", "not_found");
  }
  return new Uint8Array(output);
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
    });
    return result(
      output.exitCode,
      await output.stdout(signals),
      await output.stderr(signals)
    );
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
    return result(
      output.exitCode,
      await output.stdout(signals),
      await output.stderr(signals)
    );
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
    });
    return {
      id: running.cmdId,
      kill: async (signal = "SIGTERM") => {
        await running.kill(signal as VercelSignal);
      },
      output: stream(running.logs(signals)),
      result: wait(running, deadline, options.signal),
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
      exists: (path) => wrap(() => raw.fs.exists(path), "exists"),
      list: async (path = cwd) => {
        const entries = await wrap(
          () => raw.fs.readdir(path, { withFileTypes: true }),
          "list"
        );
        return entries
          .map(
            (entry): Entry => ({
              kind: entry.isDirectory() ? "directory" : "file",
              path: `${path.replace(/\/$/u, "")}/${entry.name}`,
            })
          )
          .toSorted((left, right) => left.path.localeCompare(right.path));
      },
      mkdir: async (path) => {
        await wrap(() => raw.fs.mkdir(path, { recursive: true }), "mkdir");
      },
      read: (path) => wrap(() => read(raw, path, cwd), "read"),
      remove: async (path) => {
        await wrap(
          () => raw.fs.rm(path, { force: true, recursive: true }),
          "remove"
        );
      },
      stream: async (path) =>
        readable(await wrap(() => read(raw, path, cwd), "read")),
      text: async (path) =>
        new TextDecoder().decode(
          await wrap(() => read(raw, path, cwd), "read")
        ),
      write: async (path: string, input: Input) => {
        await wrap(
          async () => raw.writeFiles([{ content: await bytes(input), path }]),
          "write"
        );
      },
    },
    id: raw.name,
    ports: {
      expose: async (value) => {
        const target = port(value, provider);
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
      create: async () => {
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

/** create a Vercel Sandbox adapter with normalized sandbox operations */
export const vercel = (options: Vercel = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const cwd = input.cwd ?? options.cwd ?? "/vercel/sandbox";
    const ports = (input.ports ?? options.ports ?? []).map((value) =>
      port(value, provider)
    );
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
