import { expect } from "bun:test";

import type { Capabilities, Snapshot as CoreSnapshot } from "@sandbox-sdk/core";

import type { LiveSandbox } from "./fixture";

type Command = Readonly<{
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}>;

type Files = Readonly<{
  file: Workflow["file"];
  inputs: Workflow["inputs"];
  removed: boolean;
}>;

type Paths = Readonly<{
  blob: string;
  buffer: string;
  bytes: string;
  file: string;
  remove: string;
  stream: string;
}>;

export type Workflow = Readonly<{
  capabilities: Capabilities;
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

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const buffer = (value: string): ArrayBuffer => {
  const output = bytes(value);
  const copy = new Uint8Array(output.byteLength);
  copy.set(output);
  return copy.buffer;
};

const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const paths = (directory: string, file: string): Paths => ({
  blob: `${directory}/blob.txt`,
  buffer: `${directory}/buffer.txt`,
  bytes: `${directory}/bytes.txt`,
  file,
  remove: `${directory}/remove.txt`,
  stream: `${directory}/stream.txt`,
});

const writeFiles = async (
  sandbox: LiveSandbox,
  input: Paths,
  directory: string,
  content: string
): Promise<void> => {
  await sandbox.files.mkdir(directory);
  await sandbox.files.write(input.file, content);
  await sandbox.files.write(input.bytes, bytes("bytes"));
  await sandbox.files.write(input.buffer, buffer("buffer"));
  await sandbox.files.write(input.blob, new Blob(["blob"]));
  await sandbox.files.write(input.stream, new Blob(["stream"]).stream());
  await sandbox.files.write(input.remove, "remove");
};

const readFiles = async (
  sandbox: LiveSandbox,
  input: Paths,
  directory: string
): Promise<Files> => {
  const entries = await sandbox.files.list(directory);
  await sandbox.files.remove(input.remove);

  return {
    file: {
      exists: await sandbox.files.exists(input.file),
      listed: entries.some((entry) => entry.path === input.file),
      read: decode(await sandbox.files.read(input.file)),
      stream: await text(await sandbox.files.stream(input.file)),
      text: await sandbox.files.text(input.file),
    },
    inputs: {
      blob: await sandbox.files.text(input.blob),
      buffer: decode(await sandbox.files.read(input.buffer)),
      bytes: decode(await sandbox.files.read(input.bytes)),
      stream: await text(await sandbox.files.stream(input.stream)),
    },
    removed: !(await sandbox.files.exists(input.remove)),
  };
};

const filesOk = (value: Files, content: string): boolean =>
  value.file.exists &&
  value.file.listed &&
  value.file.text === content &&
  value.file.read === content &&
  value.file.stream === content &&
  value.inputs.blob === "blob" &&
  value.inputs.buffer === "buffer" &&
  value.inputs.bytes === "bytes" &&
  value.inputs.stream === "stream" &&
  value.removed;

const commandsOk = (
  input: Pick<Workflow, "exec" | "failure" | "port" | "shell" | "spawn">,
  content: string
): boolean =>
  input.exec.ok &&
  input.exec.stdout === content &&
  input.shell.ok &&
  input.shell.stdout === content &&
  !input.failure.ok &&
  input.failure.code === 7 &&
  input.failure.stderr.includes("failed") &&
  input.spawn.ok &&
  input.spawn.output.includes(content) &&
  input.port.port === 3000 &&
  input.port.url.startsWith("https://");

export const workflow = async (
  sandbox: LiveSandbox,
  directory: string,
  file: string,
  content: string
): Promise<Workflow> => {
  const locations = paths(directory, file);

  await writeFiles(sandbox, locations, directory, content);

  const files = await readFiles(sandbox, locations, directory);
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
  const spawn = { ...spawned, output };
  const command = { exec, failure, port: preview, shell, spawn };
  const ok = filesOk(files, content) && commandsOk(command, content);

  return {
    capabilities: sandbox.capabilities,
    exec,
    failure,
    file: files.file,
    inputs: files.inputs,
    ok,
    port: preview,
    provider: sandbox.provider,
    shell,
    spawn,
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
    read: "hello from vercel",
    stream: "hello from vercel",
    text: "hello from vercel",
  });
  expect(payload.inputs).toEqual({
    blob: "blob",
    buffer: "buffer",
    bytes: "bytes",
    stream: "stream",
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
