import { expect } from "bun:test";

import type { Snapshot } from "@sandbox-sdk/core";

import type { LiveSandbox } from "./fixture";

export const text = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

export const expectFiles = async (
  sandbox: LiveSandbox,
  directory: string,
  file: string,
  content: string
): Promise<void> => {
  await sandbox.files.write(file, content);

  expect(await sandbox.files.exists(file)).toBe(true);
  expect(await sandbox.files.text(file)).toBe(content);

  const entries = await sandbox.files.list(directory);
  expect(entries.some((entry) => entry.path === file)).toBe(true);
};

export const expectProcess = async (
  sandbox: LiveSandbox,
  file: string,
  content: string
): Promise<void> => {
  const success = await sandbox.process.exec("cat", [file]);
  expect(success).toMatchObject({
    code: 0,
    ok: true,
    stdout: content,
  });

  const shell = await sandbox.process.shell(`cat ${file}`);
  expect(shell).toMatchObject({
    code: 0,
    ok: true,
    stdout: content,
  });

  const running = await sandbox.process.spawnShell(`cat ${file}`);
  const spawnOutput = await text(running.output);
  const spawned = await running.result;
  expect(spawned).toMatchObject({
    code: 0,
    ok: true,
  });
  expect(spawnOutput).toContain(content);

  const failure = await sandbox.process.exec("sh", [
    "-lc",
    "echo failed >&2; exit 7",
  ]);
  expect(failure).toMatchObject({
    code: 7,
    ok: false,
  });
  expect(failure.stderr).toContain("failed");
};

export const expectPort = async (sandbox: LiveSandbox): Promise<void> => {
  const preview = await sandbox.ports.expose(3000);
  expect(preview).toMatchObject({ port: 3000 });
  expect(preview.url).toMatch(/^https:\/\//u);
};

export const expectSnapshotSource = async (
  sandbox: LiveSandbox,
  snapshot: Snapshot,
  file: string,
  content: string
): Promise<void> => {
  expect(sandbox.raw.sourceSnapshotId).toBe(snapshot.id);
  expect(await sandbox.files.exists(file)).toBe(true);
  expect(await sandbox.files.text(file)).toBe(content);
};
