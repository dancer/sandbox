import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { daytona } from "../src/index";

const credentialed = Boolean(
  process.env.DAYTONA_API_KEY ||
  (process.env.DAYTONA_JWT_TOKEN && process.env.DAYTONA_ORGANIZATION_ID)
);
const enabled = credentialed && Boolean(process.env.DAYTONA_TARGET);
const live = enabled ? test : test.skip;

live("daytona runs a live sandbox workflow", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const file = `${cwd}/message.txt`;
  const sandbox = await create({
    adapter: daytona({
      deleteOnStop: true,
      timeout: 300_000,
    }),
    cwd,
  });

  try {
    await sandbox.files.write(file, "hello from daytona");

    expect(await sandbox.files.exists(file)).toBe(true);
    expect(await sandbox.files.text(file)).toBe("hello from daytona");

    const entries = await sandbox.files.list(cwd);
    expect(entries.some((entry) => entry.path === file)).toBe(true);

    const success = await sandbox.process.exec("cat", [file]);
    expect(success).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from daytona",
    });

    const shell = await sandbox.process.shell(`cat ${file}`);
    expect(shell).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from daytona",
    });

    const failure = await sandbox.process.exec("sh", [
      "-lc",
      "echo failed >&2; exit 7",
    ]);
    expect(failure).toMatchObject({
      code: 7,
      ok: false,
    });

    await expect(
      sandbox.process.spawn("echo", ["hello"])
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "daytona",
    });
    await expect(
      sandbox.process.spawnShell("echo hello")
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "daytona",
    });

    const preview = await sandbox.ports.expose(3000);
    expect(preview.port).toBe(3000);
    expect(preview.url).toMatch(/^https?:\/\//u);
  } finally {
    await sandbox.stop();
  }
});
