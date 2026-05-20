import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { create } from "@sandbox-sdk/core";

import { codesandbox } from "../dist/index.js";

const token = process.env.CSB_API_KEY?.trim();

if (!token) {
  console.log(
    "codesandbox live verifier skipped because CSB_API_KEY is missing"
  );
  process.exit(0);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytes = (value) => encoder.encode(value);

const buffer = (value) => {
  const output = bytes(value);
  const copy = new Uint8Array(output.byteLength);
  copy.set(output);
  return copy.buffer;
};

const text = (stream) => new Response(stream).text();

const decode = (value) => decoder.decode(value);

const coverage = {
  features: [
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
  ],
  fixture: "workflow",
  provider: "codesandbox",
  uncovered: ["snapshots.create", "snapshots.restore", "snapshotSource"],
};

const path = (directory, name) => `${directory}/${name}`;

const command = (value) => {
  assert.equal(value.ok, true);
  assert.equal(value.code, 0);
  return value;
};

const failure = (value) => {
  assert.equal(value.ok, false);
  assert.equal(value.code, 7);
  assert.match(`${value.stdout}\n${value.stderr}`, /failed/u);
  return value;
};

const ignore = (error) => error;

const sanitize = (payload) => ({
  ...payload,
  port: {
    ...payload.port,
    url: "https://preview.csb.app",
  },
});

const write = async (fixture) => {
  const current = import.meta.dirname;
  const file = path(`${current}/__fixtures__`, "workflow.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
};

const workflow = async (sandbox) => {
  const content = "hello from codesandbox";
  const root = `/project/sandbox/sandbox-sdk-${randomUUID()}`;
  const file = path(root, "message.txt");
  const bytesFile = path(root, "bytes.txt");
  const bufferFile = path(root, "buffer.txt");
  const blobFile = path(root, "blob.txt");
  const streamFile = path(root, "stream.txt");
  const removeFile = path(root, "remove.txt");

  await sandbox.files.mkdir(root);
  await sandbox.files.write(file, content);
  await sandbox.files.write(bytesFile, bytes("bytes"));
  await sandbox.files.write(bufferFile, buffer("buffer"));
  await sandbox.files.write(blobFile, new Blob(["blob"]));
  await sandbox.files.write(streamFile, new Blob(["stream"]).stream());
  await sandbox.files.write(removeFile, "remove");

  const entries = await sandbox.files.list(root);
  await sandbox.files.remove(removeFile);

  const exec = command(await sandbox.process.exec("cat", [file]));
  const shell = command(await sandbox.process.shell(`cat ${file}`));
  const running = await sandbox.process.spawnShell(`cat ${file}`);
  const output = await text(running.output);
  const spawned = command(await running.result);
  const failed = failure(
    await sandbox.process.exec("sh", ["-lc", "echo failed >&2; exit 7"])
  );
  const server = await sandbox.process.spawnShell(
    "node -e \"require('http').createServer((_, response) => response.end('ok')).listen(3000)\"",
    { cwd: root }
  );

  try {
    const preview = await sandbox.ports.expose(3000);

    const payload = {
      capabilities: sandbox.capabilities,
      exec,
      failure: failed,
      file: {
        exists: await sandbox.files.exists(file),
        listed: entries.some((entry) => entry.path === file),
        read: decode(await sandbox.files.read(file)),
        stream: await text(await sandbox.files.stream(file)),
        text: await sandbox.files.text(file),
      },
      inputs: {
        blob: await sandbox.files.text(blobFile),
        buffer: decode(await sandbox.files.read(bufferFile)),
        bytes: decode(await sandbox.files.read(bytesFile)),
        stream: await text(await sandbox.files.stream(streamFile)),
      },
      ok: true,
      port: preview,
      provider: sandbox.provider,
      shell,
      spawn: { ...spawned, output },
    };

    assert.equal(payload.provider, "codesandbox");
    assert.equal(payload.file.text, content);
    assert.equal(payload.file.read, content);
    assert.equal(payload.file.stream, content);
    assert.equal(payload.file.exists, true);
    assert.equal(payload.file.listed, true);
    assert.equal(await sandbox.files.exists(removeFile), false);
    assert.equal(payload.inputs.blob, "blob");
    assert.equal(payload.inputs.buffer, "buffer");
    assert.equal(payload.inputs.bytes, "bytes");
    assert.equal(payload.inputs.stream, "stream");
    assert.equal(payload.exec.stdout, content);
    assert.equal(payload.shell.stdout, content);
    assert.match(payload.spawn.output, /hello from codesandbox/u);
    assert.equal(payload.port.port, 3000);
    assert.match(payload.port.url, /^https:\/\//u);

    return payload;
  } finally {
    await server.kill().catch(ignore);
  }
};

const sandbox = await create({
  adapter: codesandbox({
    stop: "delete",
    token,
  }),
  cwd: "/project/sandbox",
});

try {
  const payload = await workflow(sandbox);
  const fixture = { coverage, payload: sanitize(payload) };

  if (process.env.SANDBOX_SDK_RECORD_FIXTURES === "1") {
    await write(fixture);
  }

  console.log("codesandbox live verifier passed");
} finally {
  await sandbox.stop();
}
