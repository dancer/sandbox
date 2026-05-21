import { expect } from "bun:test";
import { randomUUID } from "node:crypto";

import { supports } from "@sandbox-sdk/core";
import type {
  Capabilities,
  Result,
  Running,
  Sandbox,
  Url,
} from "@sandbox-sdk/core";

export type Workflow = Readonly<{
  content: string;
  cwd: string;
  port?: number;
  protocol?: "http" | "https";
  serve?: string;
}>;

type File = Readonly<{
  exists: boolean;
  listed: boolean;
  read: string;
  stream: string;
  text: string;
}>;

type Inputs = Readonly<{
  blob: string;
  buffer: string;
  bytes: string;
  stream: string;
}>;

type Commands = Readonly<{
  create: string;
  exec: string;
  shell: string;
}>;

export type Payload = Readonly<{
  capabilities: Capabilities;
  commands?: Commands;
  exec?: Result;
  failure?: Result;
  file: File;
  inputs: Inputs;
  ok: boolean;
  port?: Url;
  provider: string;
  shell?: Result;
  spawn?: Result & Readonly<{ output: string }>;
  unsupported: Readonly<{
    spawn: boolean;
    spawnShell: boolean;
  }>;
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

const match = (result: Result, expected: string): Result => {
  expect(result).toMatchObject({
    code: 0,
    ok: true,
    stdout: expected,
  });
  return result;
};

const failed = (result: Result): Result => {
  expect(result).toMatchObject({
    code: 7,
    ok: false,
  });
  expect(`${result.stdout}\n${result.stderr}`).toContain("failed");
  return result;
};

const spawned = async (
  running: Running,
  expected: string
): Promise<Result & Readonly<{ output: string }>> => {
  const stream = await text(running.output);
  const result = await running.result;
  expect(result).toMatchObject({
    code: 0,
    ok: true,
  });
  expect(`${result.stdout}\n${stream}`).toContain(expected);
  return { ...result, output: stream };
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
): Promise<Payload> => {
  const root = `${clean(input.cwd)}/sandbox-sdk-${randomUUID()}`;
  const file = path(root, "message.txt");
  const bytesFile = path(root, "bytes.txt");
  const bufferFile = path(root, "buffer.txt");
  const blobFile = path(root, "blob.txt");
  const streamFile = path(root, "stream.txt");
  const removeFile = path(root, "remove.txt");
  const createFile = path(root, "create-env.txt");
  const execFile = path(root, "exec-env.txt");
  const shellFile = path(root, "shell-env.txt");
  let server: Running | undefined;

  await sandbox.files.mkdir(root);
  await sandbox.files.write(file, input.content);
  await sandbox.files.write(bytesFile, bytes("bytes"));
  await sandbox.files.write(bufferFile, buffer("buffer"));
  await sandbox.files.write(blobFile, new Blob(["blob"]));
  await sandbox.files.write(streamFile, new Blob(["stream"]).stream());
  await sandbox.files.write(removeFile, "remove");

  const entries = await sandbox.files.list(root);
  const listed = entries.some((entry) => entry.path === file);
  expect(entries.some((entry) => entry.path === bytesFile)).toBe(true);
  expect(entries.some((entry) => entry.path === bufferFile)).toBe(true);
  expect(entries.some((entry) => entry.path === blobFile)).toBe(true);
  expect(entries.some((entry) => entry.path === streamFile)).toBe(true);

  await sandbox.files.remove(removeFile);
  const filePayload = {
    exists: await sandbox.files.exists(file),
    listed,
    read: content(await sandbox.files.read(file)),
    stream: await text(await sandbox.files.stream(file)),
    text: await sandbox.files.text(file),
  };
  const inputs = {
    blob: await sandbox.files.text(blobFile),
    buffer: content(await sandbox.files.read(bufferFile)),
    bytes: content(await sandbox.files.read(bytesFile)),
    stream: await text(await sandbox.files.stream(streamFile)),
  };
  const removed = !(await sandbox.files.exists(removeFile));

  expect(filePayload.exists).toBe(true);
  expect(filePayload.listed).toBe(true);
  expect(filePayload.text).toBe(input.content);
  expect(filePayload.read).toBe(input.content);
  expect(filePayload.stream).toBe(input.content);
  expect(inputs.bytes).toBe("bytes");
  expect(inputs.buffer).toBe("buffer");
  expect(inputs.blob).toBe("blob");
  expect(inputs.stream).toBe("stream");
  expect(removed).toBe(true);

  let exec: Result | undefined;
  let shell: Result | undefined;
  let failure: Result | undefined;
  let commands: Commands | undefined;
  let spawn: (Result & Readonly<{ output: string }>) | undefined;
  let unsupported = { spawn: false, spawnShell: false };
  let preview: Url | undefined;

  if (supports(sandbox, "processExec")) {
    exec = match(await sandbox.process.exec("cat", [file]), input.content);
    shell = match(await sandbox.process.shell(`cat ${file}`), input.content);
    const createOptions = await sandbox.process.exec(
      "sh",
      ["-lc", 'printf %s "$SANDBOX_SDK_CREATE" > create-env.txt'],
      { cwd: root }
    );
    const execOptions = await sandbox.process.exec(
      "sh",
      ["-lc", 'printf %s "$SANDBOX_SDK_EXEC" > exec-env.txt'],
      { cwd: root, env: { SANDBOX_SDK_EXEC: "exec-env" } }
    );
    const shellOptions = await sandbox.process.shell(
      'printf %s "$SANDBOX_SDK_SHELL" > shell-env.txt',
      { cwd: root, env: { SANDBOX_SDK_SHELL: "shell-env" } }
    );
    expect(execOptions).toMatchObject({ code: 0, ok: true });
    expect(createOptions).toMatchObject({ code: 0, ok: true });
    expect(shellOptions).toMatchObject({ code: 0, ok: true });
    commands = {
      create: await sandbox.files.text(createFile),
      exec: await sandbox.files.text(execFile),
      shell: await sandbox.files.text(shellFile),
    };
    expect(commands).toEqual({
      create: "create-env",
      exec: "exec-env",
      shell: "shell-env",
    });
    failure = failed(
      await sandbox.process.exec("sh", ["-lc", "echo failed >&2; exit 7"])
    );
  }

  if (supports(sandbox, "processSpawn")) {
    spawn = await spawned(
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
    unsupported = { spawn: true, spawnShell: true };
  }

  try {
    if (input.port !== undefined && supports(sandbox, "ports")) {
      if (input.serve !== undefined) {
        server = await sandbox.process.spawnShell(input.serve, { cwd: root });
      }

      preview = await sandbox.ports.expose(input.port);
      expect(preview.port).toBe(input.port);
      expect(preview.url).toMatch(
        input.protocol === "https" ? /^https:\/\//u : /^https?:\/\//u
      );
    }
  } finally {
    await stop(server);
  }

  return {
    capabilities: sandbox.capabilities,
    commands,
    exec,
    failure,
    file: filePayload,
    inputs,
    ok: true,
    ...(preview === undefined ? {} : { port: preview }),
    provider: sandbox.provider,
    shell,
    spawn,
    unsupported,
  };
};
