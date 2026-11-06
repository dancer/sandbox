import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import { Sandbox } from "@vercel/sandbox";

import { vercel } from "../src/index";
import type { Vercel } from "../src/index";

const credentials = {
  projectId: "project",
  teamId: "team",
  token: "token",
};

const logs = async function* logs() {
  yield { data: "partial", stream: "stdout" };
};

test("vercel forwards images, regions, private networks, and drive mounts", async () => {
  const original = Sandbox.create;
  let received: unknown;
  Sandbox.create = ((input: unknown) => {
    received = input;
    return Promise.resolve({
      fs: { mkdir: () => Promise.resolve() },
      name: "sandbox",
      routes: [],
    });
  }) as unknown as typeof Sandbox.create;
  try {
    await create({
      adapter: vercel({
        ...credentials,
        failoverRegions: ["sfo1"],
        image: "vercel/sandbox/universal",
        mounts: { "/data": { drive: "drive", mode: "snapshot" } },
        networkId: "network",
        region: "iad1",
      }),
      ports: Array.from({ length: 15 }, (_, index) => 3000 + index),
    });
    expect(received).toMatchObject({
      failoverRegions: ["sfo1"],
      image: "vercel/sandbox/universal",
      mounts: { "/data": { drive: "drive", mode: "snapshot" } },
      networkId: "network",
      region: "iad1",
    });
    expect(received).not.toHaveProperty("runtime");
  } finally {
    Sandbox.create = original;
  }
});

test("vercel uses the provider default image without selecting a legacy runtime", async () => {
  const original = Sandbox.create;
  let received: unknown;
  Sandbox.create = ((input: unknown) => {
    received = input;
    return Promise.resolve({
      fs: { mkdir: () => Promise.resolve() },
      name: "sandbox",
      routes: [],
    });
  }) as unknown as typeof Sandbox.create;
  try {
    await create({ adapter: vercel(credentials) });
    expect(received).not.toHaveProperty("runtime");
    expect(received).not.toHaveProperty("image");
    await create({ adapter: vercel(credentials), snapshot: "snapshot" });
    expect(received).toMatchObject({
      source: { snapshotId: "snapshot", type: "snapshot" },
    });
    expect(received).not.toHaveProperty("runtime");
    expect(received).not.toHaveProperty("image");
  } finally {
    Sandbox.create = original;
  }
});

test("vercel rejects conflicting environment selections before provider work", async () => {
  const original = Sandbox.create;
  let called = false;
  Sandbox.create = () => {
    called = true;
    return Promise.reject(new Error("provider called"));
  };
  try {
    const options: Vercel = { ...credentials, runtime: "node24" };
    Reflect.set(options, "image", "vercel/sandbox/universal");
    await expect(create({ adapter: vercel(options) })).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    await expect(
      create({
        adapter: vercel({ ...credentials, image: "custom" }),
        snapshot: "snapshot",
      })
    ).rejects.toMatchObject({ code: "configuration", provider: "vercel" });
    expect(called).toBe(false);
  } finally {
    Sandbox.create = original;
  }
});

test("vercel retains detached failures until callers observe the result", async () => {
  const original = Sandbox.create;

  Sandbox.create = (() =>
    Promise.resolve({
      fs: { mkdir: () => Promise.resolve() },
      name: "sandbox",
      routes: [],
      runCommand: () =>
        Promise.resolve({
          cmdId: "command",
          kill: () => Promise.resolve(),
          logs,
          wait: () => Promise.reject(new Error("sandbox stopped")),
        }),
    })) as unknown as typeof Sandbox.create;
  try {
    const sandbox = await create({ adapter: vercel(credentials) });
    const running = await sandbox.process.spawn("sleep", ["60"]);
    await Bun.sleep(1);
    await expect(running.result).rejects.toMatchObject({
      code: "process",
      provider: "vercel",
    });
  } finally {
    Sandbox.create = original;
  }
});
