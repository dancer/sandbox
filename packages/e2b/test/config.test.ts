import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import { Sandbox as E2BSandbox } from "e2b";

import { e2b } from "../src/index";

const restore = (name: string, value: string | undefined): void => {
  process.env[name] = value ?? "";
};

test("e2b reports missing credentials before provider calls", async () => {
  const apiKey = process.env.E2B_API_KEY;
  const accessToken = process.env.E2B_ACCESS_TOKEN;
  process.env.E2B_API_KEY = "";
  process.env.E2B_ACCESS_TOKEN = "";

  try {
    await expect(create({ adapter: e2b() })).rejects.toMatchObject({
      code: "configuration",
      message:
        "E2B credentials missing. Set E2B_API_KEY or E2B_ACCESS_TOKEN, or pass apiKey or accessToken to e2b().",
      provider: "e2b",
    });
  } finally {
    restore("E2B_API_KEY", apiKey);
    restore("E2B_ACCESS_TOKEN", accessToken);
  }
});

test("e2b rejects invalid request timeouts before provider calls", async () => {
  const original = E2BSandbox.create;
  let called = false;

  E2BSandbox.create = (() => {
    called = true;
    return Promise.reject(new Error("provider called"));
  }) as typeof E2BSandbox.create;

  try {
    await expect(
      create({
        adapter: e2b({
          apiKey: "key",
          requestTimeout: -1,
        }),
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "e2b",
    });
    expect(called).toBe(false);
  } finally {
    E2BSandbox.create = original;
  }
});

test("e2b maps create and command options without running a real provider", async () => {
  const original = E2BSandbox.create;
  let commandSeen: unknown;
  let createSeen: unknown;
  let mkdirSeen: unknown;
  let snapshotSeen: unknown;
  let snapshotted = false;
  const raw = {
    commands: {
      run: (line: string, options: unknown) => {
        commandSeen = { line, options };
        return Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        });
      },
    },
    createSnapshot: (options?: unknown) => {
      snapshotSeen = options;
      snapshotted = true;
      return Promise.resolve({ snapshotId: "snapshot-id" });
    },
    files: {
      makeDir: (path: string, options: unknown) => {
        mkdirSeen = { options, path };
        return Promise.resolve();
      },
      stream: () => Promise.resolve(new ReadableStream()),
    },
    kill: () => Promise.resolve(),
    sandboxId: "sandbox",
  } as unknown as E2BSandbox;

  E2BSandbox.create = ((input?: unknown) => {
    createSeen = input;
    return Promise.resolve(raw);
  }) as typeof E2BSandbox.create;

  try {
    const sandbox = await create({
      adapter: e2b({
        allowInternetAccess: true,
        apiKey: "key",
        env: { A: "1" },
        headers: { header: "value" },
        lifecycle: { autoResume: true, onTimeout: "pause" },
        mcp: {
          filesystem: {
            args: ["/work"],
            command: "npx",
          },
        },
        metadata: { owner: "sdk" },
        network: {
          allowOut: ["registry.npmjs.org"],
          denyOut: ["0.0.0.0/0"],
        },
        requestTimeout: 123,
        template: "option-template",
        timeout: 456,
        user: "runner",
        volumeMounts: {
          "/data": "cache-volume",
        },
      }),
      cwd: "/work",
      env: { B: "2" },
      metadata: { task: "test" },
      snapshot: "snapshot",
      timeout: 789,
    });

    expect(sandbox.id).toBe("sandbox");
    expect(sandbox.cwd).toBe("/work");
    expect(createSeen).toMatchObject({
      allowInternetAccess: true,
      apiKey: "key",
      envs: { A: "1", B: "2" },
      headers: { header: "value" },
      lifecycle: { autoResume: true, onTimeout: "pause" },
      mcp: {
        filesystem: {
          args: ["/work"],
          command: "npx",
        },
      },
      metadata: { owner: "sdk", task: "test" },
      network: {
        allowOut: ["registry.npmjs.org"],
        denyOut: ["0.0.0.0/0"],
      },
      requestTimeoutMs: 123,
      template: "snapshot",
      timeoutMs: 789,
      volumeMounts: {
        "/data": "cache-volume",
      },
    });
    expect(mkdirSeen).toEqual({
      options: { user: "runner" },
      path: "/work",
    });
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "e2b",
    });
    await expect(
      sandbox.process.exec("echo", ["hello world"], {
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "e2b",
    });
    expect(commandSeen).toBeUndefined();

    await expect(
      sandbox.process.exec("echo", ["hello world"], {
        cwd: "/tmp",
        env: { C: "3" },
        timeout: 321,
      })
    ).resolves.toMatchObject({
      code: 0,
      ok: true,
      stdout: "ok",
    });
    expect(commandSeen).toEqual({
      line: "echo 'hello world'",
      options: {
        cwd: "/tmp",
        envs: { C: "3" },
        timeoutMs: 321,
        user: "runner",
      },
    });

    await expect(sandbox.snapshots.create("ready")).resolves.toEqual({
      id: "snapshot-id",
      name: "ready",
    });
    expect(snapshotSeen).toEqual({ name: "ready" });
    expect(snapshotted).toBe(true);
    await expect(
      sandbox.snapshots.restore("snapshot-id")
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "e2b",
    });
  } finally {
    E2BSandbox.create = original;
  }
});
