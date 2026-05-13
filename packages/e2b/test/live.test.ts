import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { e2b } from "../src/index";

const enabled = Boolean(
  process.env.E2B_API_KEY || process.env.E2B_ACCESS_TOKEN
);
const live = enabled ? test : test.skip;

live("e2b runs a live sandbox workflow", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const file = `${cwd}/message.txt`;
  const sandbox = await create({
    adapter: e2b({ timeout: 300_000 }),
    cwd,
  });

  try {
    await sandbox.files.write(file, "hello from e2b");

    expect(await sandbox.files.exists(file)).toBe(true);
    expect(await sandbox.files.text(file)).toBe("hello from e2b");

    const entries = await sandbox.files.list(cwd);
    expect(entries.some((entry) => entry.path === file)).toBe(true);

    const success = await sandbox.process.exec("cat", [file]);
    expect(success).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from e2b",
    });

    const shell = await sandbox.process.shell(`cat ${file}`);
    expect(shell).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from e2b",
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

    const preview = await sandbox.ports.expose(3000);
    expect(preview.port).toBe(3000);
    expect(preview.url).toMatch(/^https?:\/\//u);
  } finally {
    await sandbox.stop();
  }
});
