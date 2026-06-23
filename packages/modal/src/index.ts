import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as joinPath } from "node:path";

import {
  abort,
  sandboxError,
  port,
  portOptions,
  preview,
  result,
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
  Sandbox,
} from "@sandbox-sdk/core";
import * as ModalSdk from "modal";

export { ModalClient } from "modal";

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
    /** existing native Modal client for advanced service access, custom transport, or credential reuse and takes precedence over Modal connection options */
    client?: ModalSdk.ModalClient;
    /** create the modal app if it does not exist */
    createAppIfMissing?: boolean;
    /** modal sandbox cpu reservation */
    cpu?: CreateParams["cpu"];
    /** modal sandbox cpu hard limit */
    cpuLimit?: CreateParams["cpuLimit"];
    /**
     * custom domain for Modal sandbox connections
     *
     * use a Modal-provisioned domain. it applies when the sandbox is created, not per `ports.expose()` call
     */
    customDomain?: CreateParams["customDomain"];
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** default environment variables for new sandboxes; rejects MODAL_TOKEN_ID and MODAL_TOKEN_SECRET to prevent credential forwarding */
    env?: Readonly<Record<string, string>>;
    /** experimental Modal sandbox create options forwarded to the native sdk */
    experimentalOptions?: CreateParams["experimentalOptions"];
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
    /** published Modal image name, optionally including a tag; cannot be combined with image */
    namedImage?: string;
    /** outbound CIDR allowlist for sandbox network access */
    outboundCidrAllowlist?: CreateParams["outboundCidrAllowlist"];
    /** outbound domain allowlist with optional wildcard prefixes such as *.example.com */
    outboundDomainAllowlist?: CreateParams["outboundDomainAllowlist"];
    /**
     * encrypted ports declared for new sandboxes at create time
     *
     * reconnecting by id discovers existing Modal tunnels without repeating this option
     */
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
    /** filesystem snapshot timeout in milliseconds, rounded up to a whole second */
    snapshotTimeout?: number;
    /** filesystem snapshot retention as whole seconds in milliseconds, or null for no expiry */
    snapshotTtl?: number | null;
    /** stop behavior used by `sandbox.stop` */
    stop?: "detach" | "terminate";
    /** default tags for new sandboxes; create metadata overrides same-name defaults */
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
  fileStreaming: "buffered",
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
  snapshotDelete: true,
  snapshotRestore: false,
  snapshotSource: "create-time",
  streaming: "separate",
};

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const ignore = (): void => void 0;

const secrets = ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"] as const;

const first = (
  ...values: readonly (string | undefined)[]
): string | undefined => values.find(present);

const env = (name: string): string | undefined =>
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.[name];

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
  if (Reflect.get(options, "options") !== undefined) {
    throw sandboxError(
      provider,
      "Modal options is not supported. Use first-class Modal adapter options.",
      "configuration"
    );
  }
  if (options.image !== undefined && options.namedImage !== undefined) {
    throw sandboxError(
      provider,
      "Modal image and namedImage cannot be used together",
      "configuration"
    );
  }
  if (options.client) {
    return;
  }
  const tokenId = first(options.tokenId, env("MODAL_TOKEN_ID"));
  const tokenSecret = first(options.tokenSecret, env("MODAL_TOKEN_SECRET"));
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
  const tokenId = first(options.tokenId, env("MODAL_TOKEN_ID"));
  const tokenSecret = first(options.tokenSecret, env("MODAL_TOKEN_SECRET"));
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
    ...(tokenId === undefined ? {} : { tokenId }),
    ...(tokenSecret === undefined ? {} : { tokenSecret }),
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
  if (options.namedImage !== undefined) {
    return modalClient.images.fromName(
      options.namedImage,
      options.environment === undefined
        ? {}
        : { environment: options.environment }
    );
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

const ttl = (value: number | null | undefined): number | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }
  if (!Number.isFinite(value) || value < 1000 || value % 1000 !== 0) {
    throw sandboxError(
      provider,
      "Modal snapshotTtl must be null or a positive multiple of 1000 milliseconds",
      "configuration"
    );
  }
  return value;
};

const snapshotOptions = (
  options: Modal
): ModalSdk.SandboxSnapshotFilesystemParams => {
  const timeout = duration(options.snapshotTimeout);
  const retention = ttl(options.snapshotTtl);
  return {
    ...(timeout === undefined ? {} : { timeoutMs: timeout }),
    ...(retention === undefined ? {} : { ttlMs: retention }),
  };
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

const assertSandboxEnv = (value: Readonly<Record<string, string>>): void => {
  const leaked = secrets.filter((name) => value[name] !== undefined);
  if (leaked.length === 0) {
    return;
  }
  throw sandboxError(
    provider,
    `Modal provider credentials cannot be forwarded into sandbox env: ${leaked.join(", ")}`,
    "configuration"
  );
};

const sandboxEnv = (
  options: Modal,
  input: Parameters<Adapter<Raw>["create"]>[0]
): Readonly<Record<string, string>> => {
  const value = { ...options.env, ...input?.env };
  assertSandboxEnv(value);
  return value;
};

const createOptions = (
  options: Modal,
  input: Parameters<Adapter<Raw>["create"]>[0],
  cwd: string,
  ports: readonly number[],
  environment: Readonly<Record<string, string>>
): ModalSdk.SandboxCreateParams => {
  const value = duration(input?.timeout ?? options.timeout);
  const idle = duration(options.idleTimeout);
  const tags = { ...options.tags, ...input?.metadata };
  const output: ModalSdk.SandboxCreateParams = {
    encryptedPorts: [...ports],
    env: environment,
    workdir: cwd,
  };
  set(output, "blockNetwork", options.blockNetwork);
  set(output, "cloud", options.cloud);
  set(output, "cloudBucketMounts", options.cloudBucketMounts);
  set(output, "command", options.command);
  set(output, "cpu", options.cpu);
  set(output, "cpuLimit", options.cpuLimit);
  set(output, "customDomain", options.customDomain);
  set(output, "experimentalOptions", options.experimentalOptions);
  set(output, "gpu", options.gpu);
  set(output, "h2Ports", options.h2Ports);
  set(output, "idleTimeoutMs", idle);
  set(output, "includeOidcIdentityToken", options.includeOidcIdentityToken);
  set(output, "inboundCidrAllowlist", options.inboundCidrAllowlist);
  set(output, "memoryLimitMiB", options.memoryLimitMiB);
  set(output, "memoryMiB", options.memoryMiB);
  set(output, "name", options.name);
  set(output, "outboundCidrAllowlist", options.outboundCidrAllowlist);
  set(output, "outboundDomainAllowlist", options.outboundDomainAllowlist);
  set(output, "proxy", options.proxy);
  set(output, "pty", options.pty);
  set(output, "readinessProbe", options.readinessProbe);
  set(output, "regions", options.regions);
  set(output, "secrets", options.secrets);
  set(output, "tags", Object.keys(tags).length === 0 ? undefined : tags);
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
  writer: WritableStreamDefaultWriter<Uint8Array>,
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
      await writer.write(next.value);
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
  const process = await raw.exec(
    [
      "sh",
      "-c",
      'mkdir -p "$(dirname -- "$1")" && cat > "$1"',
      "sandbox-sdk",
      path,
    ],
    {
      mode: "binary",
      stderr: "pipe",
      stdout: "pipe",
    }
  );
  const writer = process.stdin.getWriter();
  try {
    await writeChunks(writer, input);
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(ignore);
    throw error;
  } finally {
    writer.releaseLock();
  }
  const [code, stderr] = await Promise.all([
    process.wait(),
    process.stderr.readBytes(),
    process.stdout.readBytes(),
  ]);
  if (code !== 0) {
    throw new Error(
      `Modal streaming write failed: ${new TextDecoder().decode(stderr)}`
    );
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
  ports: readonly number[],
  reconnected: boolean,
  stop: Modal["stop"],
  snapshot: ModalSdk.SandboxSnapshotFilesystemParams,
  modalClient: ModalSdk.ModalClient
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: async (path) => {
      try {
        await raw.filesystem.stat(sandboxPath(cwd, path));
        return true;
      } catch (error) {
        if (error instanceof ModalSdk.SandboxFilesystemNotFoundError) {
          return false;
        }
        throw sandboxError(provider, "exists failed", "provider", error);
      }
    },
    list: (path = cwd) => wrap(() => list(raw, sandboxPath(cwd, path)), "list"),
    mkdir: async (path) => {
      await wrap(
        () =>
          raw.filesystem.makeDirectory(sandboxPath(cwd, path), {
            createParents: true,
          }),
        "mkdir"
      );
    },
    read: (path) =>
      wrap(() => raw.filesystem.readBytes(sandboxPath(cwd, path)), "read"),
    remove: async (path) => {
      await wrap(
        () =>
          raw.filesystem.remove(sandboxPath(cwd, path), { recursive: true }),
        "remove"
      );
    },
    stream: async (path) =>
      readable(
        await wrap(
          () => raw.filesystem.readBytes(sandboxPath(cwd, path)),
          "stream"
        )
      ),
    text: (path) =>
      wrap(() => raw.filesystem.readText(sandboxPath(cwd, path)), "text"),
    write: (path, input) =>
      wrap(() => write(raw, sandboxPath(cwd, path), input), "write"),
  },
  id: raw.sandboxId,
  ports: {
    expose: async (value, options) => {
      const target = port(value, provider);
      portOptions(provider, options, "https");
      const declared = ports.includes(target);
      if (!reconnected && !declared) {
        throw sandboxError(
          provider,
          "Modal ports must be declared at sandbox creation",
          "unsupported"
        );
      }
      const tunnels = await wrap(() => raw.tunnels(), "port exposure");
      const tunnel = tunnels[target];
      if (tunnel) {
        return preview(tunnel.url, target, { provider });
      }
      if (!declared) {
        throw sandboxError(
          provider,
          "Modal ports must be declared at sandbox creation",
          "unsupported"
        );
      }
      throw sandboxError(provider, "Modal tunnel not found", "not_found");
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
      if (name !== undefined) {
        unsupported(provider, "named snapshots");
      }
      const created = await wrap(
        () => raw.snapshotFilesystem(snapshot),
        "snapshot"
      );
      return { id: created.imageId };
    },
    delete: async (id) => {
      if (!present(id)) {
        throw sandboxError(
          provider,
          "Modal snapshot id is required for deletion",
          "configuration"
        );
      }
      await wrap(() => modalClient.images.delete(id), "snapshot delete");
    },
    restore: () => rejectUnsupported("in-place snapshot restore"),
  },
  stop: async () => {
    if (stop === "detach") {
      raw.detach();
      return;
    }
    await wrap(() => raw.terminate(), "stop");
  },
});

/**
 * create a Modal sandbox adapter with normalized file, command, port, and filesystem snapshot operations
 *
 * filesystem snapshots return an image id for a new sandbox through the shared snapshot create option. Modal does not persist arbitrary snapshot names, so call `snapshots.create()` without a name. in-place restore and normalized background process handles are unavailable
 *
 * use typed Modal adapter options and `sandbox.raw` for provider-specific private tunnels and direct TCP controls
 */
export const modal = (options: Modal = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    const modalClient = client(options);
    const cwd = input.cwd ?? options.cwd ?? "/app";
    const ports = (input.ports ?? options.ports ?? []).map((value) =>
      port(value, provider)
    );
    const snapshot = snapshotOptions(options);
    let raw: Raw;
    if (input.id === undefined) {
      const environment = sandboxEnv(options, input);
      raw = await modalClient.sandboxes.create(
        await modalClient.apps.fromName(
          options.app ?? "sandbox-sdk",
          appParams(options)
        ),
        await image(modalClient, options, input.snapshot ?? input.template),
        createOptions(options, input, cwd, ports, environment)
      );
    } else {
      raw = await modalClient.sandboxes.fromId(input.id);
    }

    if (input.id === undefined) {
      try {
        await raw.filesystem.makeDirectory(cwd, { createParents: true });
      } catch (error) {
        await raw.terminate().catch(() => null);
        throw error;
      }
    }

    return createSandbox(
      raw,
      cwd,
      ports,
      input.id !== undefined,
      options.stop ?? "terminate",
      snapshot,
      modalClient
    );
  },
  provider,
});
