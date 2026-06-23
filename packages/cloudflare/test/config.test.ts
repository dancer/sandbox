import { expect, mock, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { create } from "@sandbox-sdk/core";

import { cloudflare } from "../src/index";

type BackupFailure = "BACKUP_NOT_FOUND" | "INVALID_BACKUP_CONFIG";

let executeSeen: unknown;
let getSeen: unknown;
let killedSignal: unknown;
let mkdirSeen: unknown;
let readSeen: unknown;
let backupFailure: BackupFailure | undefined;
let restoreSeen: unknown;
let restoreFailure: BackupFailure | undefined;
let restoreSuccess = true;
let setEnvSeen: unknown;
let startProcessSeen: unknown;
let tunnelCalls = 0;
let tunnelSeen: unknown;
let writeSeen: unknown;
let backupSeen: unknown;

const sse = (
  ...events: readonly [string, string][]
): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const [type, data] of events) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ data, type })}\n\n`
          )
        );
      }
      controller.close();
    },
  });

const raw = {
  createBackup: (options: unknown) => {
    backupSeen = options;
    const code = backupFailure;
    if (code !== undefined) {
      return Promise.reject(
        Object.assign(new Error("backup configuration failed"), {
          code,
        })
      );
    }
    return Promise.resolve({
      dir: (options as { dir: string }).dir,
      id: "0d75bca9-6f81-43c9-8e34-252bde61336b",
      localBucket: (options as { localBucket?: boolean }).localBucket,
    });
  },
  destroy: () => Promise.resolve(),
  exec: (line: string, options: unknown) => {
    executeSeen = { line, options };
    return Promise.resolve({
      exitCode: 0,
      stderr: "",
      stdout: "ok",
    });
  },
  getProcessLogs: () =>
    Promise.resolve({
      stderr: "err",
      stdout: "out",
    }),
  mkdir: (path: string, options: unknown) => {
    mkdirSeen = { options, path };
    return Promise.resolve();
  },
  readFile: (path: string, options?: unknown) => {
    readSeen = { options, path };
    if ((options as { encoding?: string } | undefined)?.encoding === "none") {
      return Promise.resolve({
        content: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("streamed"));
            controller.close();
          },
        }),
      });
    }
    return Promise.resolve({ content: "c3RyZWFtZWQ=" });
  },
  restoreBackup: (backup: unknown) => {
    restoreSeen = backup;
    const code = restoreFailure;
    if (code !== undefined) {
      return Promise.reject(
        Object.assign(new Error("backup restore failed"), {
          code,
        })
      );
    }
    return Promise.resolve({
      dir: (backup as { dir: string }).dir,
      id: (backup as { id: string }).id,
      success: restoreSuccess,
    });
  },
  setEnvVars: (input: unknown) => {
    setEnvSeen = input;
    return Promise.resolve();
  },
  startProcess: (line: string, options: unknown) => {
    startProcessSeen = { line, options };
    return Promise.resolve({
      id: "process",
      kill: (signal?: string) => {
        killedSignal = signal;
        return Promise.resolve();
      },
      waitForExit: () => Promise.resolve({ exitCode: 0 }),
    });
  },
  streamProcessLogs: () =>
    Promise.resolve(sse(["stdout", "out"], ["stderr", "err"])),
  tunnels: {
    get: (port: number, options: unknown) => {
      tunnelCalls += 1;
      tunnelSeen = { options, port };
      return Promise.resolve({
        hostname: "sandbox.trycloudflare.com",
        port,
        url: "https://sandbox.trycloudflare.com",
      });
    },
  },
  writeFile: (path: string, content: unknown, options?: unknown) => {
    writeSeen = { content, options, path };
    return Promise.resolve();
  },
} as unknown as CloudflareSandbox;

void mock.module("@cloudflare/sandbox", () => ({
  getSandbox: (...input: unknown[]) => {
    getSeen = input;
    return raw;
  },
}));

const binding = {} as Parameters<typeof cloudflare>[0]["binding"];

test("cloudflare reports missing durable object binding", async () => {
  await expect(
    create({ adapter: cloudflare({} as Parameters<typeof cloudflare>[0]) })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "cloudflare",
  });
});

test("cloudflare maps create options before provider calls", async () => {
  getSeen = undefined;
  mkdirSeen = undefined;
  readSeen = undefined;
  setEnvSeen = undefined;
  writeSeen = undefined;

  const sandbox = await create({
    adapter: cloudflare({
      binding,
      env: { A: "1" },
      id: "option-id",
      options: { sleepAfter: "1m" },
    }),
    cwd: "/work",
    env: { B: "2" },
    id: "input-id",
  });

  try {
    expect(sandbox.id).toBe("input-id");
    expect(sandbox.cwd).toBe("/work");
    expect(sandbox.capabilities).toMatchObject({
      snapshotCreate: false,
      snapshotDelete: false,
      snapshotRestore: false,
    });
    expect(getSeen).toEqual([
      binding,
      "input-id",
      {
        enableDefaultSession: false,
        normalizeId: true,
        sleepAfter: "1m",
        transport: "rpc",
      },
    ]);
    expect(setEnvSeen).toEqual({ A: "1", B: "2" });
    expect(mkdirSeen).toEqual({
      options: { recursive: true },
      path: "/work",
    });
    await sandbox.files.write("data.bin", "value");
    expect(writeSeen).toEqual({
      content: "value",
      options: { encoding: "utf-8" },
      path: "/work/data.bin",
    });
    await expect(
      new Response(await sandbox.files.stream("data.bin")).text()
    ).resolves.toBe("streamed");
    expect(readSeen).toEqual({
      options: { encoding: "none" },
      path: "/work/data.bin",
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare lets native options opt into implicit sessions", async () => {
  getSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      options: { enableDefaultSession: true },
    }),
  });

  try {
    expect(getSeen).toEqual([
      binding,
      sandbox.id,
      {
        enableDefaultSession: true,
        normalizeId: true,
        transport: "rpc",
      },
    ]);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare enables configured R2 backup snapshots", async () => {
  backupSeen = undefined;
  restoreSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      backups: {
        compression: { format: "zstd", threads: 2 },
        excludes: ["node_modules", "*.log"],
        localBucket: true,
        multipart: false,
        ttl: 600,
        useGitignore: true,
      },
      binding,
    }),
    cwd: "/workspace/project",
  });

  try {
    expect(sandbox.capabilities).toMatchObject({
      snapshotCreate: "filesystem",
      snapshotDelete: false,
      snapshotRestore: "filesystem",
    });
    const snapshot = await sandbox.snapshots.create("before-upgrade");
    expect(snapshot).toEqual({
      id: "0d75bca9-6f81-43c9-8e34-252bde61336b",
      name: "before-upgrade",
    });
    expect(backupSeen).toEqual({
      compression: { format: "zstd", threads: 2 },
      dir: "/workspace/project",
      excludes: ["node_modules", "*.log"],
      gitignore: true,
      localBucket: true,
      multipart: false,
      name: "before-upgrade",
      ttl: 600,
    });

    await sandbox.snapshots.restore(snapshot.id);
    expect(restoreSeen).toEqual({
      dir: "/workspace/project",
      id: "0d75bca9-6f81-43c9-8e34-252bde61336b",
      localBucket: true,
    });
    await expect(sandbox.snapshots.delete(snapshot.id)).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare preserves an explicit false useGitignore option", async () => {
  backupSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      backups: { useGitignore: false },
      binding,
    }),
  });

  try {
    await sandbox.snapshots.create();
    expect(backupSeen).toMatchObject({
      dir: "/workspace",
      gitignore: false,
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects the legacy native backup gitignore option", async () => {
  getSeen = undefined;
  await expect(
    create({
      adapter: Reflect.apply(cloudflare, undefined, [
        { backups: { gitignore: true }, binding },
      ]),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    message:
      "Cloudflare backups.gitignore is not supported. Use backups.useGitignore.",
    provider: "cloudflare",
  });
  expect(getSeen).toBeUndefined();
});

test("cloudflare rejects unsupported backup directories before provider calls", async () => {
  for (const cwd of [
    "workspace",
    "/workspace/../tmp",
    "/etc",
    "/workspace/\0unsafe",
  ]) {
    getSeen = undefined;
    await expect(
      create({
        adapter: cloudflare({ backups: {}, binding }),
        cwd,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(getSeen).toBeUndefined();
  }
});

test("cloudflare surfaces unsuccessful backup restores", async () => {
  restoreSeen = undefined;
  restoreSuccess = false;
  const sandbox = await create({
    adapter: cloudflare({ backups: {}, binding }),
  });

  try {
    await expect(
      sandbox.snapshots.restore("0d75bca9-6f81-43c9-8e34-252bde61336b")
    ).rejects.toMatchObject({
      code: "provider",
      provider: "cloudflare",
    });
    expect(restoreSeen).toEqual({
      dir: "/workspace",
      id: "0d75bca9-6f81-43c9-8e34-252bde61336b",
    });
  } finally {
    restoreSuccess = true;
    await sandbox.stop();
  }
});

test("cloudflare normalizes backup configuration errors", async () => {
  backupFailure = "INVALID_BACKUP_CONFIG";
  const sandbox = await create({
    adapter: cloudflare({ backups: {}, binding }),
  });

  try {
    await expect(sandbox.snapshots.create()).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
  } finally {
    backupFailure = undefined;
    await sandbox.stop();
  }
});

test("cloudflare normalizes missing backup errors", async () => {
  restoreFailure = "BACKUP_NOT_FOUND";
  const sandbox = await create({
    adapter: cloudflare({ backups: {}, binding }),
  });

  try {
    await expect(
      sandbox.snapshots.restore("0d75bca9-6f81-43c9-8e34-252bde61336b")
    ).rejects.toMatchObject({
      code: "not_found",
      provider: "cloudflare",
    });
  } finally {
    restoreFailure = undefined;
    await sandbox.stop();
  }
});

test("cloudflare maps command options without executing a real provider", async () => {
  executeSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });

  try {
    await expect(
      sandbox.process.exec("echo", ["hello world"], {
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(executeSeen).toBeUndefined();

    await expect(
      sandbox.process.exec("echo", ["hello world"], {
        cwd: "/tmp",
        env: { A: "1" },
        timeout: 123,
      })
    ).resolves.toMatchObject({
      code: 0,
      ok: true,
      stdout: "ok",
    });
    expect(executeSeen).toEqual({
      line: "echo 'hello world'",
      options: {
        cwd: "/tmp",
        env: { A: "1" },
        timeout: 123,
      },
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare exposes separate process streams", async () => {
  startProcessSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });

  try {
    const process = await sandbox.process.spawn("echo", ["hello"], {
      cwd: "/tmp",
      env: { A: "1" },
      timeout: 123,
    });
    const [output, stdout, stderr, result] = await Promise.all([
      new Response(process.output).text(),
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.result,
    ]);

    expect(startProcessSeen).toEqual({
      line: "echo hello",
      options: {
        cwd: "/tmp",
        env: { A: "1" },
        timeout: 123,
      },
    });
    expect(output).toBe("outerr");
    expect(stdout).toBe("out");
    expect(stderr).toBe("err");
    expect(result).toEqual({
      code: 0,
      ok: true,
      stderr: "err",
      stdout: "out",
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare kills spawned processes on abort", async () => {
  killedSignal = undefined;
  const controller = new AbortController();
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });

  try {
    await sandbox.process.spawnShell("sleep 1", {
      signal: controller.signal,
    });
    controller.abort();
    await delay(0);
    expect(killedSignal).toBe("SIGTERM");
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects reserved tunnel ports before provider calls", async () => {
  tunnelCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });

  try {
    await expect(sandbox.ports.expose(3000)).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
    expect(tunnelCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects invalid tunnel ports before provider calls", async () => {
  tunnelCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });

  try {
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(tunnelCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects low tunnel ports before provider calls", async () => {
  tunnelCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });

  try {
    await expect(sandbox.ports.expose(80)).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(tunnelCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare exposes quick tunnels by default", async () => {
  tunnelCalls = 0;
  tunnelSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });

  try {
    await expect(sandbox.ports.expose(8080)).resolves.toMatchObject({
      port: 8080,
      url: "https://sandbox.trycloudflare.com",
    });
    expect(tunnelCalls).toBe(1);
    expect(tunnelSeen).toEqual({
      options: undefined,
      port: 8080,
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare forwards configured named tunnels", async () => {
  tunnelCalls = 0;
  tunnelSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      tunnel: "api",
    }),
  });

  try {
    await sandbox.ports.expose(8080, { protocol: "https" });
    expect(tunnelCalls).toBe(1);
    expect(tunnelSeen).toEqual({
      options: { name: "api" },
      port: 8080,
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare maps named tunnels by port", async () => {
  tunnelCalls = 0;
  tunnelSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      tunnel: "fallback",
      tunnels: {
        8080: "api",
        9090: "web",
      },
    }),
  });

  try {
    await sandbox.ports.expose(8080);
    expect(tunnelSeen).toEqual({
      options: { name: "api" },
      port: 8080,
    });
    await sandbox.ports.expose(9090);
    expect(tunnelSeen).toEqual({
      options: { name: "web" },
      port: 9090,
    });
    await sandbox.ports.expose(4567);
    expect(tunnelSeen).toEqual({
      options: { name: "fallback" },
      port: 4567,
    });
    expect(tunnelCalls).toBe(3);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects duplicate named tunnel labels before provider calls", async () => {
  for (const tunnels of [{ 8080: "API" }, { 8080: "app", 9090: "app" }]) {
    getSeen = undefined;
    await expect(
      create({
        adapter: cloudflare({ binding, tunnels }),
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(getSeen).toBeUndefined();
  }

  getSeen = undefined;
  await expect(
    create({
      adapter: cloudflare({ binding, tunnels: { 3000: "app" } }),
    })
  ).rejects.toMatchObject({
    code: "unsupported",
    provider: "cloudflare",
  });
  expect(getSeen).toBeUndefined();
});

test("cloudflare rejects a named tunnel fallback reused for another port", async () => {
  tunnelCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({ binding, tunnel: "app" }),
  });

  try {
    await sandbox.ports.expose(8080);
    await expect(sandbox.ports.expose(9090)).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(tunnelCalls).toBe(1);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare accepts 63 character named tunnel labels", async () => {
  tunnelCalls = 0;
  tunnelSeen = undefined;
  const tunnel = "a".repeat(63);
  const sandbox = await create({
    adapter: cloudflare({ binding, tunnel }),
  });

  try {
    await sandbox.ports.expose(8080);
    expect(tunnelCalls).toBe(1);
    expect(tunnelSeen).toEqual({
      options: { name: tunnel },
      port: 8080,
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects invalid named tunnel labels before provider calls", async () => {
  for (const tunnel of [
    "API",
    "api.example.com",
    "-api",
    "api-",
    "a".repeat(64),
  ]) {
    getSeen = undefined;
    await expect(
      create({
        adapter: cloudflare({ binding, tunnel }),
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(getSeen).toBeUndefined();
  }
});

test("cloudflare rejects unsupported normalized tunnel options", async () => {
  tunnelCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({ binding }),
  });

  try {
    for (const options of [
      { protocol: "http" as const },
      { token: "verify" },
    ]) {
      await expect(sandbox.ports.expose(8080, options)).rejects.toMatchObject({
        code: "unsupported",
        provider: "cloudflare",
      });
    }
    await expect(
      Reflect.apply(sandbox.ports.expose, sandbox.ports, [
        8080,
        { protocol: "tcp" },
      ])
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
    expect(tunnelCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare uses readable streams directly", async () => {
  readSeen = undefined;
  writeSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
    }),
  });
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });

  try {
    await sandbox.files.write("/workspace/data.bin", input);
    expect(writeSeen).toEqual({
      content: input,
      options: undefined,
      path: "/workspace/data.bin",
    });

    await expect(
      new Response(await sandbox.files.stream("/workspace/data.bin")).text()
    ).resolves.toBe("streamed");
    expect(readSeen).toEqual({
      options: { encoding: "none" },
      path: "/workspace/data.bin",
    });
  } finally {
    await sandbox.stop();
  }
});
