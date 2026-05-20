import { expect, test } from "bun:test";

type Command = Readonly<{
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}>;

type Payload = Readonly<{
  capabilities: Record<string, unknown>;
  error?: string;
  exec: Command;
  failure: Command;
  file: Readonly<{
    exists: boolean;
    listed: boolean;
    text: string;
  }>;
  ok: boolean;
  provider: string;
  shell: Command;
  spawn: Command & Readonly<{ output: string }>;
}>;

const worker = process.env.CLOUDFLARE_SANDBOX_WORKER_URL;
const token = process.env.CLOUDFLARE_SANDBOX_TOKEN;
const live = worker && token ? test : test.skip;
const endpoint = new URL("/sandbox-sdk/live", worker ?? "http://localhost");
const headers = { authorization: `Bearer ${token}` };

live("cloudflare runs a live sandbox workflow", async () => {
  const response = await fetch(endpoint, {
    headers,
    method: "POST",
  });
  const body = (await response.json()) as Payload;

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
});
