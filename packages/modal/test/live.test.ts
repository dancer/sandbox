import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { modal } from "../src/index";

const enabled = Boolean(
  process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET
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
  const file = `${cwd}/sandbox-sdk-${randomUUID()}.txt`;
  const sandbox = await create({
    adapter: adapter(),
    cwd,
    ports: [3000],
  });

  try {
    await sandbox.files.write(file, "hello from modal");

    expect(await sandbox.files.exists(file)).toBe(true);
    expect(await sandbox.files.text(file)).toBe("hello from modal");

    const entries = await sandbox.files.list(cwd);
    expect(entries.some((entry) => entry.path === file)).toBe(true);

    const success = await sandbox.process.exec("cat", [file]);
    expect(success).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from modal",
    });

    const shell = await sandbox.process.shell(`cat ${file}`);
    expect(shell).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from modal",
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

    await expect(
      sandbox.process.spawn("echo", ["hello"])
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "modal",
    });

    const preview = await sandbox.ports.expose(3000);
    expect(preview.port).toBe(3000);
    expect(preview.url).toMatch(/^https:\/\//u);
  } finally {
    await sandbox.stop();
  }
});
