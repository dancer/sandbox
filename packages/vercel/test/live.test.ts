import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { vercel } from "../src/index";

const explicit = Boolean(
  process.env.VERCEL_TOKEN &&
  process.env.VERCEL_TEAM_ID &&
  process.env.VERCEL_PROJECT_ID
);
const enabled = explicit || Boolean(process.env.VERCEL_OIDC_TOKEN);
const live = enabled ? test : test.skip;

live("vercel runs a live sandbox workflow", async () => {
  const cwd = "/vercel/sandbox";
  const file = `${cwd}/sandbox-sdk-${randomUUID()}.txt`;
  const adapter = explicit
    ? vercel({
        ports: [3000],
        projectId: process.env.VERCEL_PROJECT_ID,
        teamId: process.env.VERCEL_TEAM_ID,
        timeout: 300_000,
        token: process.env.VERCEL_TOKEN,
      })
    : vercel({
        ports: [3000],
        timeout: 300_000,
      });
  const sandbox = await create({
    adapter,
    cwd,
    ports: [3000],
  });

  try {
    await sandbox.files.write(file, "hello from vercel");

    expect(await sandbox.files.exists(file)).toBe(true);
    expect(await sandbox.files.text(file)).toBe("hello from vercel");

    const entries = await sandbox.files.list(cwd);
    expect(entries.some((entry) => entry.path === file)).toBe(true);

    const success = await sandbox.process.exec("cat", [file]);
    expect(success).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from vercel",
    });

    const shell = await sandbox.process.shell(`cat ${file}`);
    expect(shell).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from vercel",
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
    expect(preview).toMatchObject({ port: 3000 });
    expect(preview.url).toMatch(/^https:\/\//u);
  } finally {
    await sandbox.stop();
  }
});
