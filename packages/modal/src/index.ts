import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as joinPath } from "node:path";
import { dirname } from "node:path/posix";

import {
  abort,
  bytes,
  error as sandboxError,
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
  Sandbox,
} from "@sandbox-sdk/core";
import * as ModalSdk from "modal";

/** modal adapter configuration */
export type Modal = Readonly<
  ModalSdk.ModalClientParams & {
    /** modal app name used for new sandboxes */
    app?: string;
    /** existing modal client for custom transport, tests, or advanced auth */
    client?: ModalSdk.ModalClient;
    /** create the modal app if it does not exist */
    createAppIfMissing?: boolean;
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** default environment variables applied when creating a sandbox */
    env?: Readonly<Record<string, string>>;
    /** modal image object or registry tag used for new sandboxes */
    image?: ModalSdk.Image | string;
    /** modal sandbox create options forwarded to the native sdk */
    options?: Omit<
      ModalSdk.SandboxCreateParams,
      "encryptedPorts" | "env" | "timeoutMs" | "workdir"
    >;
    /** encrypted ports declared at create time and later exposed with ports.expose */
    ports?: readonly number[];
    /** default tags attached to new sandboxes */
    tags?: Readonly<Record<string, string>>;
    /** sandbox lifetime timeout in milliseconds */
    timeout?: number;
  }
>;

type Raw = ModalSdk.Sandbox;

const provider = "modal";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  network: "create-time",
  ports: "create-time",
  process: true,
  processExec: true,
  processSpawn: false,
  snapshotCreate: "filesystem",
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "separate",
  volumes: true,
};

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

const modalConfigExists = (): boolean => {
  const path = env("MODAL_CONFIG_PATH") || joinPath(homedir(), ".modal.toml");
  return existsSync(path);
};

const validate = (options: Modal): void => {
  if (options.client) {
    return;
  }
  const tokenId = options.tokenId ?? env("MODAL_TOKEN_ID");
  const tokenSecret = options.tokenSecret ?? env("MODAL_TOKEN_SECRET");
  if (present(tokenId) && present(tokenSecret)) {
    return;
  }
  if (present(tokenId) || present(tokenSecret)) {
    throw sandboxError(
      provider,
      "Modal authentication requires both MODAL_TOKEN_ID and MODAL_TOKEN_SECRET, or tokenId and tokenSecret.",
      "configuration"
    );
  }
  if (modalConfigExists()) {
    return;
  }
  throw sandboxError(
    provider,
    "Modal credentials missing. Run modal setup, set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET, or pass tokenId and tokenSecret to modal().",
    "configuration"
  );
};

const client = (options: Modal): ModalSdk.ModalClient => {
  if (options.client) {
    return options.client;
  }
  return new ModalSdk.ModalClient({
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.environment === undefined
      ? {}
      : { environment: options.environment }),
    ...(options.grpcMiddleware === undefined
      ? {}
      : { grpcMiddleware: options.grpcMiddleware }),
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ...(options.maxRetries === undefined
      ? {}
      : { maxRetries: options.maxRetries }),
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
    ...(options.tokenId === undefined ? {} : { tokenId: options.tokenId }),
    ...(options.tokenSecret === undefined
      ? {}
      : { tokenSecret: options.tokenSecret }),
  });
};

const image = async (
  modalClient: ModalSdk.ModalClient,
  options: Modal,
  source?: string
): Promise<ModalSdk.Image> => {
  if (source) {
    return source.startsWith("im-")
      ? await modalClient.images.fromId(source)
      : modalClient.images.fromRegistry(source);
  }
  if (options.image instanceof ModalSdk.Image) {
    return options.image;
  }
  return modalClient.images.fromRegistry(options.image ?? "alpine:3.21");
};

const appParams = (options: Modal): ModalSdk.AppFromNameParams => ({
  createIfMissing: options.createAppIfMissing ?? true,
  ...(options.environment === undefined
    ? {}
    : { environment: options.environment }),
});

const duration = (value: number | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw sandboxError(
      provider,
      "Modal timeouts must be positive milliseconds",
      "configuration"
    );
  }
  return Math.ceil(value / 1000) * 1000;
};

const createOptions = (
  options: Modal,
  input: Parameters<Adapter<Raw>["create"]>[0],
  cwd: string,
  ports: readonly number[]
): ModalSdk.SandboxCreateParams => {
  const value = duration(input?.timeout ?? options.timeout);
  return {
    ...options.options,
    encryptedPorts: [...ports],
    env: { ...options.env, ...input?.env },
    ...(value === undefined ? {} : { timeoutMs: value }),
    workdir: cwd,
  };
};

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort(provider, signal.reason);
  }
};

const execute = async (
  raw: Raw,
  cwd: string,
  parts: readonly string[],
  options: Exec
): Promise<Result> => {
  check(options.signal);
  try {
    const value = duration(options.timeout);
    const run: ModalSdk.SandboxExecParams & { mode?: "text" } = {
      stderr: "pipe",
      stdout: "pipe",
      workdir: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(value === undefined ? {} : { timeoutMs: value }),
    };
    const process = await raw.exec([...parts], run);
    const [code, stdout, stderr] = await Promise.all([
      process.wait(),
      process.stdout.readText(),
      process.stderr.readText(),
    ]);
    return result(code, stdout, stderr);
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
): Promise<Result> => execute(raw, cwd, ["sh", "-lc", script], options);

const write = async (raw: Raw, cwd: string, path: string, input: Input) => {
  const value = await bytes(input);
  await shell(raw, cwd, `mkdir -p ${quote(dirname(path))}`, {});
  const file = await raw.open(path, "w");
  try {
    await file.write(
      typeof value === "string" ? new TextEncoder().encode(value) : value
    );
  } finally {
    await file.close();
  }
};

const read = async (raw: Raw, path: string): Promise<Uint8Array> => {
  const file = await raw.open(path, "r");
  try {
    return await file.read();
  } finally {
    await file.close();
  }
};

const list = async (raw: Raw, cwd: string, path: string): Promise<Entry[]> => {
  const base = path.replace(/\/$/u, "");
  const script = [
    `for item in ${quote(base)}/* ${quote(base)}/.[!.]* ${quote(base)}/..?*; do`,
    `  [ -e "$item" ] || continue`,
    `  if [ -d "$item" ]; then kind=directory; else kind=file; fi`,
    `  size=$(wc -c < "$item" 2>/dev/null || echo 0)`,
    `  printf '%s\\t%s\\t%s\\n' "$kind" "$size" "$item"`,
    `done`,
  ].join("\n");
  const output = await shell(raw, cwd, script, {});
  return output.stdout
    .split("\n")
    .filter(Boolean)
    .map((line): Entry => {
      const [kind, size, entry] = line.split("\t");
      return {
        kind: kind === "directory" ? "directory" : "file",
        path: entry ?? "",
        size: Number(size) || 0,
      };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
};

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
  ports: readonly number[]
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: async (path) => {
      const output = await shell(raw, cwd, `test -e ${quote(path)}`, {});
      return output.ok;
    },
    list: (path = cwd) => list(raw, cwd, path),
    mkdir: async (path) => {
      await shell(raw, cwd, `mkdir -p ${quote(path)}`, {});
    },
    read: (path) => read(raw, path),
    remove: async (path) => {
      await shell(raw, cwd, `rm -rf ${quote(path)}`, {});
    },
    text: async (path) => new TextDecoder().decode(await read(raw, path)),
    write: (path, input) => write(raw, cwd, path, input),
  },
  id: raw.sandboxId,
  ports: {
    expose: async (value) => {
      const target = port(value, provider);
      if (!ports.includes(target)) {
        throw sandboxError(
          provider,
          "Modal ports must be declared at sandbox creation",
          "unsupported"
        );
      }
      const tunnels = await raw.tunnels();
      const tunnel = tunnels[target];
      if (!tunnel) {
        throw sandboxError(provider, "Modal tunnel not found", "not_found");
      }
      return { port: target, url: tunnel.url };
    },
  },
  process: {
    exec: (executable, args = [], options = {}) =>
      execute(raw, cwd, [executable, ...args], options),
    shell: (script, options = {}) => shell(raw, cwd, script, options),
    spawn: () => rejectUnsupported("background process spawn"),
    spawnShell: () => rejectUnsupported("background shell process spawn"),
  },
  provider,
  raw,
  snapshots: {
    create: async (name) => {
      const snapshot = await raw.snapshotFilesystem();
      return { id: snapshot.imageId, ...(name === undefined ? {} : { name }) };
    },
    restore: () => rejectUnsupported("in-place snapshot restore"),
  },
  stop: async () => {
    await raw.terminate();
  },
});

/** create a modal sandbox adapter with normalized sandbox operations */
export const modal = (options: Modal = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const modalClient = client(options);
    const cwd = input.cwd ?? options.cwd ?? "/app";
    const ports = (input.ports ?? options.ports ?? []).map((value) =>
      port(value, provider)
    );
    const raw =
      input.id === undefined
        ? await modalClient.sandboxes.create(
            await modalClient.apps.fromName(
              options.app ?? "sandbox-sdk",
              appParams(options)
            ),
            await image(modalClient, options, input.snapshot ?? input.template),
            createOptions(options, input, cwd, ports)
          )
        : await modalClient.sandboxes.fromId(input.id);

    if (input.id === undefined) {
      await shell(raw, "/", `mkdir -p ${quote(cwd)}`, {});
      const tags = { ...options.tags, ...input.metadata };
      if (Object.keys(tags).length > 0) {
        await raw.setTags(tags);
      }
    }

    return createSandbox(raw, cwd, ports);
  },
  provider,
});
