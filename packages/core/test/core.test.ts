import { expect, test } from "bun:test";

import {
  SandboxError,
  create,
  isSandboxError,
  supports,
  unsupported,
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
