import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { workflow } from "../../../test/workflow";
import { e2b } from "../src/index";

const enabled = Boolean(
  process.env.E2B_API_KEY || process.env.E2B_ACCESS_TOKEN
);
const live = enabled ? test : test.skip;

live("e2b runs a live sandbox workflow", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const sandbox = await create({
    adapter: e2b({ timeout: 300_000 }),
    cwd,
  });

  try {
    await workflow(sandbox, {
      content: "hello from e2b",
      cwd,
      port: 3000,
    });
  } finally {
    await sandbox.stop();
  }
});

live("e2b creates and starts from a live snapshot", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const file = `${cwd}/snapshot.txt`;
  const sandbox = await create({
    adapter: e2b({ timeout: 300_000 }),
    cwd,
  });
  let derived: typeof sandbox | undefined;

  try {
    await sandbox.files.write(file, "ready");

    const snapshot = await sandbox.snapshots.create("sandbox-sdk-live");
    expect(snapshot.id).toBeTruthy();

    derived = await create({
      adapter: e2b({ timeout: 300_000 }),
      cwd,
      snapshot: snapshot.id,
    });

    expect(await derived.files.exists(file)).toBe(true);
    expect(await derived.files.text(file)).toBe("ready");
  } finally {
    await Promise.all([derived?.stop(), sandbox.stop()]);
  }
});
