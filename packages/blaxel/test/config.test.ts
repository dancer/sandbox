import { expect, test } from "bun:test";

import { SandboxInstance } from "@blaxel/core";
import { create } from "@sandbox-sdk/core";

import {
  blaxel,
  updateLifecycle,
  updateNetwork,
  updateTtl,
} from "../src/index";

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

const restore = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = value;
};

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

test("blaxel ignores empty explicit credentials when env credentials exist", async () => {
  const apiKey = process.env.BL_API_KEY;
  const clientCredentials = process.env.BL_CLIENT_CREDENTIALS;
  const workspace = process.env.BL_WORKSPACE;
  const original = SandboxInstance.create;
  const raw = {
    delete: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve({}),
    },
    metadata: { name: "sandbox" },
  } as unknown as SandboxInstance;

  process.env.BL_API_KEY = "env-key";
  process.env.BL_CLIENT_CREDENTIALS = "";
  process.env.BL_WORKSPACE = "env-workspace";
  SandboxInstance.create = (() =>
    Promise.resolve(raw)) as typeof SandboxInstance.create;

  try {
    await expect(
      create({
        adapter: blaxel({
          apiKey: "",
          workspace: "",
        }),
      })
    ).resolves.toMatchObject({
      id: "sandbox",
    });
  } finally {
    SandboxInstance.create = original;
    restore("BL_API_KEY", apiKey);
    restore("BL_CLIENT_CREDENTIALS", clientCredentials);
    restore("BL_WORKSPACE", workspace);
  }
});

test("blaxel rejects provider credentials in sandbox env before provider calls", async () => {
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
          env: { BL_API_KEY: "key" },
          workspace: "workspace",
        }),
        env: { BL_CLIENT_CREDENTIALS: "credentials" },
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message:
        "Blaxel provider credentials cannot be forwarded into sandbox env: BL_API_KEY, BL_CLIENT_CREDENTIALS",
      provider: "blaxel",
    });
    expect(called).toBe(false);
  } finally {
    SandboxInstance.create = original;
  }
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

test("blaxel rejects long sandbox names before provider calls", async () => {
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
          name: "x".repeat(50),
          workspace: "workspace",
        }),
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

test("blaxel replaces network configuration for a native sandbox", async () => {
  const original = SandboxInstance.updateNetwork;
  let seen: unknown;
  const raw = {
    metadata: { name: "sandbox" },
  } as SandboxInstance;

  SandboxInstance.updateNetwork = ((name: string, network: unknown) => {
    seen = { name, network };
    return Promise.resolve(raw);
  }) as typeof SandboxInstance.updateNetwork;

  try {
    await expect(
      updateNetwork(raw, {
        proxy: {
          allowedDomains: ["api.example.com"],
          routing: [],
        },
      })
    ).resolves.toBe(raw);
    expect(seen).toEqual({
      name: "sandbox",
      network: {
        network: {
          proxy: {
            allowedDomains: ["api.example.com"],
            routing: [],
          },
        },
      },
    });
  } finally {
    SandboxInstance.updateNetwork = original;
  }
});

test("blaxel updates native sandbox lifecycle settings", async () => {
  const originalTtl = SandboxInstance.updateTtl;
  const originalLifecycle = SandboxInstance.updateLifecycle;
  const raw = {
    metadata: { name: "sandbox" },
  } as SandboxInstance;
  let ttlSeen: unknown;
  let lifecycleSeen: unknown;

  SandboxInstance.updateTtl = ((name: string, ttl: string | null) => {
    ttlSeen = { name, ttl };
    return Promise.resolve(raw);
  }) as typeof SandboxInstance.updateTtl;
  SandboxInstance.updateLifecycle = ((name: string, lifecycle: unknown) => {
    lifecycleSeen = { lifecycle, name };
    return Promise.resolve(raw);
  }) as typeof SandboxInstance.updateLifecycle;

  try {
    await expect(updateTtl(raw, null)).resolves.toBe(raw);
    await expect(
      updateLifecycle("sandbox", {
        expirationPolicies: [
          { action: "delete", type: "ttl-max-age", value: "1h" },
        ],
      })
    ).resolves.toBe(raw);
    expect(ttlSeen).toEqual({ name: "sandbox", ttl: null });
    expect(lifecycleSeen).toEqual({
      lifecycle: {
        expirationPolicies: [
          { action: "delete", type: "ttl-max-age", value: "1h" },
        ],
      },
      name: "sandbox",
    });
  } finally {
    SandboxInstance.updateTtl = originalTtl;
    SandboxInstance.updateLifecycle = originalLifecycle;
  }
});

test("blaxel maps create options and normalized operations", async () => {
  const original = SandboxInstance.create;
  let createSeen: unknown;
  let safeSeen: unknown;
  const fileSeen: unknown[] = [];
  const mkdirSeen: string[] = [];
  const processSeen: unknown[] = [];
  let previewSeen: unknown;
  let killed: string | undefined;
  const raw = {
    delete: () => Promise.resolve(),
    fs: {
      ls: (path: string) => {
        fileSeen.push({ method: "ls", path });
        return Promise.resolve({
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
        });
      },
      mkdir: (path: string) => {
        mkdirSeen.push(path);
        return Promise.resolve({});
      },
      read: (path: string) => {
        fileSeen.push({ method: "read", path });
        return Promise.resolve("text");
      },
      readBinary: (path: string) => {
        fileSeen.push({ method: "readBinary", path });
        return Promise.resolve(new Blob(["text"]));
      },
      rm: (path: string) => {
        fileSeen.push({ method: "rm", path });
        return Promise.resolve({});
      },
      write: (path: string, value: string) => {
        fileSeen.push({ method: "write", path, value });
        return Promise.resolve({});
      },
      writeBinary: (path: string) => {
        fileSeen.push({ method: "writeBinary", path });
        return Promise.resolve({});
      },
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
        externalId: "task-123",
        image: "blaxel/base-image:latest",
        labels: { owner: "sdk" },
        memory: 4096,
        name: "named",
        network: {
          firewall: { rulesets: ["proxy"] },
          proxy: {
            allowedDomains: ["api.example.com"],
            routing: [],
          },
        },
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
      externalId: "task-123",
      image: "blaxel/py-app:latest",
      labels: { owner: "sdk", task: "test" },
      memory: 4096,
      name: "named",
      network: {
        firewall: { rulesets: ["proxy"] },
        proxy: {
          allowedDomains: ["api.example.com"],
          routing: [],
        },
      },
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

    await sandbox.files.write("data.txt", "value");
    await expect(sandbox.files.text("data.txt")).resolves.toBe("text");
    await expect(sandbox.files.read("data.txt")).resolves.toEqual(
      new TextEncoder().encode("text")
    );
    await sandbox.files.remove("data.txt");
    expect(fileSeen).toEqual([
      { method: "write", path: "/work/data.txt", value: "value" },
      { method: "read", path: "/work/data.txt" },
      { method: "readBinary", path: "/work/data.txt" },
      { method: "rm", path: "/work/data.txt" },
    ]);

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

test("blaxel preserves spawn provider errors", async () => {
  const original = SandboxInstance.create;
  const raw = {
    delete: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve({}),
    },
    metadata: { name: "sandbox" },
    process: {
      exec: () => Promise.reject(new Error("provider spawn failed")),
    },
  } as unknown as SandboxInstance;

  SandboxInstance.create = (() =>
    Promise.resolve(raw)) as typeof SandboxInstance.create;

  try {
    const sandbox = await create({
      adapter: blaxel({
        apiKey: "key",
        workspace: "workspace",
      }),
      cwd: "/work",
    });

    await expect(sandbox.process.spawnShell("sleep 1")).rejects.toMatchObject({
      code: "process",
      provider: "blaxel",
    });
  } finally {
    SandboxInstance.create = original;
  }
});

test("blaxel only maps native missing paths to false", async () => {
  const original = SandboxInstance.create;
  const reads: string[] = [];
  const raw = {
    delete: () => Promise.resolve(),
    fs: {
      ls: (path: string) => {
        if (path.endsWith("file")) {
          return Promise.reject(new Error('{"error":"Directory not found"}'));
        }
        return Promise.reject(
          new Error(
            JSON.stringify({ status: path.endsWith("missing") ? 404 : 401 })
          )
        );
      },
      mkdir: () => Promise.resolve({}),
      readBinary: (path: string) => {
        reads.push(path);
        return Promise.resolve(new Blob(["file"]));
      },
    },
    metadata: { name: "sandbox" },
  } as unknown as SandboxInstance;

  SandboxInstance.create = (() =>
    Promise.resolve(raw)) as typeof SandboxInstance.create;

  try {
    const sandbox = await create({
      adapter: blaxel({
        apiKey: "key",
        workspace: "workspace",
      }),
      cwd: "/work",
    });

    await expect(sandbox.files.exists("missing")).resolves.toBe(false);
    await expect(sandbox.files.exists("file")).resolves.toBe(true);
    await expect(sandbox.files.exists("forbidden")).rejects.toMatchObject({
      code: "provider",
      provider: "blaxel",
    });
    expect(reads).toEqual(["/work/file"]);
  } finally {
    SandboxInstance.create = original;
  }
});

test("blaxel kills spawned processes on abort", async () => {
  const original = SandboxInstance.create;
  let killed: string | undefined;
  const raw = {
    delete: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve({}),
    },
    metadata: { name: "sandbox" },
    process: {
      exec: () => Promise.resolve(response(0, "", "")),
      kill: (id: string) => {
        killed = id;
        return Promise.resolve({});
      },
      streamLogs: () => ({
        close: () => {},
        wait: async () => {
          for (;;) {
            if (killed !== undefined) {
              return;
            }
            await Bun.sleep(1);
          }
        },
      }),
      wait: async (id: string) => {
        for (;;) {
          if (killed === id) {
            return response(130, "", "");
          }
          await Bun.sleep(1);
        }
      },
    },
  } as unknown as SandboxInstance;
  const controller = new AbortController();

  SandboxInstance.create = (() =>
    Promise.resolve(raw)) as typeof SandboxInstance.create;

  try {
    const sandbox = await create({
      adapter: blaxel({
        apiKey: "key",
        workspace: "workspace",
      }),
      cwd: "/work",
    });
    const running = await sandbox.process.spawnShell("sleep 10", {
      signal: controller.signal,
    });

    controller.abort("stopped");
    await running.result;

    expect(killed).toBe("process");
  } finally {
    SandboxInstance.create = original;
  }
});

test("blaxel kills signal-backed exec processes on abort", async () => {
  const original = SandboxInstance.create;
  let killed: string | undefined;
  const raw = {
    delete: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve({}),
    },
    metadata: { name: "sandbox" },
    process: {
      exec: () => Promise.resolve(response(0, "", "")),
      kill: (id: string) => {
        killed = id;
        return Promise.resolve({});
      },
      streamLogs: () => ({
        close: () => {},
        wait: async () => {
          for (;;) {
            if (killed !== undefined) {
              return;
            }
            await Bun.sleep(1);
          }
        },
      }),
      wait: async (id: string) => {
        for (;;) {
          if (killed === id) {
            return response(130, "", "");
          }
          await Bun.sleep(1);
        }
      },
    },
  } as unknown as SandboxInstance;
  const controller = new AbortController();

  SandboxInstance.create = (() =>
    Promise.resolve(raw)) as typeof SandboxInstance.create;

  try {
    const sandbox = await create({
      adapter: blaxel({
        apiKey: "key",
        workspace: "workspace",
      }),
      cwd: "/work",
    });
    const output = sandbox.process.exec("sleep", ["10"], {
      signal: controller.signal,
    });

    await Promise.resolve();
    controller.abort("stopped");

    await expect(output).rejects.toMatchObject({
      code: "aborted",
      provider: "blaxel",
    });
    expect(killed).toBe("process");
  } finally {
    SandboxInstance.create = original;
  }
});
