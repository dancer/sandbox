import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

import { tools } from "../src/index";

test("tools returns prompt context and selected tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec", "preview"],
    cwd: "/workspace",
    maxOutput: 5,
  });

  expect(kit.description).toContain("isolated local sandbox");
  expect(kit.description).toContain("/workspace");
  expect(kit.description).not.toContain("snapshot creation");
  expect(kit.description).not.toContain("snapshot restore");
  expect(Object.keys(kit.tools).toSorted()).toEqual([
    "exec",
    "list",
    "preview",
    "read",
    "write",
  ]);
  expect(kit.sandbox.capabilities.files).toBe(true);
  expect(kit.sandbox.description).toBe(kit.description);
  expect(kit.sandbox.provider).toBe("local");
  expect(kit.sandbox.workingDirectory).toBe("/workspace");
  expect(kit.tools.exec?.inputSchema.additionalProperties).toBe(false);
  expect(kit.tools.exec?.strict).toBe(true);

  await sandbox.stop();
});

test("tools can read, write, list, and execute", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, { allow: ["read", "write", "list", "exec"] });

  await kit.tools.write?.execute({
    path: "/workspace/file.txt",
    text: "hello",
  });

  const read = await kit.tools.read?.execute({ path: "/workspace/file.txt" });
  const list = await kit.tools.list?.execute({ path: "/workspace" });
  const exec = await kit.tools.exec?.execute({
    args: ["hello"],
    command: "echo",
  });
  const shell = await kit.tools.exec?.execute({
    command: "printf shell",
  });
  const env = await kit.tools.exec?.execute({
    args: ["SANDBOX_VALUE"],
    command: "printenv",
    env: { SANDBOX_VALUE: "ok" },
  });

  expect(read?.text).toBe("hello");
  expect(
    list?.entries.some((entry) => entry.path === "/workspace/file.txt")
  ).toBe(true);
  expect(exec?.stdout.trim()).toBe("hello");
  expect(shell?.stdout).toBe("shell");
  expect(env?.stdout.trim()).toBe("ok");

  await sandbox.stop();
});

test("tools expose an ai sdk sandbox shape", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, { timeout: 10_000 });

  const output = await kit.sandbox.executeCommand({
    command: "printf ai",
    workingDirectory: "/workspace",
  });

  expect(output).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: "ai",
  });

  await sandbox.stop();
});

test("tools can expose local previews", async () => {
  const sandbox = await create({ adapter: local() });
  const kit = tools(sandbox);
  const preview = await kit.tools.preview?.execute({ port: 3000 });

  expect(preview?.url).toBe("http://localhost:3000");

  await sandbox.stop();
});

test("tools trim command output for agent payloads", async () => {
  const sandbox = await create({ adapter: local() });
  const kit = tools(sandbox, {
    allow: ["exec"],
    maxOutput: 4,
  });

  const output = await kit.tools.exec?.execute({
    args: ["hello"],
    command: "printf",
  });

  expect(output?.stdout).toBe("hell\n[truncated 1 bytes]");

  await sandbox.stop();
});

test("tools run write policy before file writes", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const seen: string[] = [];
  const kit = tools(sandbox, {
    beforeWrite(input, context) {
      seen.push(`${context.tool}:${context.cwd}:${context.sandbox.provider}`);
      if (!input.path.startsWith("/workspace/")) {
        throw new Error("write blocked");
      }
    },
  });

  await expect(
    kit.tools.write?.execute({
      path: "/tmp/file.txt",
      text: "no",
    })
  ).rejects.toThrow("write blocked");

  await kit.tools.write?.execute({
    path: "/workspace/file.txt",
    text: "yes",
  });

  expect(await sandbox.files.exists("/tmp/file.txt")).toBe(false);
  expect(await sandbox.files.text("/workspace/file.txt")).toBe("yes");
  expect(seen).toEqual(["write:/workspace:local", "write:/workspace:local"]);

  await sandbox.stop();
});

test("tools run exec policy before commands", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const commands: string[] = [];
  const kit = tools(sandbox, {
    beforeExec(input) {
      commands.push(input.command);
      if (input.command === "rm") {
        throw new Error("exec blocked");
      }
    },
  });

  await expect(
    kit.tools.exec?.execute({
      args: ["-rf", "/workspace"],
      command: "rm",
    })
  ).rejects.toThrow("exec blocked");

  const output = await kit.tools.exec?.execute({
    args: ["ok"],
    command: "printf",
  });

  expect(output?.stdout).toBe("ok");
  expect(commands).toEqual(["rm", "printf"]);

  await sandbox.stop();
});

test("agent command execution uses exec policy", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    beforeExec(input) {
      if (input.command.includes("blocked")) {
        throw new Error("agent blocked");
      }
    },
  });

  await expect(
    kit.sandbox.executeCommand({
      command: "printf blocked",
      workingDirectory: "/workspace",
    })
  ).rejects.toThrow("agent blocked");

  const output = await kit.sandbox.executeCommand({
    command: "printf allowed",
    workingDirectory: "/workspace",
  });

  expect(output.stdout).toBe("allowed");

  await sandbox.stop();
});
