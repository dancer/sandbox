import { expect, test } from "bun:test";

import { blaxel } from "@sandbox-sdk/blaxel";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { codesandbox } from "@sandbox-sdk/codesandbox";
import { supports, supportsRaw } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";
import { e2b } from "@sandbox-sdk/e2b";
import { local } from "@sandbox-sdk/local";
import { modal } from "@sandbox-sdk/modal";
import { vercel } from "@sandbox-sdk/vercel";

test("adapters expose capability-honest feature modes", () => {
  expect(local().capabilities).toMatchObject({
    files: true,
    ports: "derived",
    processExec: true,
    processSpawn: "combined",
    snapshotCreate: "filesystem",
    snapshotRestore: "filesystem",
  });

  expect(e2b().capabilities).toMatchObject({
    files: true,
    ports: "derived",
    processExec: true,
    processSpawn: "combined",
    raw: {
      git: true,
      lifecycle: "dynamic",
      mcp: "create-time",
      network: "create-time",
      pty: true,
      volumes: "create-time",
      watching: true,
    },
    snapshotCreate: "disk",
    snapshotRestore: false,
    snapshotSource: "create-time",
  });

  expect(vercel().capabilities).toMatchObject({
    files: true,
    ports: "create-time",
    processExec: true,
    processSpawn: "separate",
    raw: {
      lifecycle: "dynamic",
      network: "dynamic",
    },
    snapshotCreate: "disk",
    snapshotRestore: false,
    snapshotSource: "create-time",
  });

  expect(
    cloudflare({
      binding: {} as Parameters<typeof cloudflare>[0]["binding"],
    }).capabilities
  ).toMatchObject({
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: "separate",
    raw: {
      backup: true,
      buckets: true,
      desktop: true,
      git: true,
      interpreter: true,
      network: true,
      pty: true,
      sessions: true,
      tunnels: "dynamic",
      watching: true,
    },
    snapshotCreate: false,
    snapshotRestore: false,
  });

  expect(daytona().capabilities).toMatchObject({
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: "combined",
    raw: {
      desktop: true,
      git: true,
      interpreter: true,
      lifecycle: "dynamic",
      lsp: true,
      network: "create-time",
      previews: true,
      pty: true,
      sessions: true,
      ssh: true,
      volumes: "create-time",
    },
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "combined",
  });

  expect(modal().capabilities).toMatchObject({
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
      secrets: "create-time",
      tunnels: "create-time",
      volumes: "create-time",
    },
    snapshotCreate: "filesystem",
    snapshotRestore: false,
    snapshotSource: "create-time",
  });

  expect(blaxel().capabilities).toMatchObject({
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: true,
    raw: {
      codegen: true,
      drives: true,
      lifecycle: true,
      network: "create-time",
      previews: true,
      sessions: true,
      system: true,
      volumes: "create-time",
      watching: true,
    },
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: false,
  });

  expect(codesandbox().capabilities).toMatchObject({
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: true,
    raw: {
      interpreter: true,
      lifecycle: true,
      previews: true,
      pty: true,
      sessions: true,
      watching: true,
    },
    snapshotCreate: "memory",
    snapshotRestore: false,
    snapshotSource: "create-time",
  });
});

test("raw capabilities are separate from normalized capabilities", () => {
  const current = cloudflare({
    binding: {} as Parameters<typeof cloudflare>[0]["binding"],
  });

  expect(supports(current, "ports")).toBe(true);
  expect(supportsRaw(current, "desktop")).toBe(true);
  expect(supportsRaw(current, "git")).toBe(true);
  expect(supportsRaw(current, "backup")).toBe(true);
  expect(supportsRaw(current, "interpreter")).toBe(true);
  expect(supportsRaw(current, "pty")).toBe(true);
  expect(supportsRaw(current, "sessions")).toBe(true);
  expect(supportsRaw(current, "tunnels")).toBe(true);
  expect(supportsRaw(current, "watching")).toBe(true);
});
