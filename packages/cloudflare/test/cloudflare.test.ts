import { expect, mock, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

interface PortOptions {
  hostname: string;
  name?: string;
}

const calls: {
  destroyed: boolean;
  env?: Record<string, string>;
  exec?: { line: string; options: ExecOptions };
  exposed?: { port: number; options: PortOptions };
  killed: boolean;
  started?: { line: string; options: ExecOptions };
  writes: { input: unknown; path: string }[];
} = {
  destroyed: false,
  killed: false,
  writes: [],
};

const logs = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("started"));
    controller.close();
  },
});

const raw = {
  deleteFile: () => Promise.resolve(),
  destroy: () => {
    calls.destroyed = true;
    return Promise.resolve();
  },
  exec: (line: string, options: ExecOptions = {}) => {
    calls.exec = { line, options };
    return Promise.resolve({
      exitCode: line.includes("fail") ? 7 : 0,
      stderr: "",
      stdout: `ran:${line}`,
    });
  },
  exists: (path: string) =>
    Promise.resolve({ exists: path === "/workspace/file.txt" }),
  exposePort: (port: number, options: PortOptions) => {
    calls.exposed = { options, port };
    return Promise.resolve({ url: `https://${options.hostname}/${port}` });
  },
  getProcessLogs: () =>
    Promise.resolve({
      stderr: "",
      stdout: "done",
    }),
  listFiles: () =>
    Promise.resolve({
      files: [
        {
          absolutePath: "/workspace/file.txt",
          modifiedAt: "2026-01-01T00:00:00.000Z",
          size: 5,
          type: "file",
        },
        {
          absolutePath: "/workspace/lib",
          modifiedAt: "2026-01-01T00:00:00.000Z",
          size: 0,
          type: "directory",
        },
      ],
    }),
  mkdir: () => Promise.resolve(),
  readFile: (path: string, options: { encoding: string }) =>
    Promise.resolve({
      content:
        options.encoding === "base64"
          ? Buffer.from(`text:${path}`).toString("base64")
          : `text:${path}`,
    }),
  setEnvVars: (env: Record<string, string>) => {
    calls.env = env;
    return Promise.resolve();
  },
  startProcess: (line: string, options: ExecOptions = {}) => {
    calls.started = { line, options };
    return Promise.resolve({
      id: "process-1",
      kill: () => {
        calls.killed = true;
        return Promise.resolve();
      },
      waitForExit: () => Promise.resolve({ exitCode: 0 }),
    });
  },
  streamProcessLogs: () => Promise.resolve(logs),
  writeFile: (path: string, input: unknown) => {
    calls.writes.push({ input, path });
    return Promise.resolve();
  },
};

const getSandbox = (
  binding: unknown,
  id: string,
  options: Record<string, unknown>
) => {
  expect(binding).toEqual({});
  expect(id).toBe("cloudflare-1");
  expect(options).toEqual({ normalizeId: true });
  return raw;
};

mock.module("@cloudflare/sandbox", () => ({
  Sandbox: {},
  getSandbox,
}));

test("cloudflare maps worker sandbox operations without credentials", async () => {
  const { cloudflare } = await import("../src/index");
  const sandbox = await create({
    adapter: cloudflare({
      binding: {} as never,
      env: { BASE: "true" },
      hostname: "preview.dev",
      id: "cloudflare-1",
      name: "sandbox",
      timeout: 1000,
    }),
    cwd: "/workspace",
    env: { EXTRA: "true" },
  });

  await sandbox.files.write("/workspace/file.txt", "hello");
  const binary = await sandbox.files.read("/workspace/file.txt");
  const text = await sandbox.files.text("/workspace/file.txt");
  const entries = await sandbox.files.list("/workspace");
  const exec = await sandbox.process.exec("echo", ["hello"], {
    cwd: "/workspace",
    env: { RUN: "true" },
    timeout: 500,
  });
  const current = await sandbox.process.spawnShell("sleep 1", {
    cwd: "/workspace",
  });
  const streamed = await new Response(current.output).text();
  const result = await current.result;
  const preview = await sandbox.ports.expose(3000);

  expect(calls.env).toEqual({ BASE: "true", EXTRA: "true" });
  expect(sandbox.provider).toBe("cloudflare");
  expect(sandbox.capabilities.volumes).toBe("volume");
  expect(await sandbox.files.exists("/workspace/file.txt")).toBe(true);
  expect(binary).toEqual(new TextEncoder().encode("text:/workspace/file.txt"));
  expect(text).toBe("text:/workspace/file.txt");
  expect(entries).toEqual([
    {
      kind: "file",
      modified: new Date("2026-01-01T00:00:00.000Z"),
      path: "/workspace/file.txt",
      size: 5,
    },
    {
      kind: "directory",
      modified: new Date("2026-01-01T00:00:00.000Z"),
      path: "/workspace/lib",
      size: 0,
    },
  ]);
  expect(calls.writes[0]).toMatchObject({ path: "/workspace/file.txt" });
  expect(calls.exec).toEqual({
    line: "echo hello",
    options: {
      cwd: "/workspace",
      env: { RUN: "true" },
      timeout: 500,
    },
  });
  expect(exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "ran:echo hello",
  });
  expect(calls.started).toEqual({
    line: "sleep 1",
    options: {
      cwd: "/workspace",
    },
  });
  expect(streamed).toBe("started");
  expect(result).toMatchObject({
    code: 0,
    ok: true,
    stdout: "done",
  });
  expect(preview).toEqual({
    port: 3000,
    url: "https://preview.dev/3000",
  });
  expect(calls.exposed).toEqual({
    options: { hostname: "preview.dev", name: "sandbox" },
    port: 3000,
  });

  const isolated = await create({
    adapter: cloudflare({
      binding: {} as never,
      id: "cloudflare-1",
    }),
  });
  await expect(isolated.ports.expose(3000)).rejects.toMatchObject({
    code: "unsupported",
    provider: "cloudflare",
  });

  try {
    await sandbox.snapshots.create();
  } catch (error) {
    expect(error).toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
  }

  await current.kill();
  await sandbox.stop();
  await isolated.stop();

  expect(calls.killed).toBe(true);
  expect(calls.destroyed).toBe(true);
});
