import { expect, mock, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

interface RunOptions {
  background?: boolean;
  cwd?: string;
  envs?: Record<string, string>;
  onStderr?: (chunk: string) => void;
  onStdout?: (chunk: string) => void;
  timeoutMs?: number;
}

interface WriteOptions {
  user?: string;
}

const calls: {
  create?: Record<string, unknown>;
  killed: boolean;
  runs: { line: string; options: RunOptions }[];
  writes: {
    input: ArrayBuffer | string;
    options: WriteOptions;
    path: string;
  }[];
} = {
  killed: false,
  runs: [],
  writes: [],
};

class CommandExitError extends Error {
  readonly exitCode: number;

  readonly stderr: string;

  readonly stdout: string;

  constructor(exitCode: number, stdout: string, stderr: string) {
    super("Command failed");
    this.name = "CommandExitError";
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

const handle = {
  kill: () => {
    calls.killed = true;
    return Promise.resolve();
  },
  pid: 123,
  wait: () =>
    Promise.resolve({
      exitCode: 0,
      stderr: "",
      stdout: "background done",
    }),
};

const files = {
  exists: (path: string) => Promise.resolve(path === "/workspace/file.txt"),
  list: () =>
    Promise.resolve([
      {
        modifiedTime: new Date("2026-01-01T00:00:00.000Z"),
        path: "/workspace/file.txt",
        size: 5,
        type: "file",
      },
      {
        path: "/workspace/lib",
        size: 0,
        type: "dir",
      },
    ]),
  makeDir: () => Promise.resolve(),
  read: (path: string, options: { format: string }) =>
    Promise.resolve(
      options.format === "text"
        ? `text:${path}`
        : new Uint8Array([104, 101, 108, 108, 111])
    ),
  remove: () => Promise.resolve(),
  write: (path: string, input: ArrayBuffer | string, options: WriteOptions) => {
    calls.writes.push({ input, options, path });
    return Promise.resolve();
  },
};

const commands = {
  run: (line: string, options: RunOptions = {}) => {
    calls.runs.push({ line, options });
    if (options.background) {
      options.onStdout?.("started");
      return Promise.resolve(handle);
    }
    if (line.includes("fail")) {
      throw new CommandExitError(7, "", "failed");
    }
    return Promise.resolve({
      exitCode: 0,
      stderr: "",
      stdout: `ran:${line}`,
    });
  },
};

const raw = {
  commands,
  createSnapshot: () => Promise.resolve({ snapshotId: "snapshot-1" }),
  files,
  getHost: (port: number) => `sandbox-${port}.e2b.dev`,
  kill: () => {
    calls.killed = true;
    return Promise.resolve();
  },
  sandboxId: "e2b-1",
};

const Sandbox = {
  connect: (id: string, options: Record<string, unknown>) => {
    calls.create = { id, ...options };
    return Promise.resolve(raw);
  },
  create: (input: Record<string, unknown>) => {
    calls.create = input;
    return Promise.resolve(raw);
  },
};

mock.module("e2b", () => ({
  CommandExitError,
  FileType: {
    DIR: "dir",
  },
  Sandbox,
}));

test("e2b maps sandbox operations without credentials", async () => {
  const { e2b } = await import("../src/index");
  const sandbox = await create({
    adapter: e2b({
      apiKey: "key",
      env: { BASE: "true" },
      metadata: { source: "test" },
      template: "template",
      timeout: 1000,
      user: "user",
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
    timeout: 500,
  });
  const failed = await sandbox.process.shell("fail");
  const current = await sandbox.process.spawnShell("sleep 1");
  const streamed = await new Response(current.output).text();
  const result = await current.result;
  const preview = await sandbox.ports.expose(3000);
  const snapshot = await sandbox.snapshots.create();

  expect(calls.create).toMatchObject({
    apiKey: "key",
    envs: { BASE: "true", EXTRA: "true" },
    metadata: { run: "unit", source: "test" },
    template: "template",
    timeoutMs: 1000,
  });
  expect(sandbox.provider).toBe("e2b");
  expect(sandbox.capabilities.streaming).toBe("combined");
  expect(await sandbox.files.exists("/workspace/file.txt")).toBe(true);
  expect(binary).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
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
      path: "/workspace/lib",
      size: 0,
    },
  ]);
  expect(calls.writes).toHaveLength(1);
  expect(calls.writes[0]?.options).toEqual({ user: "user" });
  expect(calls.runs[0]).toMatchObject({
    line: "echo hello",
    options: {
      cwd: "/workspace",
      envs: { RUN: "true" },
      timeoutMs: 500,
      user: "user",
    },
  });
  expect(exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "ran:echo hello",
  });
  expect(failed).toMatchObject({
    code: 7,
    ok: false,
    stderr: "failed",
  });
  expect(streamed).toBe("started");
  expect(result).toMatchObject({
    code: 0,
    ok: true,
    stdout: "background done",
  });
  expect(preview).toEqual({
    port: 3000,
    url: "https://sandbox-3000.e2b.dev",
  });
  expect(snapshot).toEqual({ id: "snapshot-1" });

  try {
    await sandbox.snapshots.restore("snapshot-1");
  } catch (error) {
    expect(error).toMatchObject({
      code: "unsupported",
      provider: "e2b",
    });
  }

  await current.kill();
  await sandbox.stop();

  expect(calls.killed).toBe(true);
});
