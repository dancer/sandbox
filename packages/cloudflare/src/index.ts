import type {
  BackupOptions,
  ListFilesOptions,
  Sandbox as CloudflareSandbox,
  SandboxOptions,
} from "@cloudflare/sandbox";
import {
  abort,
  bytes,
  command,
  duration,
  port,
  preview,
  SandboxError,
  sandboxError,
  sandboxPath,
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
} from "@sandbox-sdk/core";

import { namedTunnel, validateTunnels } from "./tunnels.js";
import type { CloudflareTunnelNames } from "./tunnels.js";

export { cloudflareBridge } from "./bridge.js";
export type {
  CloudflareBridge,
  CloudflareBridgeFetch,
  CloudflareBridgeJson,
  CloudflareBridgeMount,
  CloudflareBridgePersist,
  CloudflareBridgePty,
  CloudflareBridgePtyConnection,
  CloudflareBridgeRaw,
  CloudflareBridgeSession,
  CloudflareBridgeTunnel,
  CloudflareBridgeTunnelOptions,
} from "./bridge.js";
export type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
export type { CloudflareTunnelNames } from "./tunnels.js";

type Native = CloudflareSandbox<unknown>;

/** native Cloudflare Sandbox object exposed as `sandbox.raw` for Worker-only features */
export type CloudflareRaw = Native;

/** Cloudflare Worker Durable Object namespace for a native Sandbox class */
export type CloudflareBinding<
  ProviderRaw extends CloudflareRaw = CloudflareRaw,
> = DurableObjectNamespace<ProviderRaw>;

/**
 * native Cloudflare R2 backup options for normalized filesystem snapshots
 *
 * `dir` is the sandbox cwd and `name` comes from `snapshots.create(name?)`
 * configure `BACKUP_BUCKET` and production R2 credentials on the Worker before enabling this
 */
export type CloudflareBackups = Readonly<Omit<BackupOptions, "dir" | "name">>;

/**
 * Cloudflare Worker-native Sandbox adapter configuration
 *
 * `ProviderRaw` is inferred from `binding`, so `sandbox.raw` keeps the exact native Cloudflare Sandbox environment type
 *
 * use `cloudflareBridge()` for a deployed HTTP bridge outside a Cloudflare Worker
 */
export type Cloudflare<ProviderRaw extends CloudflareRaw = CloudflareRaw> =
  Readonly<{
    /** required Durable Object binding for the Cloudflare Sandbox class, usually `env.Sandbox` */
    binding: CloudflareBinding<ProviderRaw>;
    /** configured R2 backups that enable normalized filesystem snapshot create and restore */
    backups?: CloudflareBackups;
    /**
     * default working directory for normalized file and process operations
     *
     * @default "/workspace"
     */
    cwd?: string;
    /**
     * default environment variables written to the selected sandbox
     *
     * values cross the Worker-to-sandbox trust boundary. pass only secrets the sandbox may use, and keep host-only credentials behind a Worker proxy
     */
    env?: Readonly<Record<string, string>>;
    /** stable sandbox id used when create input omits id */
    id?: string;
    /** list options forwarded to Cloudflare `listFiles` */
    list?: ListFilesOptions;
    /**
     * optional named tunnel label with lowercase letters, digits, and internal hyphens
     *
     * use it for one named tunnel or as the fallback for one port not listed in `tunnels`. named tunnels require Worker-side API token, account, and zone configuration
     */
    tunnel?: string;
    /** named tunnel labels keyed by port. entries override `tunnel` and labels must be unique within one sandbox */
    tunnels?: CloudflareTunnelNames;
    /**
     * low-level options forwarded to `getSandbox`, with the current RPC transport enforced
     *
     * normalized commands are sessionless by default. set `enableDefaultSession: true` only when native raw operations need shared shell state
     */
    options?: Omit<SandboxOptions, "transport">;
  }>;

const provider = "cloudflare";

const capabilities = (backups: boolean): Capabilities => ({
  environment: true,
  fileStreaming: "native",
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: "separate",
  raw: {
    backup: "configured",
    buckets: "configured",
    git: true,
    interpreter: true,
    pty: true,
    sessions: true,
    tunnels: "dynamic",
    watching: true,
  },
  snapshotCreate: backups ? "filesystem" : false,
  snapshotDelete: false,
  snapshotRestore: backups ? "filesystem" : false,
  streaming: "separate",
});

const backupRoots = [
  "/workspace",
  "/home",
  "/tmp",
  "/var/tmp",
  "/app",
] as const;

const validate = (options: Cloudflare): void => {
  if (options.binding === undefined) {
    throw sandboxError(
      provider,
      "Cloudflare binding missing. Pass the Durable Object binding from env.Sandbox to cloudflare().",
      "configuration"
    );
  }
  validateTunnels(options.tunnel, options.tunnels);
};

const validateBackupCwd = (cwd: string): void => {
  if (!cwd.startsWith("/")) {
    throw sandboxError(
      provider,
      "Cloudflare backup cwd must be absolute",
      "configuration"
    );
  }
  if (cwd.includes("\0")) {
    throw sandboxError(
      provider,
      "Cloudflare backup cwd must not contain null bytes",
      "configuration"
    );
  }
  if (cwd.split("/").includes("..")) {
    throw sandboxError(
      provider,
      'Cloudflare backup cwd must not contain ".." path segments',
      "configuration"
    );
  }
  if (!backupRoots.some((root) => cwd === root || cwd.startsWith(`${root}/`))) {
    throw sandboxError(
      provider,
      "Cloudflare backup cwd must be under /workspace, /home, /tmp, /var/tmp, or /app",
      "configuration"
    );
  }
};

const binary = (content: string): Uint8Array =>
  Uint8Array.from(atob(content), (char) => char.codePointAt(0) ?? 0);

const base64 = (input: Uint8Array): string => {
  const chunks: string[] = [];
  for (let index = 0; index < input.length; index += 32_768) {
    chunks.push(String.fromCodePoint(...input.subarray(index, index + 32_768)));
  }
  return btoa(chunks.join(""));
};

const readable = (input: Input): input is ReadableStream<Uint8Array> =>
  input instanceof ReadableStream;

const write = async (
  raw: Native,
  path: string,
  input: Input
): Promise<void> => {
  if (readable(input)) {
    await raw.writeFile(path, input);
    return;
  }

  const value = await bytes(input);
  if (typeof value === "string") {
    await raw.writeFile(path, value, { encoding: "utf-8" });
    return;
  }
  await raw.writeFile(path, base64(value), { encoding: "base64" });
};

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort(provider, signal.reason);
  }
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
    if (error instanceof SandboxError) {
      throw error;
    }
    throw sandboxError(provider, `${feature} failed`, "provider", error);
  }
};

const providerCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return;
  }
  const { code } = error;
  return typeof code === "string" ? code : undefined;
};

const backupWrap = async <Value>(
  action: () => Promise<Value> | Value,
  feature: string
): Promise<Value> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    const code = providerCode(error);
    if (code === "INVALID_BACKUP_CONFIG") {
      throw sandboxError(
        provider,
        "Cloudflare backup configuration is invalid. Check BACKUP_BUCKET, production R2 credentials, cwd, and backup options.",
        "configuration",
        error
      );
    }
    if (code === "BACKUP_NOT_FOUND") {
      throw sandboxError(
        provider,
        "Cloudflare snapshot not found",
        "not_found",
        error
      );
    }
    throw sandboxError(provider, `${feature} failed`, "provider", error);
  }
};

const validatePort = (value: number): number => {
  const target = port(value, provider);
  if (target >= 1024 && target !== 3000) {
    return target;
  }

  throw sandboxError(
    provider,
    "Cloudflare preview ports must be integers from 1024 to 65535, excluding 3000",
    target === 3000 ? "unsupported" : "configuration"
  );
};

const executeLine = async (
  raw: Native,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  check(options.signal);
  const timeout = duration(options.timeout, provider);
  try {
    const output = await raw.exec(line, {
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(timeout === undefined ? {} : { timeout }),
    });
    return result(output.exitCode, output.stdout, output.stderr);
  } catch (error) {
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const execute = (
  raw: Native,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Result> => executeLine(raw, cwd, command(executable, args), options);

const wait = async (
  raw: Native,
  process: Awaited<ReturnType<Native["startProcess"]>>
): Promise<Result> => {
  const output = await process.waitForExit();
  const logs = await raw.getProcessLogs(process.id);
  return result(output.exitCode, logs.stdout, logs.stderr);
};

type Channel = "output" | "stderr" | "stdout";

type Log = Readonly<{
  channel: Exclude<Channel, "output">;
  value: Uint8Array;
}>;

type Event = Readonly<{
  data: string;
  event?: string;
}>;

type Payload = Readonly<{
  data?: unknown;
  type?: unknown;
}>;

const encoder = new TextEncoder();

const parseEvent = (block: string): Event | undefined => {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    }
    if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (data.length === 0) {
    return;
  }
  return event === undefined
    ? { data: data.join("\n") }
    : { data: data.join("\n"), event };
};

const parseLog = (block: string): Log | undefined => {
  const event = parseEvent(block);
  if (event === undefined) {
    return;
  }
  try {
    const payload = JSON.parse(event.data) as Payload;
    if (
      (payload.type === "stdout" || payload.type === "stderr") &&
      typeof payload.data === "string"
    ) {
      return {
        channel: payload.type,
        value: encoder.encode(payload.data),
      };
    }
  } catch {
    if (event.event === "stdout" || event.event === "stderr") {
      return {
        channel: event.event,
        value: encoder.encode(event.data),
      };
    }
  }
};

const lazy = <Output>(factory: () => Promise<Output>): Promise<Output> => {
  let promise: Promise<Output> | undefined;
  const get = (): Promise<Output> => {
    promise ??= factory();
    return promise;
  };

  return {
    // oxlint-disable-next-line promise/prefer-await-to-then
    catch: (onrejected) => get().catch(onrejected),
    // oxlint-disable-next-line promise/prefer-await-to-then
    finally: (onfinally) => get().finally(onfinally),
    // oxlint-disable-next-line unicorn/no-thenable promise/prefer-await-to-then promise/prefer-catch
    then: (onfulfilled, onrejected) => get().then(onfulfilled, onrejected),
    [Symbol.toStringTag]: "Promise",
  } as Promise<Output>;
};

const include = (channel: Channel, log: Log): boolean =>
  channel === "output" || channel === log.channel;

const logs = (
  raw: Native,
  process: Awaited<ReturnType<Native["startProcess"]>>
): Readonly<Record<Channel, ReadableStream<Uint8Array>>> => {
  const chunks: Log[] = [];
  const controllers: Record<
    Channel,
    Set<ReadableStreamDefaultController<Uint8Array>>
  > = {
    output: new Set(),
    stderr: new Set(),
    stdout: new Set(),
  };
  let closed = false;
  let failed: unknown;
  let pump: Promise<void> | undefined;

  const emit = (log: Log): void => {
    chunks.push(log);
    for (const channel of ["output", log.channel] as const) {
      for (const controller of controllers[channel]) {
        controller.enqueue(log.value);
      }
    }
  };

  const close = (): void => {
    closed = true;
    for (const group of Object.values(controllers)) {
      for (const controller of group) {
        controller.close();
      }
      group.clear();
    }
  };

  const fail = (value: unknown): void => {
    failed = value;
    for (const group of Object.values(controllers)) {
      for (const controller of group) {
        controller.error(value);
      }
      group.clear();
    }
  };

  const start = (): void => {
    pump ??= (async () => {
      const output = await raw.streamProcessLogs(process.id);
      const reader = output.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) {
            break;
          }
          buffer += decoder.decode(next.value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/u);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const log = parseLog(block);
            if (log !== undefined) {
              emit(log);
            }
          }
        }
        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          const log = parseLog(buffer);
          if (log !== undefined) {
            emit(log);
          }
        }
        close();
      } catch (error) {
        fail(error);
      } finally {
        reader.releaseLock();
      }
    })();
  };

  const create = (channel: Channel): ReadableStream<Uint8Array> => {
    let active: ReadableStreamDefaultController<Uint8Array> | undefined;
    return new ReadableStream<Uint8Array>({
      cancel() {
        if (active !== undefined) {
          controllers[channel].delete(active);
        }
      },
      start(controller) {
        active = controller;
        for (const log of chunks) {
          if (include(channel, log)) {
            controller.enqueue(log.value);
          }
        }
        if (failed !== undefined) {
          controller.error(failed);
          return;
        }
        if (closed) {
          controller.close();
          return;
        }
        controllers[channel].add(controller);
        start();
      },
    });
  };

  return {
    output: create("output"),
    stderr: create("stderr"),
    stdout: create("stdout"),
  };
};

const spawnLine = async (
  raw: Native,
  cwd: string,
  line: string,
  options: Exec
): Promise<Running> => {
  check(options.signal);
  const timeout = duration(options.timeout, provider);
  try {
    const process = await raw.startProcess(line, {
      cwd: options.cwd ?? cwd,
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
      ...(timeout === undefined ? {} : { timeout }),
    });
    const cancel = (): void => {
      void process.kill("SIGTERM");
    };
    const dispose = (): void => {
      options.signal?.removeEventListener("abort", cancel);
    };
    if (options.signal?.aborted) {
      cancel();
    } else {
      options.signal?.addEventListener("abort", cancel, { once: true });
    }
    const output = logs(raw, process);
    return {
      id: process.id,
      kill: async (signal = "SIGTERM") => {
        dispose();
        await process.kill(signal);
      },
      ...output,
      result: lazy(async () => {
        try {
          return await wait(raw, process);
        } finally {
          dispose();
        }
      }),
    };
  } catch (error) {
    throw sandboxError(provider, "Process spawn failed", "process", error);
  }
};

const spawn = (
  raw: Native,
  cwd: string,
  executable: string,
  args: readonly string[],
  options: Exec
): Promise<Running> => spawnLine(raw, cwd, command(executable, args), options);

const createSandbox = <ProviderRaw extends CloudflareRaw>(
  raw: ProviderRaw,
  cwd: string,
  options: Cloudflare<ProviderRaw>,
  support: Capabilities
): Sandbox<ProviderRaw> => {
  const { backups } = options;
  const labels = new Map<string, number>();
  return {
    capabilities: support,
    cwd,
    files: {
      exists: async (path) => {
        const output = await wrap(
          () => raw.exists(sandboxPath(cwd, path)),
          "exists"
        );
        return output.exists;
      },
      list: async (path = cwd) => {
        const target = sandboxPath(cwd, path);
        const entries = await wrap(
          () => raw.listFiles(target, options.list),
          "list"
        );
        return entries.files
          .map(
            (entry): Entry => ({
              kind: entry.type === "directory" ? "directory" : "file",
              modified: new Date(entry.modifiedAt),
              path: entry.absolutePath,
              size: entry.size,
            })
          )
          .toSorted((left, right) => left.path.localeCompare(right.path));
      },
      mkdir: async (path) => {
        await wrap(
          () => raw.mkdir(sandboxPath(cwd, path), { recursive: true }),
          "mkdir"
        );
      },
      read: async (path) => {
        const output = await wrap(
          () => raw.readFile(sandboxPath(cwd, path), { encoding: "base64" }),
          "read"
        );
        return binary(output.content);
      },
      remove: async (path) => {
        await wrap(() => raw.deleteFile(sandboxPath(cwd, path)), "remove");
      },
      stream: async (path) => {
        const output = await wrap(
          () => raw.readFile(sandboxPath(cwd, path), { encoding: "none" }),
          "stream"
        );
        return output.content;
      },
      text: async (path) => {
        const output = await wrap(
          () => raw.readFile(sandboxPath(cwd, path), { encoding: "utf-8" }),
          "text"
        );
        return output.content;
      },
      write: (path, input) =>
        wrap(() => write(raw, sandboxPath(cwd, path), input), "write"),
    },
    id: options.id ?? "default",
    ports: {
      expose: async (value, input) => {
        const target = validatePort(value);
        if (
          (input !== undefined && "host" in input) ||
          input?.token !== undefined ||
          (input?.protocol !== undefined && input.protocol !== "https")
        ) {
          throw sandboxError(
            provider,
            "Cloudflare tunnels only support the default HTTPS URL through ports.expose. Use sandbox.raw for provider-specific networking.",
            "unsupported"
          );
        }
        const output = await wrap(
          () =>
            raw.tunnels.get(
              target,
              namedTunnel(options.tunnel, options.tunnels, target, labels)
            ),
          "port exposure"
        );
        return preview(output.url, target, { provider });
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
      create: async (name) => {
        if (backups === undefined) {
          return rejectUnsupported("snapshots");
        }
        const backup = await backupWrap(
          () =>
            raw.createBackup({
              ...backups,
              dir: cwd,
              ...(name === undefined ? {} : { name }),
            }),
          "snapshot create"
        );
        return {
          id: backup.id,
          ...(name === undefined || name.length === 0 ? {} : { name }),
        };
      },
      delete: () => rejectUnsupported("snapshots"),
      restore: async (id) => {
        if (backups === undefined) {
          return rejectUnsupported("snapshots");
        }
        if (id.length === 0) {
          throw sandboxError(
            provider,
            "Cloudflare snapshot id is required for restore",
            "configuration"
          );
        }
        const restored = await backupWrap(
          () =>
            raw.restoreBackup({
              dir: cwd,
              id,
              ...(backups.localBucket === true ? { localBucket: true } : {}),
            }),
          "snapshot restore"
        );
        if (!restored.success) {
          throw sandboxError(
            provider,
            "Cloudflare snapshot restore failed",
            "provider"
          );
        }
      },
    },
    stop: async () => {
      await wrap(() => raw.destroy(), "stop");
    },
  };
};

/**
 * create a Cloudflare Sandbox adapter from a Worker binding
 *
 * `sandbox.raw` preserves the native Sandbox type from `binding` and defaults to `CloudflareRaw`
 */
export const cloudflare = <ProviderRaw extends CloudflareRaw = CloudflareRaw>(
  options: Cloudflare<ProviderRaw>
): Adapter<ProviderRaw> => {
  const support = capabilities(options.backups !== undefined);
  return {
    capabilities: support,
    async create(input = {}) {
      validate(options);
      const id = input.id ?? options.id ?? crypto.randomUUID();
      const cwd = input.cwd ?? options.cwd ?? "/workspace";
      if (options.backups !== undefined) {
        validateBackupCwd(cwd);
      }
      const { getSandbox } = await import("@cloudflare/sandbox");
      const raw = getSandbox(options.binding, id, {
        enableDefaultSession: false,
        normalizeId: true,
        ...options.options,
        transport: "rpc",
      });
      const env = { ...options.env, ...input.env };

      if (Object.keys(env).length > 0) {
        await raw.setEnvVars(env);
      }
      await raw.mkdir(cwd, { recursive: true });

      return createSandbox<ProviderRaw>(raw, cwd, { ...options, id }, support);
    },
    provider,
  };
};
