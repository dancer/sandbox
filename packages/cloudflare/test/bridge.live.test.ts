import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import type { Preview } from "@sandbox-sdk/core";

import { cloudflareBridge } from "../src/index";
import type { CloudflareBridgePtyConnection } from "../src/index";
import { requestPreview } from "./fixture";

const message = "hello from cloudflare bridge";
const port = 8081;

const value = (name: string): string | undefined => {
  const current = process.env[name]?.trim();
  return current === "" ? undefined : current;
};

const url = value("CLOUDFLARE_BRIDGE_URL");
const token = value("CLOUDFLARE_BRIDGE_TOKEN");
const live = url !== undefined && token !== undefined ? test : test.skip;

const text = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

type WebSocketClient = new (
  url: string,
  options?: Bun.WebSocketOptions
) => WebSocket;

const client = WebSocket as unknown as WebSocketClient;

const terminal = async (
  connection: CloudflareBridgePtyConnection
): Promise<WebSocket> => {
  const socket = new client(connection.url, { headers: connection.headers });
  let failure: Error | undefined;
  let ready = false;

  socket.binaryType = "arraybuffer";
  socket.addEventListener("error", () => {
    failure = new Error("cloudflare bridge terminal connection failed");
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    try {
      ready = (JSON.parse(event.data) as { type?: string }).type === "ready";
    } catch {
      ready = false;
    }
  });

  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (failure !== undefined) {
      throw new Error(failure.message, { cause: failure });
    }
    if (ready) {
      return socket;
    }
    await Bun.sleep(100);
  }

  socket.close();
  throw new Error("cloudflare bridge terminal did not become ready");
};

const server = `import { createServer } from "node:http";

createServer((_, response) => response.end(${JSON.stringify(message)})).listen(${port}, "0.0.0.0");
`;

const waitForServer = async (
  sandbox: Awaited<ReturnType<typeof create>>
): Promise<void> => {
  let failure: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await sandbox.process.exec("node", [
      "-e",
      `fetch("http://127.0.0.1:${port}").then(async (response) => { if (!response.ok) process.exit(1); process.stdout.write(await response.text()); }).catch(() => process.exit(1));`,
    ]);
    if (response.ok && response.stdout.trim() === message) {
      return;
    }
    failure = response;
    await Bun.sleep(500);
  }

  throw new Error("cloudflare bridge server did not become ready", {
    cause: failure,
  });
};

const waitForPreview = async (
  preview: Preview
): Promise<Awaited<ReturnType<typeof requestPreview>>> => {
  let failure: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestPreview(preview.url);
    } catch (error) {
      failure = error;
    }
    await Bun.sleep(1000);
  }

  throw new Error("cloudflare bridge preview did not become reachable", {
    cause: failure,
  });
};

live("cloudflare bridge runs a live normalized workflow", async () => {
  if (url === undefined || token === undefined) {
    throw new Error(
      "Cloudflare bridge credentials are required for live verification"
    );
  }

  const sandbox = await create({
    adapter: cloudflareBridge({ token, url }),
    cwd: "/workspace/sandbox-sdk-bridge",
    env: { SANDBOX_SDK_BRIDGE: "bridge-env" },
  });
  let preview: Awaited<ReturnType<typeof sandbox.ports.expose>> | undefined;
  let socket: WebSocket | undefined;

  try {
    expect(sandbox.provider).toBe("cloudflare");
    expect(sandbox.capabilities).toMatchObject({
      files: true,
      ports: "dynamic",
      processExec: true,
      processSpawn: false,
      raw: {
        lifecycle: "dynamic",
        pty: true,
        sessions: true,
        tunnels: "dynamic",
      },
      streaming: "separate",
    });
    expect(await sandbox.raw.health()).toMatchObject({ ok: true });
    expect(await sandbox.raw.running(sandbox.id)).toBe(true);
    expect(await sandbox.raw.openapi()).toHaveProperty("openapi");

    await sandbox.files.write("message.txt", message);
    expect(await sandbox.files.text("message.txt")).toBe(message);
    expect(await text(await sandbox.files.stream("message.txt"))).toBe(message);
    const entries = await sandbox.files.list();
    expect(
      entries.some(
        (entry) => entry.path === "/workspace/sandbox-sdk-bridge/message.txt"
      )
    ).toBe(true);

    const environment = await sandbox.process.shell(
      'printf %s "$SANDBOX_SDK_BRIDGE"'
    );
    expect(environment).toMatchObject({
      code: 0,
      ok: true,
    });
    expect(environment.stdout.trim()).toBe("bridge-env");

    const failed = await sandbox.process.shell("echo failure >&2; exit 7");
    expect(failed).toMatchObject({ code: 7, ok: false });
    expect(failed.stderr).toContain("failure");
    await expect(
      sandbox.process.spawn("node", ["-e", "process.exit(0)"])
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });

    const archive = await sandbox.raw.persist(sandbox.id);
    expect(archive.byteLength).toBeGreaterThan(0);
    await sandbox.files.write("message.txt", "changed");
    await sandbox.raw.hydrate(sandbox.id, archive);
    expect(await sandbox.files.text("message.txt")).toBe(message);

    await sandbox.files.write("server.mjs", server);
    socket = await terminal(sandbox.raw.pty(sandbox.id));
    socket.send(
      new TextEncoder().encode(
        "cd /workspace/sandbox-sdk-bridge && node server.mjs\n"
      )
    );
    await waitForServer(sandbox);
    let response: Awaited<ReturnType<typeof requestPreview>> | undefined;
    let previewFailure: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      preview = await sandbox.ports.expose(port);
      try {
        response = await waitForPreview(preview);
        break;
      } catch (error) {
        previewFailure = error;
        await sandbox.raw.tunnels.destroy(sandbox.id, preview.port);
        preview = undefined;
        await Bun.sleep(1000);
      }
    }
    if (preview === undefined || response === undefined) {
      throw new Error(
        "cloudflare bridge tunnel verification exhausted fresh tunnels",
        {
          cause: previewFailure,
        }
      );
    }
    expect(preview).toMatchObject({ port });
    expect(preview.url).toMatch(/^https:\/\//u);
    expect(response.text).toBe(message);
  } finally {
    socket?.close();
    if (preview !== undefined) {
      await sandbox.raw.tunnels.destroy(sandbox.id, preview.port);
    }
    await sandbox.stop();
  }
});
