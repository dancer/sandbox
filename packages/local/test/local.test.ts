import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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

test("local prevents paths escaping the sandbox root", async () => {
  const sandbox = await create({ adapter: local() });

  await expect(sandbox.files.write("../outside.txt", "bad")).rejects.toThrow(
    SandboxError
  );

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

test("local applies command timeouts", async () => {
  const sandbox = await create({ adapter: local() });

  await expect(
    sandbox.process.exec("sleep", ["1"], { timeout: 10 })
  ).rejects.toMatchObject({ code: "timeout" });

  await sandbox.stop();
});
