import { expect, mock, test } from "bun:test";

import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { create } from "@sandbox-sdk/core";

import { cloudflare } from "../src/index";

let exposeCalls = 0;

const raw = {
  destroy: () => Promise.resolve(),
  exposePort: () => {
    exposeCalls += 1;
    return Promise.resolve({ url: "https://preview.example.com" });
  },
  mkdir: () => Promise.resolve(),
} as unknown as CloudflareSandbox;

void mock.module("@cloudflare/sandbox", () => ({
  getSandbox: () => raw,
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
