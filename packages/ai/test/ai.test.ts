import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

import { tools } from "../src/index";

test("tools returns prompt context and selected tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec"],
    cwd: "/workspace",
    maxOutput: 5,
  });

  expect(kit.description).toContain("isolated local sandbox");
  expect(kit.description).toContain("/workspace");
  expect(Object.keys(kit.tools).toSorted()).toEqual([
    "exec",
    "list",
    "read",
    "write",
  ]);

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

  expect(read?.text).toBe("hello");
  expect(
    list?.entries.some((entry) => entry.path === "workspace/file.txt")
  ).toBe(true);
  expect(exec?.stdout.trim()).toBe("hello");

  await sandbox.stop();
});
