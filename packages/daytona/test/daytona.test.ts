import { expect, mock, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

interface Client {
  create(
    params: Record<string, unknown>,
    settings?: Record<string, unknown>
  ): Promise<typeof raw>;
  get(id: string): Promise<typeof raw>;
}

interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

const calls: {
  command?: { line: string; options: CommandOptions };
  config?: Record<string, unknown>;
  create?: Record<string, unknown>;
  deleted: boolean;
  settings?: Record<string, unknown>;
  stopped: boolean;
  uploads: { input: Buffer; path: string }[];
} = {
  deleted: false,
  stopped: false,
  uploads: [],
};

class DaytonaNotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "DaytonaNotFoundError";
  }
}

const raw = {
  delete: () => {
    calls.deleted = true;
    return Promise.resolve();
  },
  fs: {
    createFolder: () => Promise.resolve(),
    deleteFile: () => Promise.resolve(),
    downloadFile: (path: string) =>
      Promise.resolve(Buffer.from(`text:${path}`)),
    getFileDetails: (path: string) => {
      if (path === "/workspace/missing.txt") {
        throw new DaytonaNotFoundError();
      }
      return Promise.resolve({});
    },
    listFiles: () =>
      Promise.resolve([
        {
          isDir: false,
          modTime: "2026-01-01T00:00:00.000Z",
          name: "file.txt",
          size: 5,
        },
        {
          isDir: true,
          modTime: "2026-01-01T00:00:00.000Z",
          name: "lib",
          size: 0,
        },
      ]),
    uploadFile: (input: Buffer, path: string) => {
      calls.uploads.push({ input, path });
      return Promise.resolve();
    },
  },
  getPreviewLink: (port: number) =>
    Promise.resolve({ url: `https://daytona-${port}.dev` }),
  getSignedPreviewUrl: (port: number) =>
    Promise.resolve({ url: `https://signed-daytona-${port}.dev` }),
  getWorkDir: () => Promise.resolve("/home/daytona"),
  id: "daytona-1",
  process: {
    executeCommand: (
      line: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number
    ) => {
      calls.command = { line, options: { cwd, env, timeout } };
      return Promise.resolve({
        exitCode: line.includes("fail") ? 7 : 0,
        result: `ran:${line}`,
      });
    },
  },
  stop: () => {
    calls.stopped = true;
    return Promise.resolve();
  },
};

const Daytona = function Daytona(this: Client, input: Record<string, unknown>) {
  calls.config = input;
  this.create = (
    params: Record<string, unknown>,
    settings?: Record<string, unknown>
  ) => {
    calls.create = params;
    calls.settings = settings;
    return Promise.resolve(raw);
  };
  this.get = (id: string) => {
    calls.create = { id };
    return Promise.resolve(raw);
  };
};

mock.module("@daytona/sdk", () => ({
  Daytona,
  DaytonaNotFoundError,
}));

test("daytona maps sandbox operations without credentials", async () => {
  const { daytona } = await import("../src/index");
  const sandbox = await create({
    adapter: daytona({
      apiKey: "key",
      deleteOnStop: true,
      env: { BASE: "true" },
      labels: { source: "test" },
      name: "sandbox-name",
      signedPreview: true,
      target: "target",
      timeout: 2000,
    }),
    cwd: "/workspace",
    env: { EXTRA: "true" },
    metadata: { run: "unit" },
  });

  await sandbox.files.write("/workspace/file.txt", "hello");
  const binary = await sandbox.files.read("/workspace/file.txt");
  const text = await sandbox.files.text("/workspace/file.txt");
  const entries = await sandbox.files.list("/workspace");
  const exec = await sandbox.process.exec("echo", ["hello"], {
    cwd: "/workspace",
    env: { RUN: "true" },
    timeout: 5000,
  });
  const preview = await sandbox.ports.expose(3000);

  expect(calls.config).toMatchObject({
    apiKey: "key",
    target: "target",
  });
  expect(calls.create).toMatchObject({
    envVars: { BASE: "true", EXTRA: "true" },
    labels: { run: "unit", source: "test" },
    name: "sandbox-name",
  });
  expect(calls.settings).toEqual({ timeout: 2 });
  expect(sandbox.provider).toBe("daytona");
  expect(sandbox.capabilities.snapshots).toBe(false);
  expect(await sandbox.files.exists("/workspace/file.txt")).toBe(true);
  expect(await sandbox.files.exists("/workspace/missing.txt")).toBe(false);
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
  expect(calls.uploads[0]).toMatchObject({
    path: "/workspace/file.txt",
  });
  expect(calls.command).toEqual({
    line: "echo hello",
    options: {
      cwd: "/workspace",
      env: { RUN: "true" },
      timeout: 5,
    },
  });
  expect(exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "ran:echo hello",
  });
  expect(preview).toEqual({
    port: 3000,
    url: "https://signed-daytona-3000.dev",
  });

  try {
    await sandbox.process.spawnShell("sleep 1");
  } catch (error) {
    expect(error).toMatchObject({
      code: "unsupported",
      provider: "daytona",
    });
  }

  try {
    await sandbox.snapshots.create();
  } catch (error) {
    expect(error).toMatchObject({
      code: "unsupported",
      provider: "daytona",
    });
  }

  await sandbox.stop();

  expect(calls.deleted).toBe(true);
  expect(calls.stopped).toBe(false);
});
