import { expect, mock, test } from "bun:test";

import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { create } from "@sandbox-sdk/core";

import { cloudflare } from "../src/index";

let exposeCalls = 0;
let exposeSeen: unknown;
let executeSeen: unknown;
let getSeen: unknown;
let mkdirSeen: unknown;
let readSeen: unknown;
let setEnvSeen: unknown;
let writeSeen: unknown;

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
  exposePort: (port: number, options: unknown) => {
    exposeCalls += 1;
    exposeSeen = { options, port };
    return Promise.resolve({ url: "https://preview.example.com" });
  },
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
  setEnvSeen = undefined;

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
      { normalizeId: true, sleepAfter: "1m" },
    ]);
    expect(setEnvSeen).toEqual({ A: "1", B: "2" });
    expect(mkdirSeen).toEqual({
      options: { recursive: true },
      path: "/work",
    });
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

test("cloudflare rejects workers dev preview hosts before provider calls", async () => {
  exposeCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      hostname: "example.workers.dev",
    }),
  });

  try {
    await expect(sandbox.ports.expose(8080)).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
    expect(exposeCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects reserved preview ports before provider calls", async () => {
  exposeCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      hostname: "example.com",
    }),
  });

  try {
    await expect(sandbox.ports.expose(3000)).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
    expect(exposeCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects invalid preview ports before provider calls", async () => {
  exposeCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      hostname: "example.com",
    }),
  });

  try {
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(exposeCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects low preview ports before provider calls", async () => {
  exposeCalls = 0;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      hostname: "example.com",
    }),
  });

  try {
    await expect(sandbox.ports.expose(80)).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    expect(exposeCalls).toBe(0);
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare allows preview ports over the system range", async () => {
  exposeCalls = 0;
  exposeSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      hostname: "example.com",
      name: "api",
    }),
  });

  try {
    await expect(
      sandbox.ports.expose(8080, { token: "verify" })
    ).resolves.toEqual({
      port: 8080,
      url: "https://preview.example.com",
    });
    expect(exposeCalls).toBe(1);
    expect(exposeSeen).toEqual({
      options: {
        hostname: "example.com",
        name: "api",
        token: "verify",
      },
      port: 8080,
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare rejects invalid preview tokens before provider calls", async () => {
  for (const token of ["", "API", "api-v1", "abcdefghijklmnopq"]) {
    exposeCalls = 0;
    const sandbox = await create({
      adapter: cloudflare({
        binding,
        hostname: "example.com",
      }),
    });

    try {
      await expect(sandbox.ports.expose(8080, { token })).rejects.toMatchObject(
        {
          code: "configuration",
          provider: "cloudflare",
        }
      );
      expect(exposeCalls).toBe(0);
    } finally {
      await sandbox.stop();
    }
  }
});

test("cloudflare writes readable streams through base64 content", async () => {
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
      content: "AQID",
      options: { encoding: "base64" },
      path: "/workspace/data.bin",
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflare uses readable streams directly with rpc transport", async () => {
  readSeen = undefined;
  writeSeen = undefined;
  const sandbox = await create({
    adapter: cloudflare({
      binding,
      options: { transport: "rpc" },
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
