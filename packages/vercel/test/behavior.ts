import { expect } from "bun:test";

import type { Capabilities, Snapshot as CoreSnapshot } from "@sandbox-sdk/core";

import type { LiveSandbox } from "./fixture";

type Command = Readonly<{
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}>;

export type Workflow = Readonly<{
  capabilities: Capabilities;
  exec: Command;
  failure: Command;
  file: Readonly<{
    exists: boolean;
    listed: boolean;
    text: string;
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

export type Coverage = Readonly<{
  fixture: string;
  features: readonly string[];
  provider: string;
  uncovered: readonly string[];
}>;

export type Source = Readonly<{
  capabilities: Capabilities;
  file: Readonly<{
    exists: boolean;
    text: string;
  }>;
  ok: boolean;
  provider: string;
  snapshot: CoreSnapshot;
  source: string | undefined;
}>;

export const text = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

export const workflow = async (
  sandbox: LiveSandbox,
  directory: string,
  file: string,
  content: string
): Promise<Workflow> => {
  await sandbox.files.write(file, content);

  const exists = await sandbox.files.exists(file);
  const fileText = await sandbox.files.text(file);
  const entries = await sandbox.files.list(directory);
  const listed = entries.some((entry) => entry.path === file);
  const exec = await sandbox.process.exec("cat", [file]);
  const shell = await sandbox.process.shell(`cat ${file}`);
  const running = await sandbox.process.spawnShell(`cat ${file}`);
  const output = await text(running.output);
  const spawned = await running.result;
  const failure = await sandbox.process.exec("sh", [
    "-lc",
    "echo failed >&2; exit 7",
  ]);
  const preview = await sandbox.ports.expose(3000);
  const ok =
    exists &&
    listed &&
    fileText === content &&
    exec.ok &&
    exec.stdout === content &&
    shell.ok &&
    shell.stdout === content &&
    !failure.ok &&
    failure.code === 7 &&
    failure.stderr.includes("failed") &&
    spawned.ok &&
    output.includes(content) &&
    preview.port === 3000 &&
    preview.url.startsWith("https://");

  return {
    capabilities: sandbox.capabilities,
    exec,
    failure,
    file: { exists, listed, text: fileText },
    ok,
    port: preview,
    provider: sandbox.provider,
    shell,
    spawn: { ...spawned, output },
  };
};

export const source = async (
  sandbox: LiveSandbox,
  snapshot: CoreSnapshot,
  file: string,
  content: string
): Promise<Source> => {
  const exists = await sandbox.files.exists(file);
  const fileText = await sandbox.files.text(file);
  const ok =
    sandbox.raw.sourceSnapshotId === snapshot.id &&
    exists &&
    fileText === content;

  return {
    capabilities: sandbox.capabilities,
    file: { exists, text: fileText },
    ok,
    provider: sandbox.provider,
    snapshot,
    source: sandbox.raw.sourceSnapshotId,
  };
};

export const expectWorkflow = (payload: Workflow): void => {
  expect(payload.ok).toBe(true);
  expect(payload.provider).toBe("vercel");
  expect(payload.capabilities.files).toBe(true);
  expect(payload.capabilities.ports).toBe("create-time");
  expect(payload.capabilities.processExec).toBe(true);
  expect(payload.capabilities.processSpawn).toBe("separate");
  expect(payload.capabilities.snapshotCreate).toBe("disk");
  expect(payload.capabilities.snapshotRestore).toBe(false);
  expect(payload.capabilities.snapshotSource).toBe("create-time");
  expect(payload.file).toEqual({
    exists: true,
    listed: true,
    text: "hello from vercel",
  });
  expect(payload.exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from vercel",
  });
  expect(payload.shell).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from vercel",
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
  expect(payload.spawn.output).toContain("hello from vercel");
  expect(payload.port.port).toBe(3000);
  expect(payload.port.url).toMatch(/^https:\/\//u);
};

export const expectSource = (payload: Source): void => {
  expect(payload.ok).toBe(true);
  expect(payload.provider).toBe("vercel");
  expect(payload.capabilities.snapshotCreate).toBe("disk");
  expect(payload.capabilities.snapshotRestore).toBe(false);
  expect(payload.capabilities.snapshotSource).toBe("create-time");
  expect(payload.snapshot.id).toBeTruthy();
  expect(payload.source).toBe(payload.snapshot.id);
  expect(payload.file).toEqual({
    exists: true,
    text: "ready",
  });
};

export const expectWorkflowCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("vercel");
  expect(payload.fixture).toBe("workflow");
  expect(payload.features).toEqual([
    "capabilities",
    "files.write",
    "files.exists",
    "files.text",
    "files.list",
    "process.exec",
    "process.shell",
    "process.spawnShell",
    "process.failure",
    "ports.expose",
    "sandbox.raw.delete",
  ]);
  expect(payload.uncovered).toEqual(["snapshots.create", "snapshotSource"]);
};

export const expectSourceCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("vercel");
  expect(payload.fixture).toBe("source");
  expect(payload.features).toEqual([
    "capabilities",
    "snapshots.create",
    "snapshotSource",
    "files.exists",
    "files.text",
    "sandbox.raw.delete",
  ]);
  expect(payload.uncovered).toEqual([
    "ports.expose",
    "process.exec",
    "process.shell",
    "process.spawnShell",
  ]);
};
