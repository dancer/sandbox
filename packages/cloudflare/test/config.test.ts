import { expect, mock, test } from "bun:test";

import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { create } from "@sandbox-sdk/core";

import { cloudflare } from "../src/index";

let exposeCalls = 0;
let exposeSeen: unknown;
let executeSeen: unknown;
let getSeen: unknown;
let mkdirSeen: unknown;
let setEnvSeen: unknown;

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
  setEnvVars: (input: unknown) => {
    setEnvSeen = input;
    return Promise.resolve();
  },
} as unknown as CloudflareSandbox;

void mock.module("@cloudflare/sandbox", () => ({
  getSandbox: (...input: unknown[]) => {
    getSeen = input;
    return raw;
  },
}));

const binding = {} as DurableObjectNamespace<CloudflareSandbox>;

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

test("cloudflare allows low preview ports except reserved control plane", async () => {
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
    await expect(sandbox.ports.expose(80)).resolves.toEqual({
      port: 80,
      url: "https://preview.example.com",
    });
    expect(exposeCalls).toBe(1);
    expect(exposeSeen).toEqual({
      options: {
        hostname: "example.com",
        name: "api",
      },
      port: 80,
    });
  } finally {
    await sandbox.stop();
  }
});
