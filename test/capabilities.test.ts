import { expect, test } from "bun:test";

import { blaxel } from "@sandbox-sdk/blaxel";
import { cloudflare, cloudflareBridge } from "@sandbox-sdk/cloudflare";
import { codesandbox } from "@sandbox-sdk/codesandbox";
import {
  capabilityMode,
  rawCapabilityMode,
  supports,
  supportsRaw,
} from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";
import { e2b } from "@sandbox-sdk/e2b";
import { local } from "@sandbox-sdk/local";
import { modal } from "@sandbox-sdk/modal";
import { vercel } from "@sandbox-sdk/vercel";

test("adapters expose capability-honest feature modes", () => {
  expect(local().capabilities).toMatchObject({
    fileStreaming: "native",
    files: true,
    ports: "derived",
    processExec: true,
    processSpawn: "separate",
    snapshotCreate: "filesystem",
    snapshotRestore: "filesystem",
  });

  expect(e2b().capabilities).toMatchObject({
    fileStreaming: "native",
    files: true,
    ports: "derived",
    processExec: true,
    processSpawn: "separate",
    raw: {
      git: true,
      lifecycle: "dynamic",
      mcp: "create-time",
      metrics: true,
      network: "dynamic",
      pty: true,
      volumes: "create-time",
      watching: true,
    },
    snapshotCreate: "memory",
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "separate",
  });

  expect(vercel().capabilities).toMatchObject({
    fileStreaming: "native",
    files: true,
    ports: "dynamic",
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
  });

  expect(
    cloudflare({
      binding: {} as Parameters<typeof cloudflare>[0]["binding"],
    }).capabilities
  ).toMatchObject({
    fileStreaming: "native",
    files: true,
    ports: "dynamic",
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
    snapshotCreate: false,
    snapshotRestore: false,
  });

  expect(daytona().capabilities).toMatchObject({
    fileStreaming: "native",
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: "separate",
    raw: {
      desktop: true,
      git: true,
      interpreter: true,
      lifecycle: "dynamic",
      lsp: true,
      network: "dynamic",
      previews: true,
      pty: true,
      resources: "dynamic",
      sessions: true,
      ssh: true,
      volumes: "create-time",
    },
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "separate",
  });

  expect(modal().capabilities).toMatchObject({
    fileStreaming: "buffered",
    files: true,
    ports: "create-time",
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
  });

  expect(blaxel().capabilities).toMatchObject({
    fileStreaming: "buffered",
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: "separate",
    raw: {
      codegen: true,
      drives: true,
      lifecycle: true,
      network: "dynamic",
      previews: true,
      resources: "create-time",
      sessions: true,
      system: true,
      volumes: "create-time",
      watching: true,
    },
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: false,
    streaming: "separate",
  });

  expect(codesandbox().capabilities).toMatchObject({
    fileStreaming: "buffered",
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: true,
    raw: {
      interpreter: true,
      lifecycle: true,
      previews: true,
      pty: true,
      resources: "dynamic",
      sessions: true,
      watching: true,
    },
    snapshotCreate: "memory",
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "combined",
  });

  expect(
    cloudflareBridge({
      fetch: () => new Response(null, { status: 204 }),
      url: "https://bridge.example.com",
    }).capabilities
  ).toMatchObject({
    fileStreaming: "native",
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: false,
    raw: {
      backup: true,
      buckets: "configured",
      lifecycle: "dynamic",
      pty: true,
      sessions: true,
      tunnels: "dynamic",
    },
    snapshotCreate: false,
    snapshotRestore: false,
  });
});

test("raw capabilities are separate from normalized capabilities", () => {
  const current = cloudflare({
    binding: {} as Parameters<typeof cloudflare>[0]["binding"],
  });

  expect(supports(current, "ports")).toBe(true);
  expect(capabilityMode(current, "fileStreaming")).toBe("native");
  expect(supportsRaw(current, "desktop")).toBe(false);
  expect(rawCapabilityMode(current, "desktop")).toBeUndefined();
  expect(supportsRaw(current, "git")).toBe(true);
  expect(supportsRaw(current, "backup")).toBe(true);
  expect(rawCapabilityMode(current, "backup")).toBe("configured");
  expect(supportsRaw(current, "network")).toBe(false);
  expect(supportsRaw(current, "interpreter")).toBe(true);
  expect(supportsRaw(current, "pty")).toBe(true);
  expect(supportsRaw(current, "sessions")).toBe(true);
  expect(supportsRaw(current, "tunnels")).toBe(true);
  expect(supportsRaw(current, "watching")).toBe(true);
});
