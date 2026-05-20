import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { create } from "@sandbox-sdk/core";

import { workflow } from "../../../test/workflow";
import { modal } from "../src/index";

const modalConfig = (): boolean =>
  Boolean(process.env.MODAL_CONFIG_PATH) ||
  existsSync(join(homedir(), ".modal.toml"));

const enabled = Boolean(
  (process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET) ||
  modalConfig()
);
const live = enabled ? test : test.skip;

const adapter = () =>
  modal({
    app: "sandbox-sdk-live",
    image: "alpine:3.21",
    ports: [3000],
    timeout: 300_000,
    tokenId: process.env.MODAL_TOKEN_ID,
    tokenSecret: process.env.MODAL_TOKEN_SECRET,
  });

live("modal runs a live sandbox workflow", async () => {
  const cwd = "/app";
  const sandbox = await create({
    adapter: adapter(),
    cwd,
    ports: [3000],
  });

  try {
    await workflow(sandbox, {
      content: "hello from modal",
      cwd,
      port: 3000,
      protocol: "https",
    });
  } finally {
    await sandbox.stop();
  }
});

live("modal creates and starts from a live snapshot", async () => {
  const cwd = "/app";
  const file = `${cwd}/sandbox-sdk-${randomUUID()}.txt`;
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });
  let derived: typeof sandbox | undefined;

  try {
    await sandbox.files.write(file, "ready");

    const snapshot = await sandbox.snapshots.create("sandbox-sdk-live");
    expect(snapshot.id).toBeTruthy();

    derived = await create({
      adapter: adapter(),
      cwd,
      snapshot: snapshot.id,
    });

    expect(await derived.files.exists(file)).toBe(true);
    expect(await derived.files.text(file)).toBe("ready");
  } finally {
    await Promise.all([derived?.stop(), sandbox.stop()]);
  }
});
