import {
  SandboxError,
  abort,
  bytes,
  error as sandboxError,
  result,
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
import type { Command as VercelCommand, NetworkPolicy } from "@vercel/sandbox";

export type Source =
  | Readonly<{
      depth?: number;
      revision?: string;
      type: "git";
      url: string;
    }>
  | Readonly<{
      depth?: number;
      password: string;
      revision?: string;
      type: "git";
      url: string;
      username: string;
    }>
  | Readonly<{
      type: "tarball";
      url: string;
    }>;

export type Resources = Readonly<{
  vcpus: number;
}>;

export type Vercel = Readonly<{
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  fetch?: typeof fetch;
  networkPolicy?: NetworkPolicy;
  ports?: readonly number[];
  projectId?: string;
  resources?: Resources;
  runtime?: string;
  source?: Source;
  sudo?: boolean;
  teamId?: string;
  timeout?: number;
  token?: string;
}>;

type Raw = VercelSandbox;

type VercelCreate = NonNullable<Parameters<typeof VercelSandbox.create>[0]>;

type VercelGet = Parameters<typeof VercelSandbox.get>[0];

const provider = "vercel";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  network: "dynamic",
  ports: "create-time",
  process: true,
  processExec: true,
  processSpawn: "separate",
  snapshotCreate: "disk",
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "separate",
};

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

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
  if (present(env("VERCEL_OIDC_TOKEN"))) {
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
  input: Parameters<Adapter<Raw>["create"]>[0] = {}
): VercelCreate => {
  const snapshot = input.snapshot ?? input.template;
  return {
    ...auth(options),
    env: { ...options.env, ...input.env },
    networkPolicy: options.networkPolicy,
    ports: [...(input.ports ?? options.ports ?? [])],
    resources: options.resources,
    runtime: options.runtime,
    source:
      snapshot === undefined
        ? options.source
        : { snapshotId: snapshot, type: "snapshot" },
    timeout: input.timeout ?? options.timeout,
  } as VercelCreate;
};

const getInput = (options: Vercel, id: string): VercelGet =>
  ({
    ...auth(options),
    sandboxId: id,
  }) as VercelGet;

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
  const deadline = timeout(options.timeout, options.signal);
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
  running: VercelCommand,
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
  const deadline = timeout(options.timeout, options.signal);
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
        await running.kill(signal === "SIGKILL" ? 9 : "SIGTERM");
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
  ports: readonly number[]
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: (path) => raw.fs.exists(path),
    list: async (path = cwd) => {
      const entries = await raw.fs.readdir(path, { withFileTypes: true });
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
      await raw.fs.mkdir(path, { recursive: true });
    },
    read: (path) => wrap(() => read(raw, path, cwd), "read"),
    remove: async (path) => {
      await raw.fs.rm(path, { force: true, recursive: true });
    },
    text: async (path) =>
      new TextDecoder().decode(await wrap(() => read(raw, path, cwd), "read")),
    write: async (path: string, input: Input) => {
      await raw.writeFiles([{ content: await bytes(input), path }]);
    },
  },
  id: raw.sandboxId,
  ports: {
    expose: (port) => {
      if (!ports.includes(port)) {
        return Promise.reject(
          sandboxError(
            provider,
            "Vercel ports must be declared at sandbox creation",
            "unsupported"
          )
        );
      }
      return wrap(
        () => ({
          port,
          url: raw.domain(port),
        }),
        "port exposure"
      );
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
      const snapshot = await raw.snapshot();
      return { id: snapshot.snapshotId };
    },
    restore: () => unsupported(provider, "in-place snapshot restore"),
  },
  stop: async () => {
    await raw.stop({ blocking: true });
  },
});

export const vercel = (options: Vercel = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const cwd = input.cwd ?? options.cwd ?? "/vercel/sandbox";
    const ports = input.ports ?? options.ports ?? [];
    const raw =
      input.id === undefined
        ? await VercelSandbox.create(createInput(options, input))
        : await VercelSandbox.get(getInput(options, input.id));

    if (input.id === undefined) {
      await raw.fs.mkdir(cwd, { recursive: true });
    }

    return createSandbox(raw, cwd, options.sudo, ports);
  },
  provider,
});

export const vercelSandbox = vercel;
