import type { Files as NativeFiles } from "@cloudflare/sandbox";
import {
  duration,
  abort,
  fromSandboxRuntime,
  isSandboxError,
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
  Port,
  Running,
  SandboxRuntimePreview,
} from "@sandbox-sdk/core";

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
export type { CloudflareTunnelNames } from "./tunnels.js";

/** native Cloudflare container owned by the application's Durable Object */
export type CloudflareRaw = Container;

/** Cloudflare 1.0 adapter configuration for use inside a Durable Object */
export type Cloudflare = Readonly<{
  /** native container from `this.ctx.container`; its request context must outlive streams and processes */
  container: Container;
  /** default working directory */
  cwd?: string;
  /** process environment defaults; native exec does not inherit container startup variables */
  env?: Readonly<Record<string, string>>;
  /** Durable Object id for bookkeeping; pass `this.ctx.id.toString()` when available */
  id?: string;
  /** image with the matching sandbox-shim binary, used when starting a stopped container */
  image?: string;
  /** application-owned preview routing; keep authentication headers in the returned private headers field */
  preview?: (
    port: number,
    options?: Port
  ) => Promise<SandboxRuntimePreview> | SandboxRuntimePreview;
  /** native container startup options; networking remains disabled unless explicitly enabled */
  startup?: Omit<
    ContainerStartupOptions,
    "image" | "containerSnapshot" | "env" | "labels"
  >;
}>;

const provider = "cloudflare";
const settle = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch {
    return null;
  }
};
const signals: Readonly<Record<string, number>> = {
  SIGABRT: 6,
  SIGCONT: 18,
  SIGHUP: 1,
  SIGINT: 2,
  SIGKILL: 9,
  SIGQUIT: 3,
  SIGSTOP: 19,
  SIGTERM: 15,
};

const capabilities = (options: Cloudflare): Capabilities => ({
  environment: "separate",
  fileStreaming: "native",
  files: true,
  ports: options.preview === undefined ? false : "dynamic",
  processExec: true,
  processSpawn: "separate",
  raw: { lifecycle: "dynamic", network: "configured", pty: true },
  snapshotCreate: "filesystem",
  snapshotDelete: false,
  snapshotRestore: "filesystem",
  snapshotSource: "create-time",
  streaming: "separate",
});

const normalize = (error: unknown): never => {
  if (isSandboxError(error)) {
    throw error;
  }
  const missing =
    error instanceof Error && "code" in error && error.code === "ENOENT";
  throw sandboxError(
    provider,
    missing ? "Path not found" : "Container operation failed",
    missing ? "not_found" : "provider",
    error
  );
};

const wrap = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
  try {
    return await operation();
  } catch (error) {
    return normalize(error);
  }
};

const merge = (
  streams: readonly ReadableStream<Uint8Array>[]
): ReadableStream<Uint8Array> => {
  const readers = streams.map((stream) => stream.getReader());
  return new ReadableStream({
    async cancel(reason) {
      await Promise.all(readers.map((reader) => reader.cancel(reason)));
    },
    async start(controller) {
      try {
        await Promise.all(
          readers.map(async (reader) => {
            while (true) {
              const next = await reader.read();
              if (next.done) {
                return;
              }
              controller.enqueue(next.value);
            }
          })
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
};

const spawn = async (
  raw: Container,
  cwd: string,
  env: Readonly<Record<string, string>>,
  argv: readonly string[],
  options: Exec = {}
): Promise<Running> => {
  if (options.signal?.aborted) {
    abort(provider, options.signal.reason);
  }
  const deadline = timeout(options.timeout, options.signal, provider);
  try {
    const process = await raw.exec([...argv], {
      cwd: options.cwd ?? cwd,
      env: { ...env, ...options.env },
      stderr: "pipe",
      stdout: "pipe",
      ...(deadline.signal === undefined ? {} : { signal: deadline.signal }),
    });
    if (process.stdout === null || process.stderr === null) {
      process.kill(15);
      throw sandboxError(
        provider,
        "Container did not provide separate process streams",
        "provider"
      );
    }
    const [stdout, output] = process.stdout.tee();
    const [stderr, errors] = process.stderr.tee();
    const [saved, combined] = output.tee();
    const [savedErrors, combinedErrors] = errors.tee();
    const cancel = (): void => process.kill(15);
    if (deadline.signal?.aborted) {
      cancel();
    } else {
      deadline.signal?.addEventListener("abort", cancel, { once: true });
    }
    const completion = (async () => {
      try {
        const [code, out, err] = await Promise.all([
          process.exitCode,
          new Response(saved).text(),
          new Response(savedErrors).text(),
        ]);
        if (options.signal?.aborted) {
          abort(provider, options.signal.reason);
        }
        if (deadline.aborted()) {
          throw sandboxError(provider, "Command timed out", "timeout");
        }
        return result(code, out, err);
      } catch (error) {
        if (options.signal?.aborted) {
          abort(provider, options.signal.reason);
        }
        if (deadline.aborted()) {
          throw sandboxError(provider, "Command timed out", "timeout", error);
        }
        throw sandboxError(provider, "Command failed", "process", error);
      } finally {
        deadline.signal?.removeEventListener("abort", cancel);
        deadline.clear();
      }
    })();
    void settle(completion);
    return {
      id: String(process.pid),
      kill: async (signal = "SIGTERM") => {
        const value = signals[signal];
        if (value === undefined) {
          throw sandboxError(
            provider,
            "Unsupported process signal",
            "configuration"
          );
        }
        await Promise.resolve(process.kill(value));
      },
      output: merge([combined, combinedErrors]),
      result: completion,
      stderr,
      stdout,
    };
  } catch (error) {
    deadline.clear();
    if (options.signal?.aborted) {
      abort(provider, options.signal.reason);
    }
    if (deadline.aborted()) {
      throw sandboxError(provider, "Command timed out", "timeout", error);
    }
    return normalize(error);
  }
};

/**
 * adapt Cloudflare 1.0 native container execution and Files helpers
 *
 * call inside the application's Durable Object, which owns routing, authorization, concurrency, and lifetime
 * previews require an application-owned callback; old sessions, interpreters, and automatic tunnels are not part of 1.0
 * snapshots capture the root filesystem, not memory or mounted directories, and deletion is not normalized
 */
export const cloudflare = (options: Cloudflare): Adapter<CloudflareRaw> => {
  const support = capabilities(options);
  return {
    capabilities: support,
    async create(input = {}) {
      const raw = options.container;
      if (raw === undefined) {
        throw sandboxError(
          provider,
          "Cloudflare container missing. Pass this.ctx.container from a Durable Object.",
          "configuration"
        );
      }
      if (input.snapshot !== undefined && raw.running) {
        throw sandboxError(
          provider,
          "A snapshot source requires a stopped container",
          "configuration"
        );
      }
      const inactivity = duration(input.timeout, provider);
      const env = { ...options.env, ...input.env };
      const cwd = input.cwd ?? options.cwd ?? "/workspace";
      const start = (snapshot?: string): void => {
        const startup = {
          ...options.startup,
          env,
          ...(input.metadata === undefined
            ? {}
            : { labels: { ...input.metadata } }),
        };
        if (snapshot !== undefined) {
          raw.start({ ...startup, containerSnapshot: { id: snapshot } });
          return;
        }
        const image = input.template ?? options.image ?? raw.images.sandbox;
        if (image === undefined) {
          throw sandboxError(
            provider,
            "Configure an image containing the Cloudflare 1.0 sandbox-shim",
            "configuration"
          );
        }
        raw.start({ ...startup, image });
      };
      const owned = !raw.running;
      if (owned) {
        start(input.snapshot);
      }
      let files: NativeFiles;
      try {
        if (inactivity !== undefined) {
          await raw.setInactivityTimeout(inactivity);
        }
        const { Files } = await import("@cloudflare/sandbox");
        files = new Files(raw);
        await files.mkdir(cwd, { recursive: true });
      } catch (error) {
        if (owned) {
          await settle(raw.destroy());
        }
        return normalize(error);
      }
      const execute = (argv: readonly string[], run?: Exec): Promise<Running> =>
        spawn(raw, cwd, env, argv, run);
      return fromSandboxRuntime({
        capabilities: support,
        cwd,
        files: {
          exists: async (path) => {
            try {
              await files.stat(sandboxPath(cwd, path));
              return true;
            } catch (error) {
              if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
              ) {
                return false;
              }
              return normalize(error);
            }
          },
          list: async (path = cwd) => {
            const target = sandboxPath(cwd, path);
            const entries = await wrap(() => files.readDirectory(target));
            return entries
              .map(
                (entry): Entry => ({
                  kind: entry.type === "directory" ? "directory" : "file",
                  path: sandboxPath(target, entry.name),
                })
              )
              .toSorted((left, right) => left.path.localeCompare(right.path));
          },
          mkdir: (path) =>
            wrap(() =>
              files.mkdir(sandboxPath(cwd, path), { recursive: true })
            ),
          read: async (path) => {
            const response = await wrap(() =>
              files.readFile(sandboxPath(cwd, path))
            );
            if (response.body === null) {
              throw sandboxError(
                provider,
                "File response has no body",
                "provider"
              );
            }
            return response.body;
          },
          remove: (path) =>
            wrap(() =>
              files.remove(sandboxPath(cwd, path), {
                force: true,
                recursive: true,
              })
            ),
          write: (path, value) =>
            wrap(() => files.writeFile(sandboxPath(cwd, path), value)),
        },
        id: input.id ?? options.id ?? "container",
        ports: {
          expose: async (value, selected) => {
            const target = port(value, provider);
            portOptions(provider, selected);
            if (options.preview === undefined) {
              unsupported(
                provider,
                "previews without application-owned routing"
              );
            }
            return await options.preview(target, selected);
          },
        },
        process: {
          spawn: (command, args, run) =>
            execute([command, ...(args ?? [])], run),
          spawnShell: (command, run) => execute(["sh", "-lc", command], run),
        },
        provider,
        raw,
        snapshots: {
          create: (name) =>
            wrap(async () => {
              const snapshot = await raw.snapshotContainer(
                name === undefined ? undefined : { name }
              );
              return {
                id: snapshot.id,
                ...(snapshot.name === undefined ? {} : { name: snapshot.name }),
              };
            }),
          delete: () => unsupported(provider, "normalized snapshot deletion"),
          restore: (id) =>
            wrap(async () => {
              if (id.length === 0) {
                throw sandboxError(
                  provider,
                  "Snapshot id is required",
                  "configuration"
                );
              }
              await raw.destroy();
              start(id);
              if (inactivity !== undefined) {
                await raw.setInactivityTimeout(inactivity);
              }
              await files.mkdir(cwd, { recursive: true });
            }),
        },
        stop: () => wrap(() => raw.destroy()),
      });
    },
    provider,
  };
};
