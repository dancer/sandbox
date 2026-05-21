import { expect, test } from "bun:test";

import { blaxel } from "@sandbox-sdk/blaxel";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { codesandbox } from "@sandbox-sdk/codesandbox";
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
    snapshotCreate: "disk",
    snapshotRestore: false,
    snapshotSource: "create-time",
  });

  expect(vercel().capabilities).toMatchObject({
    files: true,
    ports: "create-time",
    processExec: true,
    processSpawn: "separate",
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
    snapshotCreate: false,
    snapshotRestore: false,
  });

  expect(daytona().capabilities).toMatchObject({
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: "combined",
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: "create-time",
  });

  expect(modal().capabilities).toMatchObject({
    files: true,
    ports: "create-time",
    processExec: true,
    processSpawn: false,
    snapshotCreate: "filesystem",
    snapshotRestore: false,
    snapshotSource: "create-time",
  });

  expect(blaxel().capabilities).toMatchObject({
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: true,
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: false,
  });

  expect(codesandbox().capabilities).toMatchObject({
    files: true,
    ports: "dynamic",
    processExec: true,
    processSpawn: true,
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: false,
  });
});
