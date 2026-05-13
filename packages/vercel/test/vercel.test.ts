import { expect, mock, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

interface CommandInput {
  args: string[];
  cmd: string;
  cwd: string;
  detached?: boolean;
  env?: Record<string, string>;
}

interface FileInput {
  content: string | Uint8Array;
  path: string;
}

const calls: {
  create?: Record<string, unknown>;
  commands: CommandInput[];
  files: FileInput[];
  killed: boolean;
  stopped: boolean;
} = {
  commands: [],
  files: [],
  killed: false,
  stopped: false,
};

const commandOutput = (code: number, out: string, err: string) => ({
  exitCode: code,
  stderr: () => Promise.resolve(err),
  stdout: () => Promise.resolve(out),
});

const logs = async function* logs() {
  yield { data: "started", stream: "stdout" };
};

const commandHandle = () => ({
  cmdId: "command-1",
  kill: () => {
    calls.killed = true;
    return Promise.resolve();
  },
  logs,
  wait: () => Promise.resolve(commandOutput(0, "done", "")),
});

class Sandbox {
  static create(input: Record<string, unknown>) {
    calls.create = input;
    return Promise.resolve(new Sandbox());
  }

  static get(input: Record<string, unknown>) {
    calls.create = input;
    return Promise.resolve(new Sandbox());
  }

  readonly sandboxId = "vercel-1";

  readonly domain = (port: number) =>
    `https://${this.sandboxId}-${port}.vercel.dev`;

  readonly fs = {
    exists: (path: string) => Promise.resolve(path === "/workspace/file.txt"),
    mkdir: () => Promise.resolve(),
    readdir: () =>
      Promise.resolve([
        {
          isDirectory: () => false,
          name: "file.txt",
        },
      ]),
    rm: () => Promise.resolve(),
  };

  readonly readFileToBuffer = (input: { path: string }) =>
    Promise.resolve(
      input.path === "/workspace/missing.txt"
        ? null
        : Buffer.from(`hello from ${this.sandboxId}`)
    );

  readonly runCommand = (input: CommandInput) => {
    calls.commands.push(input);
    return Promise.resolve(
      input.detached
        ? commandHandle()
        : commandOutput(0, `hello from ${this.sandboxId}`, "")
    );
  };

  readonly snapshot = () =>
    Promise.resolve({ snapshotId: `${this.sandboxId}-snapshot` });

  readonly stop = () => {
    calls.stopped = this.sandboxId === "vercel-1";
    return Promise.resolve();
  };

  readonly writeFiles = (input: FileInput[]) => {
    if (this.sandboxId !== "") {
      calls.files.push(...input);
    }
    return Promise.resolve();
  };
}

mock.module("@vercel/sandbox", () => ({
  Sandbox,
}));

test("vercel maps sandbox operations without credentials", async () => {
  const { vercel } = await import("../src/index");
  const sandbox = await create({
    adapter: vercel({
      env: { BASE: "true" },
      ports: [3000],
      projectId: "project",
      teamId: "team",
      token: "token",
    }),
    cwd: "/workspace",
    env: { EXTRA: "true" },
    timeout: 1000,
  });

  await sandbox.files.write("/workspace/file.txt", "hello");
  const entries = await sandbox.files.list("/workspace");
  const exec = await sandbox.process.exec("echo", ["hello"], {
    env: { RUN: "true" },
  });
  const current = await sandbox.process.spawnShell("printf done");
  const streamed = await new Response(current.output).text();
  const result = await current.result;
  const preview = await sandbox.ports.expose(3000);
  const snapshot = await sandbox.snapshots.create();

  expect(calls.create).toMatchObject({
    env: { BASE: "true", EXTRA: "true" },
    ports: [3000],
    projectId: "project",
    teamId: "team",
    timeout: 1000,
    token: "token",
  });
  expect(sandbox.provider).toBe("vercel");
  expect(sandbox.capabilities.ports).toBe("create-time");
  expect(await sandbox.files.exists("/workspace/file.txt")).toBe(true);
  expect(await sandbox.files.text("/workspace/file.txt")).toBe(
    "hello from vercel-1"
  );
  expect(entries).toEqual([{ kind: "file", path: "/workspace/file.txt" }]);
  expect(calls.files).toEqual([
    { content: "hello", path: "/workspace/file.txt" },
  ]);
  expect(calls.commands[0]).toMatchObject({
    args: ["hello"],
    cmd: "echo",
    cwd: "/workspace",
    env: { RUN: "true" },
  });
  expect(exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from vercel-1",
  });
  expect(streamed).toBe("started");
  expect(result).toMatchObject({ code: 0, ok: true, stdout: "done" });
  expect(preview).toEqual({
    port: 3000,
    url: "https://vercel-1-3000.vercel.dev",
  });
  expect(snapshot).toEqual({ id: "vercel-1-snapshot" });
  await expect(sandbox.ports.expose(4000)).rejects.toMatchObject({
    code: "unsupported",
    provider: "vercel",
  });
  await expect(
    sandbox.files.text("/workspace/missing.txt")
  ).rejects.toMatchObject({
    code: "not_found",
    provider: "vercel",
  });
  try {
    await sandbox.snapshots.restore("snapshot-1");
  } catch (error) {
    expect(error).toMatchObject({
      code: "unsupported",
      provider: "vercel",
    });
  }

  await current.kill();
  await sandbox.stop();

  expect(calls.killed).toBe(true);
  expect(calls.stopped).toBe(true);
});
