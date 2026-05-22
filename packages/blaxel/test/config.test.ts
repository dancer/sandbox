import { expect, test } from "bun:test";

import { SandboxInstance } from "@blaxel/core";
import { create } from "@sandbox-sdk/core";

import { blaxel } from "../src/index";

const response = (exitCode = 0, stdout = "ok", stderr = "") => ({
  command: "command",
  completedAt: new Date().toISOString(),
  exitCode,
  logs: stdout + stderr,
  name: "process",
  pid: "process",
  startedAt: new Date().toISOString(),
  status: exitCode === 0 ? "completed" : "failed",
  stderr,
  stdout,
  workingDir: "/work",
});

test("blaxel reports incomplete credentials before provider calls", async () => {
  await expect(
    create({
      adapter: blaxel({
        apiKey: "key",
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "blaxel",
  });
});

test("blaxel rejects invalid declared ports before provider calls", async () => {
  const original = SandboxInstance.create;
  let called = false;
  SandboxInstance.create = (() => {
    called = true;
    return Promise.reject(new Error("provider called"));
  }) as typeof SandboxInstance.create;

  try {
    await expect(
      create({
        adapter: blaxel({
          apiKey: "key",
          workspace: "workspace",
        }),
        ports: [0],
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "blaxel",
    });
    expect(called).toBe(false);
  } finally {
    SandboxInstance.create = original;
  }
});

test("blaxel rejects invalid create timeouts before provider calls", async () => {
  const original = SandboxInstance.create;
  let called = false;
  SandboxInstance.create = (() => {
    called = true;
    return Promise.reject(new Error("provider called"));
  }) as typeof SandboxInstance.create;

  try {
    await expect(
      create({
        adapter: blaxel({
          apiKey: "key",
          workspace: "workspace",
        }),
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "blaxel",
    });
    expect(called).toBe(false);
  } finally {
    SandboxInstance.create = original;
  }
});

test("blaxel maps create options and normalized operations", async () => {
  const original = SandboxInstance.create;
  let createSeen: unknown;
  let safeSeen: unknown;
  const mkdirSeen: string[] = [];
  const processSeen: unknown[] = [];
  let previewSeen: unknown;
  let killed: string | undefined;
  const raw = {
    delete: () => Promise.resolve(),
    fs: {
      ls: () =>
        Promise.resolve({
          files: [
            {
              group: "group",
              lastModified: "2026-01-01T00:00:00.000Z",
              name: "file.txt",
              owner: "owner",
              path: "/work/file.txt",
              permissions: "0644",
              size: 2,
            },
          ],
          name: "work",
          path: "/work",
          subdirectories: [{ name: "src", path: "/work/src" }],
        }),
      mkdir: (path: string) => {
        mkdirSeen.push(path);
        return Promise.resolve({});
      },
      read: () => Promise.resolve("text"),
      readBinary: () => Promise.resolve(new Blob(["text"])),
      rm: () => Promise.resolve({}),
      write: () => Promise.resolve({}),
      writeBinary: () => Promise.resolve({}),
    },
    metadata: { name: "sandbox" },
    previews: {
      createIfNotExists: (preview: unknown) => {
        previewSeen = preview;
        return Promise.resolve({
          spec: { url: "https://preview.bl.run" },
        });
      },
    },
    process: {
      exec: (request: unknown) => {
        processSeen.push(request);
        return Promise.resolve(response());
      },
      kill: (id: string) => {
        killed = id;
        return Promise.resolve({});
      },
      streamLogs: (
        _id: string,
        callbacks: {
          onLog?: (log: string) => void;
          onStderr?: (log: string) => void;
          onStdout?: (log: string) => void;
        }
      ) => {
        callbacks.onStdout?.("out");
        callbacks.onStderr?.("err");
        callbacks.onLog?.("outerr");
        return {
          close: () => {},
          wait: () => Promise.resolve(),
        };
      },
      wait: () => Promise.resolve(response()),
    },
  } as unknown as SandboxInstance;

  SandboxInstance.create = ((input?: unknown, options?: unknown) => {
    createSeen = input;
    safeSeen = options;
    return Promise.resolve(raw);
  }) as typeof SandboxInstance.create;

  try {
    const sandbox = await create({
      adapter: blaxel({
        apiKey: "key",
        env: { A: "1" },
        image: "blaxel/base-image:latest",
        labels: { owner: "sdk" },
        memory: 4096,
        name: "named",
        ports: [3000],
        safe: true,
        volumes: [{ mountPath: "/cache", name: "cache", readOnly: true }],
        workspace: "workspace",
      }),
      cwd: "/work",
      env: { B: "2" },
      metadata: { task: "test" },
      ports: [8080],
      template: "blaxel/py-app:latest",
      timeout: 4500,
    });

    expect(sandbox.id).toBe("sandbox");
    expect(sandbox.cwd).toBe("/work");
    expect(createSeen).toMatchObject({
      envs: [
        { name: "A", value: "1" },
        { name: "B", value: "2" },
      ],
      image: "blaxel/py-app:latest",
      labels: { owner: "sdk", task: "test" },
      memory: 4096,
      name: "named",
      ports: [{ protocol: "HTTP", target: 8080 }],
      ttl: "5s",
      volumes: [{ mountPath: "/cache", name: "cache", readOnly: true }],
    });
    expect(safeSeen).toEqual({ safe: true });
    expect(mkdirSeen).toContain("/work");

    await expect(sandbox.ports.expose(15_500)).resolves.toEqual({
      port: 15_500,
      url: "https://preview.bl.run",
    });
    await expect(sandbox.ports.expose(8080)).resolves.toEqual({
      port: 8080,
      url: "https://preview.bl.run",
    });
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "blaxel",
    });
    expect(previewSeen).toEqual({
      metadata: { name: "sandbox-sdk-8080" },
      spec: { port: 8080, public: true },
    });

    await expect(
      sandbox.process.exec("echo", ["hello world"], {
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "blaxel",
    });
    expect(processSeen).toHaveLength(0);

    await expect(
      sandbox.process.exec("echo", ["hello world"], {
        cwd: "/tmp",
        env: { C: "3" },
        timeout: 2500,
      })
    ).resolves.toMatchObject({
      code: 0,
      ok: true,
      stdout: "ok",
    });
    expect(processSeen.at(-1)).toEqual({
      command: "echo 'hello world'",
      env: { C: "3" },
      timeout: 3,
      waitForCompletion: true,
      workingDir: "/tmp",
    });

    const running = await sandbox.process.spawnShell("sleep 1");
    const [streamed, stdout, stderr, spawned] = await Promise.all([
      new Response(running.output).text(),
      new Response(running.stdout).text(),
      new Response(running.stderr).text(),
      running.result,
    ]);
    expect(streamed).toBe("outerr");
    expect(stdout).toBe("out");
    expect(stderr).toBe("err");
    expect(spawned).toMatchObject({
      code: 0,
      ok: true,
      stderr: "",
      stdout: "ok",
    });
    await running.kill();
    expect(killed).toBe("process");

    try {
      await sandbox.snapshots.create();
      throw new Error("expected snapshot creation to fail");
    } catch (error) {
      expect(error).toMatchObject({
        code: "unsupported",
        provider: "blaxel",
      });
    }
  } finally {
    SandboxInstance.create = original;
  }
});
