import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as joinPath } from "node:path";
import { dirname } from "node:path/posix";

import {
  abort,
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
  Sandbox,
} from "@sandbox-sdk/core";
import * as ModalSdk from "modal";

/** native Modal sandbox object exposed as `sandbox.raw` */
export type ModalRaw = ModalSdk.Sandbox;

type CreateParams = ModalSdk.SandboxCreateParams;

/** modal adapter configuration */
export type Modal = Readonly<
  ModalSdk.ModalClientParams & {
    /** modal app name used for new sandboxes */
    app?: string;
    /** block all sandbox network access */
    blockNetwork?: CreateParams["blockNetwork"];
    /** cloud provider placement forwarded to Modal */
    cloud?: CreateParams["cloud"];
    /** cloud bucket mounts attached to the sandbox */
    cloudBucketMounts?: CreateParams["cloudBucketMounts"];
    /** entrypoint command for the sandbox main process */
    command?: CreateParams["command"];
    /** existing modal client for custom transport, tests, or advanced auth */
    client?: ModalSdk.ModalClient;
    /** create the modal app if it does not exist */
    createAppIfMissing?: boolean;
    /** modal sandbox cpu reservation */
    cpu?: CreateParams["cpu"];
    /** modal sandbox cpu hard limit */
    cpuLimit?: CreateParams["cpuLimit"];
    /** custom domain for Modal sandbox connections */
    customDomain?: CreateParams["customDomain"];
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** default environment variables applied when creating a sandbox */
    env?: Readonly<Record<string, string>>;
    /** Modal GPU reservation such as `T4` or `A100-80GB:4` */
    gpu?: CreateParams["gpu"];
    /** extra encrypted HTTP/2 tunnel ports forwarded to Modal */
    h2Ports?: CreateParams["h2Ports"];
    /** include Modal OIDC identity token inside the sandbox */
    includeOidcIdentityToken?: CreateParams["includeOidcIdentityToken"];
    /** inbound CIDR allowlist for Modal tunnels and connect tokens */
    inboundCidrAllowlist?: CreateParams["inboundCidrAllowlist"];
    /** idle termination timeout in milliseconds */
    idleTimeout?: number;
    /** modal image object or registry tag used for new sandboxes */
    image?: ModalSdk.Image | string;
    /** modal sandbox memory reservation in mib */
    memoryMiB?: CreateParams["memoryMiB"];
    /** modal sandbox memory hard limit in mib */
    memoryLimitMiB?: CreateParams["memoryLimitMiB"];
    /** optional Modal sandbox name */
    name?: CreateParams["name"];
    /** modal sandbox create options forwarded to the native sdk */
    options?: Omit<
      ModalSdk.SandboxCreateParams,
      "encryptedPorts" | "env" | "timeoutMs" | "workdir"
    >;
    /** outbound CIDR allowlist for sandbox network access */
    outboundCidrAllowlist?: CreateParams["outboundCidrAllowlist"];
    /** encrypted ports declared at create time and later exposed with ports.expose */
    ports?: readonly number[];
    /** enable a pty for the Modal sandbox entrypoint */
    pty?: CreateParams["pty"];
    /** Modal proxy used in front of the sandbox */
    proxy?: CreateParams["proxy"];
    /** readiness probe used before Modal marks the sandbox ready */
    readinessProbe?: CreateParams["readinessProbe"];
    /** Modal regions used for sandbox placement */
    regions?: CreateParams["regions"];
    /** Modal secrets injected as sandbox environment variables */
    secrets?: CreateParams["secrets"];
    /** default tags attached to new sandboxes */
    tags?: Readonly<Record<string, string>>;
    /** sandbox lifetime timeout in milliseconds */
    timeout?: number;
    /** unencrypted tunnel ports forwarded to Modal */
    unencryptedPorts?: CreateParams["unencryptedPorts"];
    /** enable verbose Modal sandbox logging */
    verbose?: CreateParams["verbose"];
    /** Modal volumes mounted into the sandbox */
    volumes?: CreateParams["volumes"];
  }
>;

type Raw = ModalRaw;

const provider = "modal";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "create-time",
  process: true,
  processExec: true,
  processSpawn: false,
  raw: {
    buckets: "create-time",
    gpu: "create-time",
    lifecycle: true,
    network: "create-time",
    pty: true,
    resources: "create-time",
    secrets: "create-time",
    tunnels: "create-time",
    volumes: "create-time",
  },
  snapshotCreate: "filesystem",
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "separate",
};

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

const modalConfigExists = (): boolean => {
  const path = env("MODAL_CONFIG_PATH") || joinPath(homedir(), ".modal.toml");
  return existsSync(path);
};

const readable = (value: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
    },
  });

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

const set = <Key extends keyof ModalSdk.SandboxCreateParams>(
  output: ModalSdk.SandboxCreateParams,
  key: Key,
  value: ModalSdk.SandboxCreateParams[Key] | undefined
): void => {
  if (value !== undefined) {
    output[key] = value;
  }
};

const createOptions = (
  options: Modal,
  input: Parameters<Adapter<Raw>["create"]>[0],
  cwd: string,
  ports: readonly number[]
): ModalSdk.SandboxCreateParams => {
  const value = duration(input?.timeout ?? options.timeout);
  const idle = duration(options.idleTimeout);
  const output: ModalSdk.SandboxCreateParams = {
    ...options.options,
    encryptedPorts: [...ports],
    env: { ...options.env, ...input?.env },
    workdir: cwd,
  };
  set(output, "blockNetwork", options.blockNetwork);
  set(output, "cloud", options.cloud);
  set(output, "cloudBucketMounts", options.cloudBucketMounts);
  set(output, "command", options.command);
  set(output, "cpu", options.cpu);
  set(output, "cpuLimit", options.cpuLimit);
  set(output, "customDomain", options.customDomain);
  set(output, "gpu", options.gpu);
  set(output, "h2Ports", options.h2Ports);
  set(output, "idleTimeoutMs", idle);
  set(output, "includeOidcIdentityToken", options.includeOidcIdentityToken);
  set(output, "inboundCidrAllowlist", options.inboundCidrAllowlist);
  set(output, "memoryLimitMiB", options.memoryLimitMiB);
  set(output, "memoryMiB", options.memoryMiB);
  set(output, "name", options.name);
  set(output, "outboundCidrAllowlist", options.outboundCidrAllowlist);
  set(output, "proxy", options.proxy);
  set(output, "pty", options.pty);
  set(output, "readinessProbe", options.readinessProbe);
  set(output, "regions", options.regions);
  set(output, "secrets", options.secrets);
  set(output, "timeoutMs", value);
  set(output, "unencryptedPorts", options.unencryptedPorts);
  set(output, "verbose", options.verbose);
  set(output, "volumes", options.volumes);
  return output;
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
  const value = duration(options.timeout);
  try {
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

const writeChunks = async (
  file: ModalSdk.SandboxFile,
  input: Blob | ReadableStream<Uint8Array>
): Promise<void> => {
  const source = input instanceof Blob ? input.stream() : input;
  const reader = source.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        return;
      }
      await file.write(next.value);
    }
  } finally {
    reader.releaseLock();
  }
};

const write = async (raw: Raw, path: string, input: Input) => {
  if (typeof input === "string") {
    await raw.filesystem.writeText(input, path);
    return;
  }
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    await raw.filesystem.writeBytes(input, path);
    return;
  }
  await raw.filesystem.makeDirectory(dirname(path), { createParents: true });
  const file = await raw.open(path, "w");
  try {
    await writeChunks(file, input);
    await file.flush();
  } finally {
    await file.close();
  }
};

const list = async (raw: Raw, path: string): Promise<Entry[]> => {
  const entries = await raw.filesystem.listFiles(path);
  return entries
    .map(
      (entry): Entry => ({
        kind: entry.type === "directory" ? "directory" : "file",
        modified: new Date(entry.modifiedTime * 1000),
        path: entry.path,
        size: entry.size,
      })
    )
    .toSorted((left, right) => left.path.localeCompare(right.path));
};

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
  ports: readonly number[]
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: async (path) => {
      try {
        await raw.filesystem.stat(path);
        return true;
      } catch (error) {
        if (error instanceof ModalSdk.SandboxFilesystemNotFoundError) {
          return false;
        }
        throw sandboxError(provider, "exists failed", "provider", error);
      }
    },
    list: (path = cwd) => wrap(() => list(raw, path), "list"),
    mkdir: async (path) => {
      await wrap(
        () => raw.filesystem.makeDirectory(path, { createParents: true }),
        "mkdir"
      );
    },
    read: (path) => wrap(() => raw.filesystem.readBytes(path), "read"),
    remove: async (path) => {
      await wrap(
        () => raw.filesystem.remove(path, { recursive: true }),
        "remove"
      );
    },
    stream: async (path) =>
      readable(await wrap(() => raw.filesystem.readBytes(path), "stream")),
    text: (path) => wrap(() => raw.filesystem.readText(path), "text"),
    write: (path, input) => wrap(() => write(raw, path, input), "write"),
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
      const tunnels = await wrap(() => raw.tunnels(), "port exposure");
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
      const snapshot = await wrap(() => raw.snapshotFilesystem(), "snapshot");
      return { id: snapshot.imageId, ...(name === undefined ? {} : { name }) };
    },
    restore: () => rejectUnsupported("in-place snapshot restore"),
  },
  stop: async () => {
    await wrap(() => raw.terminate(), "stop");
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
      await raw.filesystem.makeDirectory(cwd, { createParents: true });
      const tags = { ...options.tags, ...input.metadata };
      if (Object.keys(tags).length > 0) {
        await raw.setTags(tags);
      }
    }

    return createSandbox(raw, cwd, ports);
  },
  provider,
});
