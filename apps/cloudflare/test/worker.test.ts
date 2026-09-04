import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import type { Sandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

import type { Env } from "../src/shared";

void mock.module("@cloudflare/sandbox", () => ({ Sandbox: mock() }));

const shared = await import("../src/shared");
const { default: worker } = await import("../src/index");
const env: Env = {
  SANDBOX_SDK_TOKEN: "test-token",
  Sandbox: {} as Env["Sandbox"],
};
let sandbox: Sandbox;
let dispose: () => Promise<void>;

beforeEach(async () => {
  sandbox = await create({ adapter: local(), cwd: "/workspace" });
  dispose = sandbox.stop;
  spyOn(shared, "instance").mockImplementation(() =>
    Promise.resolve({
      ...sandbox,
      raw: {} as Awaited<ReturnType<typeof shared.instance>>["raw"],
    })
  );
});

afterEach(async () => {
  mock.restore();
  await dispose();
});

const request = (): Promise<Response> | Response =>
  worker.fetch(
    new Request("https://verify.example/sandbox-sdk/ports", {
      headers: { authorization: "Bearer test-token" },
      method: "POST",
    }),
    env
  );

test("failed tunnel setup stops the verifier sandbox", async () => {
  const stop = spyOn(sandbox, "stop");
  spyOn(sandbox.files, "write").mockRejectedValue(new Error("write failed"));

  const response = await request();

  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({
    error: "write failed",
    ok: false,
  });
  expect(stop).toHaveBeenCalledTimes(1);
});

test("cleanup failure preserves the original tunnel setup error", async () => {
  const stop = spyOn(sandbox, "stop").mockRejectedValue(
    new Error("stop failed")
  );
  spyOn(sandbox.files, "write").mockRejectedValue(new Error("write failed"));

  const response = await request();

  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({
    error: "write failed",
    ok: false,
  });
  expect(stop).toHaveBeenCalledTimes(1);
});

test("successful tunnel setup remains alive for the client probe", async () => {
  const stop = spyOn(sandbox, "stop");
  spyOn(sandbox.files, "write").mockResolvedValue();
  spyOn(sandbox.process, "spawnShell").mockImplementation(() =>
    sandbox.process.spawn(process.execPath, ["-e", ""])
  );
  spyOn(sandbox.process, "exec").mockResolvedValue({
    code: 0,
    ok: true,
    stderr: "",
    stdout: "hello from cloudflare port",
  });
  spyOn(sandbox.ports, "expose").mockResolvedValue({
    port: 8080,
    request: () => Promise.resolve(new Response("hello from cloudflare port")),
    url: "https://sandbox.example",
  });

  const response = await request();

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true });
  expect(stop).not.toHaveBeenCalled();
});

test.each([
  "{",
  "null",
  "[]",
  '"sandbox"',
  "{}",
  '{"id":42}',
  '{"id":""}',
  '{"id":"   "}',
])(
  "cleanup rejects invalid input without creating a sandbox: %s",
  async (body) => {
    const response = await worker.fetch(
      new Request("https://verify.example/sandbox-sdk/cleanup", {
        body,
        headers: { authorization: "Bearer test-token" },
        method: "POST",
      }),
      env
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "missing_id", ok: false });
    expect(shared.instance).not.toHaveBeenCalled();
  }
);

test("cleanup stops the requested verifier sandbox", async () => {
  const stop = spyOn(sandbox, "stop");
  const response = await worker.fetch(
    new Request("https://verify.example/sandbox-sdk/cleanup", {
      body: JSON.stringify({ id: "sandbox" }),
      headers: { authorization: "Bearer test-token" },
      method: "POST",
    }),
    env
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(shared.instance).toHaveBeenCalledWith(env, "/workspace", "sandbox");
  expect(stop).toHaveBeenCalledTimes(1);
});
