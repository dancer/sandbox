import { expect } from "bun:test";

import type { Coverage, PortResult, Result, TunnelResult } from "./fixture";
import { portsCoverage, tunnelsCoverage, workflowCoverage } from "./fixture";

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

export const tunnelCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("cloudflare");
  expect(payload.fixture).toBe("tunnels");
  expect(payload.features).toEqual(tunnelsCoverage.features);
  expect(payload.uncovered).toEqual(tunnelsCoverage.uncovered);
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
    pty: true,
    tunnels: "dynamic",
    watching: true,
  });
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
  expect(body.commands).toEqual({
    create: "create-env",
    exec: "exec-env",
    shell: "shell-env",
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

export const tunnels = ({ body, response }: TunnelResult): void => {
  expect(response.ok).toBe(true);
  expect(body.error).toBeUndefined();
  expect(body.ok).toBe(true);
  expect(body.provider).toBe("cloudflare");
  expect(body.capabilities.raw).toMatchObject({
    pty: true,
    tunnels: "dynamic",
    watching: true,
  });
  expect(body.tunnel.port).toBe(8080);
  expect(body.tunnel.url).toMatch(/^https:\/\/.+\.trycloudflare\.com$/u);
  expect(body.tunnel.hostname).toMatch(/^[a-z0-9-]+\.trycloudflare\.com$/u);
};
