import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { blaxel } from "../src/index";

const enabled = Boolean(
  process.env.BL_WORKSPACE &&
  (process.env.BL_API_KEY || process.env.BL_CLIENT_CREDENTIALS)
);
const live = enabled ? test : test.skip;

const adapter = () =>
  blaxel({
    apiKey: process.env.BL_API_KEY,
    clientCredentials: process.env.BL_CLIENT_CREDENTIALS,
    image: "blaxel/base-image:latest",
    name: `sandbox-sdk-${randomUUID()}`,
    region: process.env.BL_REGION,
    ttl: "10m",
    workspace: process.env.BL_WORKSPACE,
  });

live("blaxel runs a live sandbox workflow", async () => {
  const cwd = "/app";
  const file = `${cwd}/sandbox-sdk-${randomUUID()}.txt`;
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });

  try {
    await sandbox.files.write(file, "hello from blaxel");

    expect(await sandbox.files.exists(file)).toBe(true);
    expect(await sandbox.files.text(file)).toBe("hello from blaxel");

    const entries = await sandbox.files.list(cwd);
    expect(entries.some((entry) => entry.path === file)).toBe(true);

    const success = await sandbox.process.exec("cat", [file]);
    expect(success).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from blaxel",
    });

    const shell = await sandbox.process.shell(`cat ${file}`);
    expect(shell).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from blaxel",
    });

    const running = await sandbox.process.spawnShell(`cat ${file}`);
    const spawned = await running.result;
    expect(spawned).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from blaxel",
    });

    const failure = await sandbox.process.exec("sh", [
      "-lc",
      "echo failed >&2; exit 7",
    ]);
    expect(failure).toMatchObject({
      code: 7,
      ok: false,
    });
    expect(failure.stderr).toContain("failed");

    const preview = await sandbox.ports.expose(15_500);
    expect(preview.port).toBe(15_500);
    expect(preview.url).toMatch(/^https:\/\//u);
  } finally {
    await sandbox.stop();
  }
});
