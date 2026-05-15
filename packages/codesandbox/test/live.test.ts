import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { codesandbox } from "../src/index";

const enabled = Boolean(process.env.CSB_API_KEY);
const live = enabled ? test : test.skip;
const text = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

live("codesandbox runs a live sandbox workflow", async () => {
  const cwd = "/project/sandbox";
  const file = `${cwd}/sandbox-sdk-${randomUUID()}.txt`;
  const sandbox = await create({
    adapter: codesandbox({
      stop: "delete",
    }),
    cwd,
  });

  try {
    await sandbox.files.write(file, "hello from codesandbox");

    expect(await sandbox.files.exists(file)).toBe(true);
    expect(await sandbox.files.text(file)).toBe("hello from codesandbox");

    const entries = await sandbox.files.list(cwd);
    expect(entries.some((entry) => entry.path === file)).toBe(true);

    const success = await sandbox.process.exec("cat", [file]);
    expect(success).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from codesandbox",
    });

    const shell = await sandbox.process.shell(`cat ${file}`);
    expect(shell).toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello from codesandbox",
    });

    const running = await sandbox.process.spawnShell(`cat ${file}`);
    const spawnOutput = await text(running.output);
    const spawned = await running.result;
    expect(spawned).toMatchObject({
      code: 0,
      ok: true,
    });
    expect(spawnOutput).toContain("hello from codesandbox");

    const failure = await sandbox.process.shell("echo failed >&2; exit 7");
    expect(failure).toMatchObject({
      code: 7,
      ok: false,
    });
    expect(failure.stdout).toContain("failed");

    await sandbox.process.spawnShell(
      "node -e \"require('http').createServer((_, res) => res.end('ok')).listen(3000)\""
    );
    const preview = await sandbox.ports.expose(3000);
    expect(preview.port).toBe(3000);
    expect(preview.url).toMatch(/^https:\/\//u);
  } finally {
    await sandbox.stop();
  }
});
