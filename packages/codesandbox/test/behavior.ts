import { expect } from "bun:test";

import type { Capabilities } from "@sandbox-sdk/core";

type Command = Readonly<{
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}>;

export type Coverage = Readonly<{
  features: readonly string[];
  fixture: string;
  provider: string;
  uncovered: readonly string[];
}>;

export type Workflow = Readonly<{
  capabilities: Capabilities;
  commands: Readonly<{
    create: string;
    exec: string;
    shell: string;
  }>;
  exec: Command;
  failure: Command;
  file: Readonly<{
    exists: boolean;
    listed: boolean;
    read: string;
    stream: string;
    text: string;
  }>;
  inputs: Readonly<{
    blob: string;
    buffer: string;
    bytes: string;
    stream: string;
  }>;
  ok: boolean;
  port: Readonly<{
    port: number;
    url: string;
  }>;
  provider: string;
  shell: Command;
  spawn: Command & Readonly<{ output: string }>;
}>;

export const expectCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("codesandbox");
  expect(payload.fixture).toBe("workflow");
  expect(payload.features).toEqual([
    "capabilities",
    "files.mkdir",
    "files.write",
    "files.write.bytes",
    "files.write.arrayBuffer",
    "files.write.blob",
    "files.write.readableStream",
    "files.exists",
    "files.read",
    "files.stream",
    "files.text",
    "files.list",
    "files.remove",
    "environment.create",
    "process.exec",
    "process.exec.options",
    "process.shell",
    "process.shell.options",
    "process.spawnShell",
    "process.failure",
    "ports.expose",
    "sandbox.raw.delete",
  ]);
  expect(payload.uncovered).toEqual([
    "snapshots.create",
    "snapshots.restore",
    "snapshotSource",
  ]);
};

export const expectWorkflow = (payload: Workflow): void => {
  expect(payload.ok).toBe(true);
  expect(payload.provider).toBe("codesandbox");
  expect(payload.capabilities.files).toBe(true);
  expect(payload.capabilities.ports).toBe("dynamic");
  expect(payload.capabilities.processExec).toBe(true);
  expect(payload.capabilities.processSpawn).toBe(true);
  expect(payload.capabilities.snapshotCreate).toBe(false);
  expect(payload.capabilities.snapshotRestore).toBe(false);
  expect(payload.capabilities.snapshotSource).toBe(false);
  expect(payload.file).toEqual({
    exists: true,
    listed: true,
    read: "hello from codesandbox",
    stream: "hello from codesandbox",
    text: "hello from codesandbox",
  });
  expect(payload.inputs).toEqual({
    blob: "blob",
    buffer: "buffer",
    bytes: "bytes",
    stream: "stream",
  });
  expect(payload.commands).toEqual({
    create: "create-env",
    exec: "exec-env",
    shell: "shell-env",
  });
  expect(payload.exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from codesandbox",
  });
  expect(payload.shell).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from codesandbox",
  });
  expect(payload.failure).toMatchObject({
    code: 7,
    ok: false,
  });
  expect(payload.failure.stderr).toContain("failed");
  expect(payload.spawn).toMatchObject({
    code: 0,
    ok: true,
  });
  expect(payload.spawn.output).toContain("hello from codesandbox");
  expect(payload.port.port).toBe(3000);
  expect(payload.port.url).toMatch(/^https:\/\//u);
};
