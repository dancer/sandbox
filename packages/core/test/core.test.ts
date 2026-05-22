import { expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  SandboxError,
  abort,
  bytes,
  capabilityMode,
  command,
  create,
  duration,
  fromSandboxRuntime,
  isSandboxError,
  port,
  rawCapabilityMode,
  requireRawCapability,
  requireCapability,
  result,
  sandboxError,
  supports,
  supportsRaw,
  timeout,
  unsupported,
  withSandbox,
} from "../src/index";
import type { Adapter, Options, Sandbox, SandboxRuntime } from "../src/index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

const readable = (value: string): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(encode(value));
      controller.close();
    },
  });

const sandbox = (capabilities: Sandbox["capabilities"]): Sandbox => ({
  capabilities,
  cwd: ".",
  files: {
    exists: () => Promise.resolve(false),
    list: () => Promise.resolve([]),
    mkdir: () => Promise.resolve(),
    read: () => Promise.resolve(new Uint8Array()),
    remove: () => Promise.resolve(),
    stream: () => Promise.resolve(new ReadableStream()),
    text: () => Promise.resolve(""),
    write: () => Promise.resolve(),
  },
  id: "test",
  ports: {
    expose: (value) =>
      Promise.resolve({ port: value, url: `http://localhost:${value}` }),
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
    snapshot: "snapshot",
  });

  expect(current.provider).toBe("test");
  expect(seen).toEqual({
    id: "sandbox",
    ports: [3000],
    snapshot: "snapshot",
  });
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

test("withSandbox preserves work and cleanup errors", async () => {
  const adapter: Adapter = {
    capabilities: {},
    create: () =>
      Promise.resolve({
        ...sandbox({}),
        stop: () => Promise.reject(new Error("cleanup failed")),
      }),
    provider: "test",
  };

  try {
    await withSandbox({ adapter }, () => {
      throw new Error("work failed");
    });
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toHaveLength(2);
    expect((error as AggregateError).errors[0]).toMatchObject({
      message: "work failed",
    });
    expect((error as AggregateError).errors[1]).toMatchObject({
      message: "cleanup failed",
    });
    return;
  }

  throw new Error("expected aggregate error");
});

test("fromSandboxRuntime lifts stream-first files", async () => {
  let written: { path: string; value: unknown } | undefined;
  const current = fromSandboxRuntime({
    ...sandbox({ files: true }),
    files: {
      exists: (path) => Promise.resolve(path === "/workspace/file.txt"),
      list: () =>
        Promise.resolve([{ kind: "file", path: "/workspace/file.txt" }]),
      mkdir: () => Promise.resolve(),
      read: () => Promise.resolve(readable("hello")),
      remove: () => Promise.resolve(),
      write: (path, value) => {
        written = { path, value };
        return Promise.resolve();
      },
    },
    process: {
      spawn: () => Promise.reject(new Error("not used")),
      spawnShell: () => Promise.reject(new Error("not used")),
    },
  } satisfies SandboxRuntime);

  expect(
    await new Response(await current.files.stream("/file.txt")).text()
  ).toBe("hello");
  expect(await current.files.read("/file.txt")).toEqual(encode("hello"));
  expect(await current.files.text("/file.txt")).toBe("hello");
  expect(await current.files.exists("/workspace/file.txt")).toBe(true);
  expect(await current.files.list()).toEqual([
    { kind: "file", path: "/workspace/file.txt" },
  ]);

  await current.files.write("/workspace/file.txt", "value");

  expect(written).toEqual({
    path: "/workspace/file.txt",
    value: "value",
  });
});

test("fromSandboxRuntime derives exec from spawn output", async () => {
  const seen: unknown[] = [];
  const running = (id: string, output: string) => ({
    id,
    kill: () => Promise.resolve(),
    output: readable(output),
    result: Promise.resolve(result(0)),
  });
  const current = fromSandboxRuntime({
    ...sandbox({ processExec: true, processSpawn: true }),
    files: {
      exists: () => Promise.reject(new Error("not used")),
      list: () => Promise.reject(new Error("not used")),
      mkdir: () => Promise.reject(new Error("not used")),
      read: () => Promise.reject(new Error("not used")),
      remove: () => Promise.reject(new Error("not used")),
      write: () => Promise.reject(new Error("not used")),
    },
    process: {
      spawn: (executable, args, options) => {
        seen.push({ args, command: executable, options });
        return Promise.resolve(running("exec", "exec output"));
      },
      spawnShell: (line, options) => {
        seen.push({ command: line, options });
        return Promise.resolve(running("shell", "shell output"));
      },
    },
  } satisfies SandboxRuntime);

  expect(
    await current.process.exec("bun", ["test"], { cwd: "/workspace" })
  ).toMatchObject({
    code: 0,
    ok: true,
    stdout: "exec output",
  });
  expect(await current.process.shell("echo ok")).toMatchObject({
    code: 0,
    ok: true,
    stdout: "shell output",
  });
  expect(seen).toEqual([
    { args: ["test"], command: "bun", options: { cwd: "/workspace" } },
    { command: "echo ok", options: undefined },
  ]);
});

test("fromSandboxRuntime preserves explicit stderr", async () => {
  const current = fromSandboxRuntime({
    ...sandbox({ processExec: true, processSpawn: true }),
    files: {
      exists: () => Promise.reject(new Error("not used")),
      list: () => Promise.reject(new Error("not used")),
      mkdir: () => Promise.reject(new Error("not used")),
      read: () => Promise.reject(new Error("not used")),
      remove: () => Promise.reject(new Error("not used")),
      write: () => Promise.reject(new Error("not used")),
    },
    process: {
      spawn: () =>
        Promise.resolve({
          id: "exec",
          kill: () => Promise.resolve(),
          output: readable("failure"),
          result: Promise.resolve(result(7, "", "failure")),
        }),
      spawnShell: () => Promise.reject(new Error("not used")),
    },
  } satisfies SandboxRuntime);

  expect(await current.process.exec("false")).toMatchObject({
    code: 7,
    ok: false,
    stderr: "failure",
    stdout: "",
  });
});

test("fromSandboxRuntime gates unsupported capabilities", async () => {
  const current = fromSandboxRuntime({
    ...sandbox({}),
    files: {
      exists: () => Promise.reject(new Error("not used")),
      list: () => Promise.reject(new Error("not used")),
      mkdir: () => Promise.reject(new Error("not used")),
      read: () => Promise.reject(new Error("not used")),
      remove: () => Promise.reject(new Error("not used")),
      write: () => Promise.reject(new Error("not used")),
    },
    process: {
      spawn: () => Promise.reject(new Error("not used")),
      spawnShell: () => Promise.reject(new Error("not used")),
    },
  } satisfies SandboxRuntime);

  await expect(current.files.text("/file.txt")).rejects.toMatchObject({
    code: "unsupported",
    provider: "test",
  });
  await expect(current.process.exec("echo")).rejects.toMatchObject({
    code: "unsupported",
    provider: "test",
  });
  await expect(current.ports.expose(3000)).rejects.toMatchObject({
    code: "unsupported",
    provider: "test",
  });
  await expect(current.snapshots.create()).rejects.toMatchObject({
    code: "unsupported",
    provider: "test",
  });
});

test("fromSandboxRuntime normalizes provider failures", async () => {
  const current = fromSandboxRuntime({
    ...sandbox({ files: true }),
    files: {
      exists: () => Promise.reject(new Error("missing")),
      list: () => Promise.reject(new Error("missing")),
      mkdir: () => Promise.reject(new Error("missing")),
      read: () => Promise.reject(new Error("missing")),
      remove: () => Promise.reject(new Error("missing")),
      write: () => Promise.reject(new Error("missing")),
    },
    process: {
      spawn: () => Promise.reject(new Error("not used")),
      spawnShell: () => Promise.reject(new Error("not used")),
    },
  } satisfies SandboxRuntime);

  await expect(current.files.text("/file.txt")).rejects.toMatchObject({
    code: "provider",
    message: "files.text failed",
    provider: "test",
  });
});

test("fromSandboxRuntime preserves ports snapshots raw and stop", async () => {
  let stopped = 0;
  const raw = { native: true };
  const current = fromSandboxRuntime({
    ...sandbox({
      ports: "dynamic",
      snapshotCreate: "filesystem",
      snapshotRestore: "filesystem",
    }),
    files: {
      exists: () => Promise.reject(new Error("not used")),
      list: () => Promise.reject(new Error("not used")),
      mkdir: () => Promise.reject(new Error("not used")),
      read: () => Promise.reject(new Error("not used")),
      remove: () => Promise.reject(new Error("not used")),
      write: () => Promise.reject(new Error("not used")),
    },
    ports: {
      expose: (value) =>
        Promise.resolve({ port: value, url: `https://port-${value}.test` }),
    },
    process: {
      spawn: () => Promise.reject(new Error("not used")),
      spawnShell: () => Promise.reject(new Error("not used")),
    },
    raw,
    snapshots: {
      create: (name) => Promise.resolve({ id: "snapshot", name }),
      restore: () => Promise.resolve(),
    },
    stop: () => {
      stopped += 1;
      return Promise.resolve();
    },
  } satisfies SandboxRuntime<typeof raw>);

  expect(current.raw).toBe(raw);
  expect(await current.ports.expose(3000)).toEqual({
    port: 3000,
    url: "https://port-3000.test",
  });
  expect(await current.snapshots.create("checkpoint")).toEqual({
    id: "snapshot",
    name: "checkpoint",
  });

  await current.snapshots.restore("snapshot");
  await current.stop();

  expect(stopped).toBe(1);
});

test("capability helpers handle boolean and mode capabilities", () => {
  const current = sandbox({
    files: true,
    ports: "create-time",
    processExec: true,
    processSpawn: false,
    raw: {
      backup: "configured",
      desktop: true,
      git: true,
      lifecycle: "dynamic",
      tunnels: "dynamic",
    },
    snapshotCreate: "disk",
    snapshotRestore: false,
    snapshotSource: "create-time",
    snapshots: false,
  });

  expect(supports(current, "files")).toBe(true);
  expect(capabilityMode(current, "files")).toBe(true);
  expect(supports(current, "ports")).toBe(true);
  expect(capabilityMode(current, "ports")).toBe("create-time");
  expect(requireCapability(current, "ports")).toBe("create-time");
  expect(supports(current, "processExec")).toBe(true);
  expect(supports(current, "processSpawn")).toBe(false);
  expect(supports(current, "snapshotCreate")).toBe(true);
  expect(supports(current, "snapshotRestore")).toBe(false);
  expect(supports(current, "snapshotSource")).toBe(true);
  expect(supports(current, "snapshots")).toBe(false);
  expect(supportsRaw(current, "desktop")).toBe(true);
  expect(rawCapabilityMode(current, "desktop")).toBe(true);
  expect(requireRawCapability(current, "desktop")).toBe(true);
  expect(supportsRaw(current, "git")).toBe(true);
  expect(supportsRaw(current, "backup")).toBe(true);
  expect(rawCapabilityMode(current, "backup")).toBe("configured");
  expect(rawCapabilityMode(current, "lifecycle")).toBe("dynamic");
  expect(rawCapabilityMode(current, "tunnels")).toBe("dynamic");
  expect(supportsRaw(current, "pty")).toBe(false);
  expect(() => requireRawCapability(current, "pty")).toThrow(SandboxError);
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

test("abort throws a typed sandbox error", () => {
  expect(() => abort("test")).toThrow(SandboxError);

  try {
    abort("test", "stopped");
  } catch (error) {
    expect(error).toBeInstanceOf(SandboxError);
    expect((error as SandboxError).code).toBe("aborted");
    expect((error as SandboxError).provider).toBe("test");
    expect((error as Error).cause).toBe("stopped");
  }
});

test("sandboxError creates typed sandbox errors", () => {
  const current = sandboxError("test", "Failed", "provider", "cause");

  expect(current).toBeInstanceOf(SandboxError);
  expect(current.code).toBe("provider");
  expect(current.provider).toBe("test");
  expect(current.cause).toBe("cause");
});

test("isSandboxError narrows sandbox errors", () => {
  const error = new SandboxError("Failed", {
    code: "provider",
    provider: "test",
  });

  expect(isSandboxError(error)).toBe(true);
  expect(isSandboxError(new Error("Failed"))).toBe(false);
});

test("port validates normalized preview ports", () => {
  expect(port(1)).toBe(1);
  expect(port(65_535, "test")).toBe(65_535);

  for (const value of [0, 65_536, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => port(value, "test")).toThrow(SandboxError);
    try {
      port(value, "test");
    } catch (error) {
      expect(error).toMatchObject({
        code: "configuration",
        message: "Port must be an integer from 1 to 65535",
        provider: "test",
      });
    }
  }
});

test("duration validates normalized millisecond values", () => {
  expect(duration()).toBeUndefined();
  expect(duration(0, "test")).toBe(0);
  expect(duration(30_000, "test")).toBe(30_000);

  for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => duration(value, "test")).toThrow(SandboxError);
    try {
      duration(value, "test");
    } catch (error) {
      expect(error).toMatchObject({
        code: "configuration",
        message: "timeout must be a non-negative integer",
        provider: "test",
      });
    }
  }
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

test("timeout rejects invalid duration values", () => {
  expect(() => timeout(-1, undefined, "test")).toThrow(SandboxError);
  try {
    timeout(-1, undefined, "test");
  } catch (error) {
    expect(error).toMatchObject({
      code: "configuration",
      message: "timeout must be a non-negative integer",
      provider: "test",
    });
  }
});
