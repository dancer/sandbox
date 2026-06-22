import { expect, test } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";

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

test("e2b ignores empty explicit credentials when env credentials exist", async () => {
  const apiKey = process.env.E2B_API_KEY;
  const accessToken = process.env.E2B_ACCESS_TOKEN;
  const original = E2BSandbox.create;
  let createSeen: unknown;
  const raw = {
    files: {
      makeDir: () => Promise.resolve(),
    },
    kill: () => Promise.resolve(),
    sandboxId: "sandbox",
  } as unknown as E2BSandbox;

  process.env.E2B_API_KEY = "env-key";
  process.env.E2B_ACCESS_TOKEN = "";
  E2BSandbox.create = ((input?: unknown) => {
    createSeen = input;
    return Promise.resolve(raw);
  }) as typeof E2BSandbox.create;

  try {
    await expect(
      create({
        adapter: e2b({
          accessToken: "",
          apiKey: "",
        }),
      })
    ).resolves.toMatchObject({
      id: "sandbox",
    });
    expect(createSeen).toMatchObject({
      apiKey: "env-key",
    });
  } finally {
    E2BSandbox.create = original;
    restore("E2B_API_KEY", apiKey);
    restore("E2B_ACCESS_TOKEN", accessToken);
  }
});

test("e2b rejects provider credentials in sandbox env before provider calls", async () => {
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
          env: { E2B_ACCESS_TOKEN: "access" },
        }),
        env: { E2B_API_KEY: "key" },
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message:
        "E2B provider credentials cannot be forwarded into sandbox env: E2B_ACCESS_TOKEN, E2B_API_KEY",
      provider: "e2b",
    });
    expect(called).toBe(false);
  } finally {
    E2BSandbox.create = original;
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
  let portSeen: number | undefined;
  let readSeen: unknown;
  let snapshotSeen: unknown;
  let snapshotted = false;
  let writeSeen: unknown;
  const raw = {
    commands: {
      run: (line: string, options: unknown) => {
        commandSeen = { line, options };
        const run = options as {
          background?: boolean;
          onStderr?: (chunk: string) => void;
          onStdout?: (chunk: string) => void;
        };
        if (run.background) {
          run.onStdout?.("out");
          run.onStderr?.("err");
          return Promise.resolve({
            kill: () => Promise.resolve(),
            pid: 123,
            wait: () =>
              Promise.resolve({
                exitCode: 0,
                stderr: "err",
                stdout: "out",
              }),
          });
        }
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
      read: (path: string, options: unknown) => {
        readSeen = { options, path };
        return Promise.resolve(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("streamed"));
              controller.close();
            },
          })
        );
      },
      write: (path: string, input: unknown, options: unknown) => {
        writeSeen = { input, options, path };
        return Promise.resolve();
      },
    },
    getHost: (value: number) => {
      portSeen = value;
      return `${value}-sandbox.e2b.app`;
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
    const host = { host: "preview.example.com" };
    await expect(sandbox.ports.expose(3000, host)).rejects.toMatchObject({
      code: "unsupported",
      provider: "e2b",
    });
    expect(portSeen).toBeUndefined();
    await expect(
      sandbox.ports.expose(3000, { token: "private" })
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "e2b",
    });
    expect(portSeen).toBeUndefined();
    await expect(
      sandbox.ports.expose(3000, { protocol: "http" })
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "e2b",
    });
    await expect(
      sandbox.ports.expose(3000, { protocol: "https" })
    ).resolves.toEqual({
      port: 3000,
      url: "https://3000-sandbox.e2b.app",
    });
    expect(portSeen).toBe(3000);
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

    const running = await sandbox.process.spawn("echo", ["hello"], {
      cwd: "/tmp",
      env: { C: "3" },
      timeout: 321,
    });
    const [streamed, stdout, stderr, spawned] = await Promise.all([
      new Response(running.output).text(),
      new Response(running.stdout).text(),
      new Response(running.stderr).text(),
      running.result,
    ]);
    expect(commandSeen).toEqual({
      line: "echo hello",
      options: {
        background: true,
        cwd: "/tmp",
        envs: { C: "3" },
        onStderr: expect.any(Function),
        onStdout: expect.any(Function),
        timeoutMs: 321,
        user: "runner",
      },
    });
    expect(streamed).toBe("outerr");
    expect(stdout).toBe("out");
    expect(stderr).toBe("err");
    expect(spawned).toEqual({
      code: 0,
      ok: true,
      stderr: "err",
      stdout: "out",
    });

    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    await sandbox.files.write("data.bin", input);
    expect(writeSeen).toEqual({
      input,
      options: { user: "runner" },
      path: "/work/data.bin",
    });

    await expect(
      new Response(await sandbox.files.stream("data.bin")).text()
    ).resolves.toBe("streamed");
    expect(readSeen).toEqual({
      options: { format: "stream", user: "runner" },
      path: "/work/data.bin",
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

test("e2b derives local preview URLs from the provider host", async () => {
  const original = E2BSandbox.create;
  const raw = {
    files: {
      makeDir: () => Promise.resolve(),
    },
    getHost: (value: number) => `localhost:${value}`,
    kill: () => Promise.resolve(),
    sandboxId: "sandbox",
  } as unknown as E2BSandbox;

  E2BSandbox.create = (() => Promise.resolve(raw)) as typeof E2BSandbox.create;

  try {
    const sandbox = await create({
      adapter: e2b({ apiKey: "key", debug: true }),
    });

    await expect(
      sandbox.ports.expose(3000, { protocol: "http" })
    ).resolves.toEqual({
      port: 3000,
      url: "http://localhost:3000",
    });
    await expect(
      sandbox.ports.expose(3000, { protocol: "https" })
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "e2b",
    });
  } finally {
    E2BSandbox.create = original;
  }
});

test("e2b kills spawned processes on abort", async () => {
  const original = E2BSandbox.create;
  let killed = false;
  const wait = async (): Promise<{
    exitCode: number;
    stderr: string;
    stdout: string;
  }> => {
    for (let attempts = 0; attempts < 1000; attempts += 1) {
      if (killed) {
        break;
      }
      await sleep(1);
    }
    return { exitCode: 130, stderr: "", stdout: "" };
  };
  const raw = {
    commands: {
      run: () =>
        Promise.resolve({
          kill: () => {
            killed = true;
            return Promise.resolve(true);
          },
          pid: 123,
          wait,
        }),
    },
    files: {
      makeDir: () => Promise.resolve(),
    },
    kill: () => Promise.resolve(),
    sandboxId: "sandbox",
  } as unknown as E2BSandbox;
  const controller = new AbortController();

  E2BSandbox.create = (() => Promise.resolve(raw)) as typeof E2BSandbox.create;

  try {
    const sandbox = await create({
      adapter: e2b({
        apiKey: "key",
      }),
    });
    const running = await sandbox.process.spawn("sleep", ["10"], {
      signal: controller.signal,
    });

    controller.abort("stopped");
    await running.result;

    expect(killed).toBe(true);
  } finally {
    E2BSandbox.create = original;
  }
});

test("e2b kills signal-backed exec processes on abort", async () => {
  const original = E2BSandbox.create;
  let killed = false;
  const wait = async (): Promise<{
    exitCode: number;
    stderr: string;
    stdout: string;
  }> => {
    for (;;) {
      if (killed) {
        return { exitCode: 130, stderr: "", stdout: "" };
      }
      await sleep(1);
    }
  };
  const raw = {
    commands: {
      run: () =>
        Promise.resolve({
          kill: () => {
            killed = true;
            return Promise.resolve(true);
          },
          pid: 123,
          wait,
        }),
    },
    files: {
      makeDir: () => Promise.resolve(),
    },
    kill: () => Promise.resolve(),
    sandboxId: "sandbox",
  } as unknown as E2BSandbox;
  const controller = new AbortController();

  E2BSandbox.create = (() => Promise.resolve(raw)) as typeof E2BSandbox.create;

  try {
    const sandbox = await create({
      adapter: e2b({
        apiKey: "key",
      }),
    });
    const output = sandbox.process.exec("sleep", ["10"], {
      signal: controller.signal,
    });

    await Promise.resolve();
    controller.abort("stopped");

    await expect(output).rejects.toMatchObject({
      code: "aborted",
      provider: "e2b",
    });
    expect(killed).toBe(true);
  } finally {
    E2BSandbox.create = original;
  }
});
