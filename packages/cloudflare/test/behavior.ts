import { expect } from "bun:test";

import type { Coverage, Result } from "./fixture";

export const coverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("cloudflare");
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
    "sandbox.stop",
  ]);
  expect(payload.uncovered).toEqual([
    "ports.expose",
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
    text: "hello from cloudflare",
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
