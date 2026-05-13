import { expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  SandboxError,
  bytes,
  command,
  create,
  isSandboxError,
  result,
  supports,
  timeout,
  unsupported,
  withSandbox,
} from "../src/index";
import type { Adapter, Options, Sandbox } from "../src/index";

const sandbox = (capabilities: Sandbox["capabilities"]): Sandbox => ({
  capabilities,
  cwd: ".",
  files: {
    exists: () => Promise.resolve(false),
    list: () => Promise.resolve([]),
    mkdir: () => Promise.resolve(),
    read: () => Promise.resolve(new Uint8Array()),
    remove: () => Promise.resolve(),
    text: () => Promise.resolve(""),
    write: () => Promise.resolve(),
  },
  id: "test",
  ports: {
    expose: (port) =>
      Promise.resolve({ port, url: `http://localhost:${port}` }),
  },
  process: {
    exec: () =>
      Promise.resolve({
        code: 0,
        ok: true,
        stderr: "",
        stdout: "",
      }),
    shell: () =>
      Promise.resolve({
        code: 0,
        ok: true,
        stderr: "",
        stdout: "",
      }),
    spawn: () =>
      Promise.resolve({
        id: "process",
        kill: () => Promise.resolve(),
        output: new ReadableStream(),
        result: Promise.resolve({
          code: 0,
          ok: true,
          stderr: "",
          stdout: "",
        }),
      }),
    spawnShell: () =>
      Promise.resolve({
        id: "process",
        kill: () => Promise.resolve(),
        output: new ReadableStream(),
        result: Promise.resolve({
          code: 0,
          ok: true,
          stderr: "",
          stdout: "",
        }),
      }),
  },
  provider: "test",
  raw: undefined,
  snapshots: {
    create: () => Promise.resolve({ id: "snapshot" }),
    restore: () => Promise.resolve(),
  },
  stop: () => Promise.resolve(),
});

test("create delegates without passing the adapter option", async () => {
  let seen: Options | undefined;
  const adapter: Adapter = {
    capabilities: { ports: "dynamic" },
    create: (options) => {
      seen = options;
      return Promise.resolve(sandbox(adapter.capabilities));
    },
    provider: "test",
  };

  const current = await create({
    adapter,
    id: "sandbox",
    ports: [3000],
  });

  expect(current.provider).toBe("test");
  expect(seen).toEqual({ id: "sandbox", ports: [3000] });
});

test("withSandbox stops after returning a value", async () => {
  let stopped = 0;
  const adapter: Adapter = {
    capabilities: {},
    create: () =>
      Promise.resolve({
        ...sandbox({}),
        stop: () => {
          stopped += 1;
          return Promise.resolve();
        },
      }),
    provider: "test",
  };

  const value = await withSandbox({ adapter }, (current) => current.id);

  expect(value).toBe("test");
  expect(stopped).toBe(1);
});

test("withSandbox stops after errors", async () => {
  let stopped = 0;
  const adapter: Adapter = {
    capabilities: {},
    create: () =>
      Promise.resolve({
        ...sandbox({}),
        stop: () => {
          stopped += 1;
          return Promise.resolve();
        },
      }),
    provider: "test",
  };

  await expect(
    withSandbox({ adapter }, () => {
      throw new Error("failed");
    })
  ).rejects.toThrow("failed");
  expect(stopped).toBe(1);
});

test("supports handles boolean and mode capabilities", () => {
  const current = sandbox({
    files: true,
    ports: "create-time",
    snapshots: false,
  });

  expect(supports(current, "files")).toBe(true);
  expect(supports(current, "ports")).toBe(true);
  expect(supports(current, "snapshots")).toBe(false);
  expect(supports(current, "desktop")).toBe(false);
});

test("unsupported throws a typed sandbox error", () => {
  expect(() => unsupported("test", "ports")).toThrow(SandboxError);

  try {
    unsupported("test", "ports");
  } catch (error) {
    expect(error).toBeInstanceOf(SandboxError);
    expect((error as SandboxError).code).toBe("unsupported");
    expect((error as SandboxError).provider).toBe("test");
  }
});

test("isSandboxError narrows sandbox errors", () => {
  const error = new SandboxError("Failed", {
    code: "provider",
    provider: "test",
  });

  expect(isSandboxError(error)).toBe(true);
  expect(isSandboxError(new Error("Failed"))).toBe(false);
});

test("bytes normalizes supported input shapes", async () => {
  expect(await bytes("hello")).toBe("hello");
  expect(await bytes(new Uint8Array([1, 2, 3]))).toEqual(
    new Uint8Array([1, 2, 3])
  );
  expect(await bytes(new Blob(["hello"]))).toEqual(
    new TextEncoder().encode("hello")
  );
  expect(
    await bytes(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3]));
          controller.close();
        },
      })
    )
  ).toEqual(new Uint8Array([1, 2, 3]));
});

test("command quotes shell arguments safely", () => {
  expect(command("echo", ["hello", "two words", "it's ok"])).toBe(
    "echo hello 'two words' 'it'\\''s ok'"
  );
});

test("result normalizes command status", () => {
  expect(result(0, "out", "err")).toEqual({
    code: 0,
    ok: true,
    stderr: "err",
    stdout: "out",
  });
  expect(result(7, "", "", "SIGTERM")).toEqual({
    code: 7,
    ok: false,
    signal: "SIGTERM",
    stderr: "",
    stdout: "",
  });
});

test("timeout exposes an abort signal and clear hook", async () => {
  const deadline = timeout(1);

  await delay(5);

  expect(deadline.signal?.aborted).toBe(true);
  expect(deadline.aborted()).toBe(true);
  deadline.clear();
});
