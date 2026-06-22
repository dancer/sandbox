import { expect, mock, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { create } from "@sandbox-sdk/core";

import { cloudflare } from "../src/index";

let executeSeen: unknown;
let getSeen: unknown;
let killedSignal: unknown;
let mkdirSeen: unknown;
let readSeen: unknown;
let setEnvSeen: unknown;
let startProcessSeen: unknown;
let tunnelCalls = 0;
let tunnelSeen: unknown;
let writeSeen: unknown;

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
      { protocol: "tcp" as const },
      { token: "verify" },
    ]) {
      await expect(sandbox.ports.expose(8080, options)).rejects.toMatchObject({
        code: "unsupported",
        provider: "cloudflare",
      });
    }
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
