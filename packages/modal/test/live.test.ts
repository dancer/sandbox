import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { create } from "@sandbox-sdk/core";

import { record, sourceFixture, workflowFixture } from "../../../test/fixture";
import type { Source } from "../../../test/fixture";
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
    env: { SANDBOX_SDK_CREATE: "create-env" },
    ports: [3000],
  });

  try {
    const payload = await workflow(sandbox, {
      content: "hello from modal",
      cwd,
      port: 3000,
      protocol: "https",
    });
    await record(
      new URL("__fixtures__/workflow.json", import.meta.url),
      workflowFixture("modal", payload, ["snapshots.create", "snapshotSource"])
    );
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
    const payload: Source = {
      capabilities: derived.capabilities,
      file: {
        exists: await derived.files.exists(file),
        text: await derived.files.text(file),
      },
      ok: true,
      provider: derived.provider,
      snapshot,
      source: snapshot.id,
    };
    await record(
      new URL("__fixtures__/source.json", import.meta.url),
      sourceFixture("modal", payload, [
        "ports.expose",
        "process.exec",
        "process.shell",
        "process.spawnShell",
      ])
    );
  } finally {
    await Promise.all([derived?.stop(), sandbox.stop()]);
  }
});

live("modal exposes advertised raw capabilities", async () => {
  const cwd = "/app";
  const sandbox = await create({
    adapter: adapter(),
    cwd,
    metadata: { purpose: "sandbox-sdk-raw" },
    ports: [3000],
  });

  try {
    const tags = await sandbox.raw.getTags();
    expect(tags.purpose).toBe("sandbox-sdk-raw");

    await sandbox.raw.setTags({ purpose: "sandbox-sdk-updated" });
    const updated = await sandbox.raw.getTags();
    expect(updated.purpose).toBe("sandbox-sdk-updated");

    const tunnels = await sandbox.raw.tunnels();
    expect(tunnels[3000]?.url.startsWith("https://")).toBe(true);

    const credentials = await sandbox.raw.createConnectToken();
    expect(credentials.url.startsWith("https://")).toBe(true);
    expect(credentials.token.length).toBeGreaterThan(0);
  } finally {
    await sandbox.stop();
  }
});
