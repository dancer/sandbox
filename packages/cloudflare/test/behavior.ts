import { expect } from "bun:test";

import type { Coverage, PortResult, Result } from "./fixture";

export const coverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("cloudflare");
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
    "sandbox.stop",
  ]);
  expect(payload.uncovered).toEqual([
    "ports.expose",
    "snapshots.create",
    "snapshots.restore",
  ]);
};

export const portCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("cloudflare");
  expect(payload.fixture).toBe("ports");
  expect(payload.features).toEqual([
    "capabilities",
    "process.spawnShell",
    "ports.expose",
    "preview.fetch",
    "process.kill",
    "sandbox.stop",
  ]);
  expect(payload.uncovered).toEqual([
    "files.list",
    "process.exec",
    "snapshots.create",
    "snapshots.restore",
  ]);
};

export const workflow = ({ body, response }: Result): void => {
  expect(response.ok).toBe(true);
  expect(body.error).toBeUndefined();
  expect(body.ok).toBe(true);
  expect(body.provider).toBe("cloudflare");
  expect(body.capabilities.files).toBe(true);
  expect(body.capabilities.processExec).toBe(true);
  expect(body.capabilities.processSpawn).toBe("separate");
  expect(body.capabilities.snapshotCreate).toBe(false);
  expect(body.file).toEqual({
    exists: true,
    listed: true,
    read: "hello from cloudflare",
    stream: "hello from cloudflare",
    text: "hello from cloudflare",
  });
  expect(body.inputs).toEqual({
    blob: "blob",
    buffer: "buffer",
    bytes: "bytes",
    stream: "stream",
  });
  expect(body.exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from cloudflare",
  });
  expect(body.shell).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from cloudflare",
  });
  expect(body.failure).toMatchObject({
    code: 7,
    ok: false,
  });
  expect(body.failure.stderr).toContain("failed");
  expect(body.spawn).toMatchObject({
    code: 0,
    ok: true,
  });
  expect(body.spawn.output).toContain("hello from cloudflare");
};

export const ports = ({ body, response }: PortResult): void => {
  expect(response.ok).toBe(true);
  expect(body.error).toBeUndefined();
  expect(body.ok).toBe(true);
  expect(body.provider).toBe("cloudflare");
  expect(body.capabilities.ports).toBe("dynamic");
  expect(body.port.port).toBe(8080);
  expect(body.port.url).toMatch(/^https:\/\//u);
  expect(body.response).toMatchObject({
    ok: true,
    status: 200,
  });
  expect(body.response.text).toContain("hello from cloudflare port");
};
