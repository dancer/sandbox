import { expect } from "bun:test";
import { randomUUID } from "node:crypto";

import { supports } from "@sandbox-sdk/core";
import type { Result, Running, Sandbox } from "@sandbox-sdk/core";

export type Workflow = Readonly<{
  content: string;
  cwd: string;
  port?: number;
  protocol?: "http" | "https";
  serve?: string;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytes = (value: string): Uint8Array => encoder.encode(value);

const buffer = (value: string): ArrayBuffer => {
  const output = bytes(value);
  const copy = new Uint8Array(output.byteLength);
  copy.set(output);
  return copy.buffer;
};

const content = (value: Uint8Array): string => decoder.decode(value);

const text = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

const clean = (path: string): string =>
  path.endsWith("/") ? path.slice(0, -1) : path;

const path = (base: string, name: string): string => `${base}/${name}`;

const match = (result: Result, expected: string): void => {
  expect(result).toMatchObject({
    code: 0,
    ok: true,
    stdout: expected,
  });
};

const failed = (result: Result): void => {
  expect(result).toMatchObject({
    code: 7,
    ok: false,
  });
  expect(`${result.stdout}\n${result.stderr}`).toContain("failed");
};

const output = async (running: Running, expected: string): Promise<void> => {
  const stream = await text(running.output);
  const result = await running.result;
  expect(result).toMatchObject({
    code: 0,
    ok: true,
  });
  expect(`${result.stdout}\n${stream}`).toContain(expected);
};

const ignore = (): undefined => undefined;

const stop = async (running: Running | undefined): Promise<void> => {
  if (running !== undefined) {
    await running.kill().catch(ignore);
  }
};

export const workflow = async (
  sandbox: Sandbox,
  input: Workflow
): Promise<void> => {
  const root = `${clean(input.cwd)}/sandbox-sdk-${randomUUID()}`;
  const file = path(root, "message.txt");
  const bytesFile = path(root, "bytes.txt");
  const bufferFile = path(root, "buffer.txt");
  const blobFile = path(root, "blob.txt");
  const streamFile = path(root, "stream.txt");
  const removeFile = path(root, "remove.txt");
  let server: Running | undefined;

  await sandbox.files.mkdir(root);
  await sandbox.files.write(file, input.content);
  await sandbox.files.write(bytesFile, bytes("bytes"));
  await sandbox.files.write(bufferFile, buffer("buffer"));
  await sandbox.files.write(blobFile, new Blob(["blob"]));
  await sandbox.files.write(streamFile, new Blob(["stream"]).stream());
  await sandbox.files.write(removeFile, "remove");

  expect(await sandbox.files.exists(file)).toBe(true);
  expect(await sandbox.files.text(file)).toBe(input.content);
  expect(content(await sandbox.files.read(file))).toBe(input.content);
  expect(await text(await sandbox.files.stream(file))).toBe(input.content);
  expect(content(await sandbox.files.read(bytesFile))).toBe("bytes");
  expect(content(await sandbox.files.read(bufferFile))).toBe("buffer");
  expect(await sandbox.files.text(blobFile)).toBe("blob");
  expect(await text(await sandbox.files.stream(streamFile))).toBe("stream");

  const entries = await sandbox.files.list(root);
  expect(entries.some((entry) => entry.path === file)).toBe(true);
  expect(entries.some((entry) => entry.path === bytesFile)).toBe(true);
  expect(entries.some((entry) => entry.path === bufferFile)).toBe(true);
  expect(entries.some((entry) => entry.path === blobFile)).toBe(true);
  expect(entries.some((entry) => entry.path === streamFile)).toBe(true);

  await sandbox.files.remove(removeFile);
  expect(await sandbox.files.exists(removeFile)).toBe(false);

  if (supports(sandbox, "processExec")) {
    match(await sandbox.process.exec("cat", [file]), input.content);
    match(await sandbox.process.shell(`cat ${file}`), input.content);
    failed(
      await sandbox.process.exec("sh", ["-lc", "echo failed >&2; exit 7"])
    );
  }

  if (supports(sandbox, "processSpawn")) {
    await output(
      await sandbox.process.spawnShell(`cat ${file}`),
      input.content
    );
  } else {
    await expect(
      sandbox.process.spawn("echo", ["hello"])
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: sandbox.provider,
    });
    await expect(
      sandbox.process.spawnShell("echo hello")
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: sandbox.provider,
    });
  }

  try {
    if (input.port !== undefined && supports(sandbox, "ports")) {
      if (input.serve !== undefined) {
        server = await sandbox.process.spawnShell(input.serve, { cwd: root });
      }

      const preview = await sandbox.ports.expose(input.port);
      expect(preview.port).toBe(input.port);
      expect(preview.url).toMatch(
        input.protocol === "https" ? /^https:\/\//u : /^https?:\/\//u
      );
    }
  } finally {
    await stop(server);
  }
};
