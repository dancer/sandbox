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
import {
  discard,
  execPayload,
  execute,
  list,
  mustOk,
  parseExec,
  rejectUnsupported,
} from "./bridge-exec.js";

export type {
  CloudflareBridge,
  CloudflareBridgeJson,
  CloudflareBridgeRaw,
  CloudflareBridgeMount,
  CloudflareBridgePersist,
  CloudflareBridgePty,
  CloudflareBridgePtyConnection,
  CloudflareBridgeSession,
} from "./bridge-client.js";

const execJson = async (
  raw: CloudflareBridgeRaw,
  id: string,
  session: string | undefined,
  cwd: string,
  executable: string,
  args: readonly string[]
): Promise<void> => {
  const writer = discard();
  try {
    const result = await parseExec(
      await raw.request(`/v1/sandbox/${encodeURIComponent(id)}/exec`, {
        body: JSON.stringify(execPayload(cwd, executable, args)),
        headers: {
          ...(session === undefined ? {} : { "session-id": session }),
          "content-type": "application/json",
        },
        method: "POST",
      }),
      writer
    );
    mustOk(result, executable);
  } finally {
    await writer.close();
  }
};

/** create a Cloudflare Sandbox adapter that talks to the official HTTP bridge */
export const cloudflareBridge = (
  options: CloudflareBridge = {}
): Adapter<CloudflareBridgeRaw> => ({
  capabilities: bridgeCapabilities,
  create: async (input = {}): Promise<Sandbox<CloudflareBridgeRaw>> => {
    const raw = bridge(options);
    const cwd = input.cwd ?? options.cwd ?? "/workspace";
    let id = input.id ?? options.id;
    if (id === undefined) {
      const { id: created } = await raw.create();
      id = created;
    }
    const environment = { ...options.env, ...input.env };
    const createdSession =
      Object.keys(environment).length === 0
        ? undefined
        : await raw.session.create(id, {
            cwd,
            env: environment,
          });
    const session = createdSession?.id;
    const headers = session === undefined ? {} : { "session-id": session };

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
        expose: () => rejectUnsupported("bridge ports"),
      },
      process: {
        spawn: (executable, args, spawnOptions) =>
          execute(raw, id, session, cwd, executable, args, spawnOptions),
        spawnShell: (line, spawnOptions) =>
          execute(raw, id, session, cwd, "sh", ["-lc", line], spawnOptions),
      },
      provider,
      raw,
      snapshots: {
        create: () => rejectUnsupported("bridge snapshots.create"),
        restore: () => rejectUnsupported("bridge snapshots.restore"),
      },
      stop: async () => {
        if (session !== undefined) {
          await raw.session.delete(id, session);
        }
        await raw.delete(id);
      },
    });
  },
  provider,
});
