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

  expect(sandbox.cwd).toBe("/workspace");
  expect(await sandbox.files.exists("/workspace")).toBe(true);
  await sandbox.files.mkdir("/workspace/cache");
  expect(await sandbox.files.exists("/workspace")).toBe(true);

  const entries = await sandbox.files.list("/workspace");
  expect(entries).toEqual([
    expect.objectContaining({
      kind: "directory",
      path: "/workspace/cache",
    }),
  ]);

  await sandbox.stop();
});

test("local lists cwd by default", async () => {
  const sandbox = await create({ adapter: local() });

  await sandbox.files.write("/workspace/main.ts", "console.log('ok')");

  const entries = await sandbox.files.list();

  expect(entries).toEqual([
    expect.objectContaining({
      kind: "file",
      path: "/workspace/main.ts",
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

test("local rejects invalid preview ports", async () => {
  const sandbox = await create({ adapter: local() });

  await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
    code: "configuration",
    provider: "local",
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

test("local rejects filesystem root sandboxes", async () => {
  await expect(create({ adapter: local({ root: "/" }) })).rejects.toMatchObject(
    {
      code: "path_escape",
      provider: "local",
    }
  );
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
  const shell = await sandbox.process.shell("printf shell");

  expect(result.ok).toBe(true);
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe("hello");
  expect(shell.stdout).toBe("shell");

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

test("local does not inherit arbitrary host environment by default", async () => {
  process.env.SANDBOX_SDK_SECRET = "secret";
  const sandbox = await create({ adapter: local() });
  const result = await sandbox.process.shell(
    "printenv SANDBOX_SDK_SECRET || printf missing"
  );

  expect(result.stdout).toBe("missing");

  await sandbox.stop();
  delete process.env.SANDBOX_SDK_SECRET;
});

test("local can opt into host environment inheritance", async () => {
  process.env.SANDBOX_SDK_ALLOWED = "allowed";
  const all = await create({ adapter: local({ inheritEnv: true }) });
  const picked = await create({
    adapter: local({ inheritEnv: ["SANDBOX_SDK_ALLOWED"] }),
  });

  const allResult = await all.process.exec("printenv", ["SANDBOX_SDK_ALLOWED"]);
  const pickedResult = await picked.process.exec("printenv", [
    "SANDBOX_SDK_ALLOWED",
  ]);

  expect(allResult.stdout.trim()).toBe("allowed");
  expect(pickedResult.stdout.trim()).toBe("allowed");

  await all.stop();
  await picked.stop();
  delete process.env.SANDBOX_SDK_ALLOWED;
});

test("local applies command timeouts", async () => {
  const sandbox = await create({ adapter: local() });
  let thrown: unknown;

  try {
    await sandbox.process.exec("sleep", ["1"], { timeout: 10 });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(SandboxError);
  expect(thrown).toMatchObject({ code: "timeout" });
  expect((thrown as Error).cause).toMatchObject({
    code: 124,
    ok: false,
  });

  await sandbox.stop();
});

test("local rejects invalid command timeouts", async () => {
  const sandbox = await create({ adapter: local() });

  await expect(
    sandbox.process.exec("sleep", ["1"], { timeout: -1 })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "local",
  });
  await expect(
    sandbox.process.spawn("sleep", ["1"], { timeout: -1 })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "local",
  });

  await sandbox.stop();
});

test("local aborts running commands", async () => {
  const sandbox = await create({ adapter: local() });
  const controller = new AbortController();
  const promise = sandbox.process.exec("sleep", ["1"], {
    signal: controller.signal,
  });

  controller.abort("stopped");

  await expect(promise).rejects.toMatchObject({
    code: "aborted",
    provider: "local",
  });

  await sandbox.stop();
});

test("local creates and restores snapshots", async () => {
  const sandbox = await create({ adapter: local() });

  await sandbox.files.write("/workspace/state.txt", "before");
  const snapshot = await sandbox.snapshots.create("checkpoint");
  await sandbox.files.write("/workspace/state.txt", "after");
  await sandbox.files.write("/workspace/extra.txt", "extra");

  await sandbox.snapshots.restore(snapshot.id);

  expect(snapshot.name).toBe("checkpoint");
  expect(await sandbox.files.text("/workspace/state.txt")).toBe("before");
  expect(await sandbox.files.exists("/workspace/extra.txt")).toBe(false);

  await expect(sandbox.snapshots.restore("missing")).rejects.toMatchObject({
    code: "not_found",
    provider: "local",
  });

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
  const shell = await sandbox.process.spawnShell("printf shell");
  const streamed = await new Response(running.output).text();
  const shellStreamed = await new Response(shell.output).text();
  const completed = await running.result;
  const shellCompleted = await shell.result;

  expect(running.id).toBeString();
  expect(streamed).toBe("hello");
  expect(completed).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello",
  });
  expect(shellStreamed).toBe("shell");
  expect(shellCompleted.stdout).toBe("shell");

  await sandbox.stop();
});

test("local removes temporary roots on stop", async () => {
  const sandbox = await create({ adapter: local() });
  const { root } = sandbox.raw;

  await access(root);
  await sandbox.stop();

  await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
});
