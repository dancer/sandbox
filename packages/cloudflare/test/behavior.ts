import { expect } from "bun:test";

import type { Coverage, PortResult, RawResult, Result } from "./fixture";
import { portsCoverage, rawCoverage, workflowCoverage } from "./fixture";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const coverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("cloudflare");
  expect(payload.fixture).toBe("workflow");
  expect(payload.features).toEqual(workflowCoverage.features);
  expect(payload.uncovered).toEqual(workflowCoverage.uncovered);
};

export const portCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("cloudflare");
  expect(payload.fixture).toBe("ports");
  expect(payload.features).toEqual(portsCoverage.features);
  expect(payload.uncovered).toEqual(portsCoverage.uncovered);
};

export const rawCoverageCheck = (payload: Coverage): void => {
  expect(payload.provider).toBe("cloudflare");
  expect(payload.fixture).toBe("raw");
  expect(payload.features).toEqual(rawCoverage.features);
  expect(payload.uncovered).toEqual(rawCoverage.uncovered);
};

export const workflow = ({ body, response }: Result): void => {
  expect(response.ok).toBe(true);
  expect(body.error).toBeUndefined();
  expect(body.ok).toBe(true);
  expect(body.provider).toBe("cloudflare");
  expect(body.capabilities.files).toBe(true);
  expect(body.capabilities.processExec).toBe(true);
  expect(body.capabilities.processSpawn).toBe("separate");
  expect(body.capabilities.raw).toMatchObject({
    lifecycle: "dynamic",
    network: "configured",
    pty: true,
  });
  expect(body.capabilities.raw).not.toHaveProperty("sessions");
  expect(body.capabilities.snapshotCreate).toBe("filesystem");
  expect(body.capabilities.snapshotDelete).toBe(false);
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
  expect(body.commands).toEqual({
    create: "create-env",
    exec: "exec-env",
    shell: "shell-env",
  });
  expect(body.sessionless).toBe(true);
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
  expect(body.spawn.stdoutStream).toContain("hello from cloudflare");
  expect(body.spawn.stderrStream).toBe("");
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

export const raw = ({ body, response }: RawResult): void => {
  expect(response.ok).toBe(true);
  expect(body.error).toBeUndefined();
  expect(body.ok).toBe(true);
  expect(body.provider).toBe("cloudflare");
  const capabilities = body.capabilities.raw;
  if (
    !record(capabilities) ||
    capabilities.lifecycle !== "dynamic" ||
    body.raw.exec !== true
  ) {
    throw new Error(
      "deployed cloudflare verifier is not using Cloudflare 1.0. redeploy apps/cloudflare before live verification"
    );
  }
  expect(body.capabilities.raw).toEqual({
    lifecycle: "dynamic",
    network: "configured",
    pty: true,
  });
  expect(body.result).toBe("3");
  expect(body.raw).toEqual({
    exec: true,
    network: true,
    ports: true,
    snapshots: true,
  });
};
