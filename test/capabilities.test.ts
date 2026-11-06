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
import type { Capabilities } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";
import { e2b } from "@sandbox-sdk/e2b";
import { local } from "@sandbox-sdk/local";
import { modal } from "@sandbox-sdk/modal";
import { vercel } from "@sandbox-sdk/vercel";

const equal = (actual: Capabilities, expected: Capabilities): void => {
  expect(actual).toEqual(expected);
};

test("adapters expose exact capability contracts", () => {
  equal(local().capabilities, {
    environment: true,
    fileStreaming: "native",
    files: true,
    ports: "derived",
    processExec: true,
    processSpawn: "separate",
    snapshotCreate: "filesystem",
    snapshotDelete: true,
    snapshotRestore: "filesystem",
    streaming: "separate",
  });

  equal(e2b().capabilities, {
    environment: true,
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
    snapshotDelete: true,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "separate",
  });

  equal(vercel().capabilities, {
    environment: true,
    fileStreaming: "native",
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: "separate",
    raw: {
      drives: "create-time",
      lifecycle: "dynamic",
      metrics: true,
      network: "dynamic",
      previews: "dynamic",
      pty: true,
      resources: "dynamic",
      sessions: "dynamic",
    },
    snapshotCreate: "disk",
    snapshotDelete: true,
    snapshotRestore: "disk",
    snapshotSource: "create-time",
    streaming: "separate",
  });

  equal(cloudflare({ container: {} as Container }).capabilities, {
    environment: "separate",
    fileStreaming: "native",
    files: true,
    ports: false,
    processExec: true,
    processSpawn: "separate",
    raw: { lifecycle: "dynamic", network: "configured", pty: true },
    snapshotCreate: "filesystem",
    snapshotDelete: false,
    snapshotRestore: "filesystem",
    snapshotSource: "create-time",
    streaming: "separate",
  });

  equal(daytona().capabilities, {
    environment: true,
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
    snapshotCreate: "filesystem",
    snapshotDelete: true,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "separate",
  });

  equal(modal().capabilities, {
    environment: true,
    fileStreaming: "buffered",
    files: true,
    ports: "create-time",
    processExec: true,
    processSpawn: false,
    raw: {
      buckets: "create-time",
      gpu: "create-time",
      lifecycle: true,
      network: "configured",
      pty: true,
      resources: "create-time",
      secrets: "create-time",
      tunnels: "create-time",
      volumes: "create-time",
      watching: true,
    },
    snapshotCreate: "filesystem",
    snapshotDelete: true,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "separate",
  });

  equal(blaxel().capabilities, {
    environment: true,
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
    snapshotDelete: false,
    snapshotRestore: false,
    snapshotSource: false,
    streaming: "separate",
  });

  equal(codesandbox().capabilities, {
    environment: true,
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
    snapshotDelete: false,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "combined",
  });

  equal(
    cloudflareBridge({
      fetch: () => new Response(null, { status: 204 }),
      url: "https://bridge.example.com",
    }).capabilities,
    {
      environment: "separate",
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
      snapshotDelete: false,
      snapshotRestore: false,
      streaming: "separate",
    }
  );
});

test("cloudflare previews require application routing", () => {
  const container = {} as Container;
  expect(supports(cloudflare({ container }), "ports")).toBe(false);
  expect(
    supports(
      cloudflare({
        container,
        preview: (port) => ({ port, url: "https://preview.example" }),
      }),
      "ports"
    )
  ).toBe(true);
  expect(supports(cloudflare({ container }), "snapshotCreate")).toBe(true);
});

test("raw capabilities are separate from normalized capabilities", () => {
  const current = cloudflare({ container: {} as Container });
  expect(capabilityMode(current, "fileStreaming")).toBe("native");
  expect(supportsRaw(current, "desktop")).toBe(false);
  expect(rawCapabilityMode(current, "desktop")).toBeUndefined();
  expect(supportsRaw(current, "backup")).toBe(false);
  expect(rawCapabilityMode(current, "network")).toBe("configured");
  expect(supportsRaw(current, "pty")).toBe(true);
});
