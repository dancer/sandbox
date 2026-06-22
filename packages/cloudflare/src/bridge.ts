import { bytes, fromSandboxRuntime, sandboxError } from "@sandbox-sdk/core";
import type { Adapter, Sandbox } from "@sandbox-sdk/core";

import {
  absolute,
  bridge,
  bridgeBody,
  bridgeCapabilities,
  fail,
  provider,
  route,
} from "./bridge-client.js";
import type { CloudflareBridge, CloudflareBridgeRaw } from "./bridge-client.js";
import { list, mustOk, rejectUnsupported, run } from "./bridge-exec.js";
import { namedTunnel, tunnelPort } from "./tunnels.js";

const secrets = ["SANDBOX_API_KEY"] as const;

const assertSandboxEnv = (value: Readonly<Record<string, string>>): void => {
  const leaked = secrets.filter((name) => value[name] !== undefined);
  if (leaked.length === 0) {
    return;
  }
  throw sandboxError(
    provider,
    `Cloudflare bridge credentials cannot be forwarded into sandbox env: ${leaked.join(", ")}`,
    "configuration"
  );
};

export type {
  CloudflareBridge,
  CloudflareBridgeFetch,
  CloudflareBridgeJson,
  CloudflareBridgeRaw,
  CloudflareBridgeMount,
  CloudflareBridgePersist,
  CloudflareBridgePty,
  CloudflareBridgePtyConnection,
  CloudflareBridgeSession,
  CloudflareBridgeTunnel,
  CloudflareBridgeTunnelOptions,
} from "./bridge-client.js";

const execJson = async (
  raw: CloudflareBridgeRaw,
  id: string,
  session: string | undefined,
  cwd: string,
  executable: string,
  args: readonly string[]
): Promise<void> => {
  const result = await run(raw, id, session, cwd, executable, args);
  mustOk(result, executable);
};

const workspace = (cwd: string): string => absolute("/workspace", cwd);

/**
 * create a Cloudflare Sandbox adapter that talks to the official HTTP bridge
 *
 * `ports.expose()` creates an ephemeral HTTPS quick tunnel by default. configure `tunnel` for one named port or `tunnels` for per-port labels when the bridge Worker has the required Cloudflare credentials
 */
export const cloudflareBridge = (
  options: CloudflareBridge = {}
): Adapter<CloudflareBridgeRaw> => ({
  capabilities: bridgeCapabilities,
  create: async (input = {}): Promise<Sandbox<CloudflareBridgeRaw>> => {
    const environment = { ...options.env, ...input.env };
    assertSandboxEnv(environment);
    const raw = bridge(options);
    const cwd = workspace(input.cwd ?? options.cwd ?? "/workspace");
    let id = input.id ?? options.id;
    const owned = id === undefined;
    if (id === undefined) {
      const { id: created } = await raw.create();
      id = created;
    }
    let session: string | undefined;
    try {
      if (cwd !== "/workspace") {
        await execJson(raw, id, undefined, "/workspace", "mkdir", ["-p", cwd]);
      }
      const createdSession =
        Object.keys(environment).length === 0
          ? undefined
          : await raw.session.create(id, {
              cwd,
              env: environment,
            });
      session = createdSession?.id;
    } catch (error) {
      if (owned) {
        await raw.delete(id).catch(() => null);
      }
      throw error;
    }
    const headers = session === undefined ? {} : { "session-id": session };
    const labels = new Map<string, number>();

    return fromSandboxRuntime({
      capabilities: bridgeCapabilities,
      cwd,
      files: {
        exists: async (path) => {
          const response = await raw.request(
            `/v1/sandbox/${encodeURIComponent(id)}/file/${route(absolute(cwd, path))}`,
            { headers }
          );
          if (response.status === 404) {
            return false;
          }
          if (!response.ok) {
            await fail(response, "bridge file exists");
          }
          await response.body?.cancel();
          return true;
        },
        list: (path) => list(raw, id, session, cwd, path),
        mkdir: (path) =>
          execJson(raw, id, session, cwd, "mkdir", ["-p", absolute(cwd, path)]),
        read: async (path) => {
          const response = await raw.request(
            `/v1/sandbox/${encodeURIComponent(id)}/file/${route(absolute(cwd, path))}`,
            { headers }
          );
          if (!response.ok) {
            await fail(response, "bridge file read");
          }
          if (response.body === null) {
            throw sandboxError(
              provider,
              "Cloudflare bridge file read returned no body",
              "provider"
            );
          }
          return response.body;
        },
        remove: async (path) => {
          const target = absolute(cwd, path);
          if (target === "/workspace") {
            throw sandboxError(
              provider,
              "Cloudflare bridge refuses to remove /workspace",
              "path_escape"
            );
          }
          await execJson(raw, id, session, cwd, "rm", ["-rf", target]);
        },
        write: async (path, value) => {
          const inputBody = await bytes(value);
          const response = await raw.request(
            `/v1/sandbox/${encodeURIComponent(id)}/file/${route(absolute(cwd, path))}`,
            {
              body: bridgeBody(inputBody),
              headers,
              method: "PUT",
            }
          );
          if (!response.ok) {
            await fail(response, "bridge file write");
          }
        },
      },
      id,
      ports: {
        expose: async (value, portOptions = {}) => {
          if (
            "host" in portOptions ||
            portOptions.token !== undefined ||
            (portOptions.protocol !== undefined &&
              portOptions.protocol !== "https")
          ) {
            throw sandboxError(
              provider,
              "Cloudflare tunnels only support the default HTTPS URL through ports.expose. Use sandbox.raw for provider-specific networking.",
              "unsupported"
            );
          }
          const target = tunnelPort(value);
          const tunnel = await raw.tunnels.get(
            id,
            target,
            namedTunnel(options.tunnel, options.tunnels, target, labels)
          );
          return { port: tunnel.port, url: tunnel.url };
        },
      },
      process: {
        exec: (executable, args, execOptions) =>
          run(raw, id, session, cwd, executable, args, execOptions),
        shell: (line, execOptions) =>
          run(raw, id, session, cwd, "sh", ["-lc", line], execOptions),
      },
      provider,
      raw,
      snapshots: {
        create: () => rejectUnsupported("bridge snapshots.create"),
        delete: () => rejectUnsupported("bridge snapshots.delete"),
        restore: () => rejectUnsupported("bridge snapshots.restore"),
      },
      stop: async () => {
        try {
          if (session !== undefined) {
            await raw.session.delete(id, session);
          }
        } finally {
          await raw.delete(id);
        }
      },
    });
  },
  provider,
});
