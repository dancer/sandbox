import { expect, test } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SandboxError, create } from "@sandbox-sdk/core";

import { local } from "../src/index";

test("local supports sandbox absolute paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "sandbox-test-"));
  const sandbox = await create({
    adapter: local({ keep: true, root }),
    cwd: "/workspace",
  });

  await sandbox.files.write("/workspace/main.ts", "console.log('ok')");

  expect(await sandbox.files.text("workspace/main.ts")).toBe(
    "console.log('ok')"
  );
  expect(sandbox.cwd).toBe("/workspace");

  await sandbox.stop();
  await rm(root, { force: true, recursive: true });
});

test("local creates and checks directories", async () => {
  const sandbox = await create({ adapter: local() });

  expect(await sandbox.files.exists("/workspace")).toBe(false);
  await sandbox.files.mkdir("/workspace/cache");
  expect(await sandbox.files.exists("/workspace")).toBe(true);

  const entries = await sandbox.files.list("/workspace");
  expect(entries).toEqual([
    expect.objectContaining({
      kind: "directory",
      path: "workspace/cache",
    }),
  ]);

  await sandbox.stop();
});

test("local derives preview urls", async () => {
  const sandbox = await create({ adapter: local() });
  const preview = await sandbox.ports.expose(3000);

  expect(preview).toEqual({
    port: 3000,
    url: "http://localhost:3000",
  });

  await sandbox.stop();
});

test("local prevents paths escaping the sandbox root", async () => {
  const sandbox = await create({ adapter: local() });

  await expect(sandbox.files.write("../outside.txt", "bad")).rejects.toThrow(
    SandboxError
  );

  await sandbox.stop();
});

test("local normalizes missing path errors", async () => {
  const sandbox = await create({ adapter: local() });

  await expect(sandbox.files.text("/missing.txt")).rejects.toMatchObject({
    code: "not_found",
    provider: "local",
  });
  await expect(sandbox.files.list("/missing")).rejects.toMatchObject({
    code: "not_found",
    provider: "local",
  });

  await sandbox.stop();
});

test("local returns command status and output", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const result = await sandbox.process.exec("echo", ["hello"]);

  expect(result.ok).toBe(true);
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe("hello");

  await sandbox.stop();
});

test("local passes sandbox environment to commands", async () => {
  const sandbox = await create({
    adapter: local(),
    env: { SANDBOX_MESSAGE: "hello" },
  });
  const result = await sandbox.process.exec("printenv", ["SANDBOX_MESSAGE"]);

  expect(result.stdout.trim()).toBe("hello");

  await sandbox.stop();
});

test("local applies command timeouts", async () => {
  const sandbox = await create({ adapter: local() });

  await expect(
    sandbox.process.exec("sleep", ["1"], { timeout: 10 })
  ).rejects.toMatchObject({ code: "timeout" });

  await sandbox.stop();
});

test("local writes bytes and removes files", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const value = new Uint8Array([104, 101, 108, 108, 111]);

  await sandbox.files.write("/workspace/data.bin", value);

  expect(await sandbox.files.read("/workspace/data.bin")).toEqual(value);
  expect(await sandbox.files.exists("/workspace/data.bin")).toBe(true);

  await sandbox.files.remove("/workspace/data.bin");
  expect(await sandbox.files.exists("/workspace/data.bin")).toBe(false);

  await sandbox.stop();
});

test("local streams spawned process output", async () => {
  const sandbox = await create({ adapter: local() });
  const running = await sandbox.process.spawn("sh", ["-c", "printf hello"]);
  const streamed = await new Response(running.output).text();
  const completed = await running.result;

  expect(running.id).toBeString();
  expect(streamed).toBe("hello");
  expect(completed).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello",
  });

  await sandbox.stop();
});

test("local removes temporary roots on stop", async () => {
  const sandbox = await create({ adapter: local() });
  const { root } = sandbox.raw;

  await access(root);
  await sandbox.stop();

  await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
});
