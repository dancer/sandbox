import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import type { ModalClient, Sandbox as ModalSandbox } from "modal";

import { modal } from "../src/index";

const restore = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = value;
};

const processOutput = (code = 0, stdout = "ok", stderr = "") => ({
  stderr: {
    readText: () => Promise.resolve(stderr),
  },
  stdout: {
    readText: () => Promise.resolve(stdout),
  },
  wait: () => Promise.resolve(code),
});

test("modal reports missing credentials before provider calls", async () => {
  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  const configPath = process.env.MODAL_CONFIG_PATH;
  process.env.MODAL_TOKEN_ID = "";
  process.env.MODAL_TOKEN_SECRET = "";
  process.env.MODAL_CONFIG_PATH = "/tmp/sandbox-sdk-missing-modal.toml";

  try {
    await expect(create({ adapter: modal() })).rejects.toMatchObject({
      code: "configuration",
      provider: "modal",
    });
  } finally {
    restore("MODAL_TOKEN_ID", tokenId);
    restore("MODAL_TOKEN_SECRET", tokenSecret);
    restore("MODAL_CONFIG_PATH", configPath);
  }
});

test("modal maps create options, tags, commands, and ports", async () => {
  const execSeen: unknown[] = [];
  let appSeen: unknown;
  let createSeen: unknown;
  let imageSeen: unknown;
  let snapshotted = false;
  let tagsSeen: unknown;
  const raw = {
    exec: (command: string[], options: unknown) => {
      execSeen.push({ command, options });
      return Promise.resolve(processOutput());
    },
    sandboxId: "sandbox",
    setTags: (tags: unknown) => {
      tagsSeen = tags;
      return Promise.resolve();
    },
    snapshotFilesystem: () => {
      snapshotted = true;
      return Promise.resolve({ imageId: "im-snapshot-created" });
    },
    terminate: () => Promise.resolve(),
    tunnels: () =>
      Promise.resolve({
        8080: {
          url: "https://preview.example.com",
        },
      }),
  } as unknown as ModalSandbox;
  const client = {
    apps: {
      fromName: (name: string, options: unknown) => {
        appSeen = { name, options };
        return Promise.resolve({});
      },
    },
    images: {
      fromId: (id: string) => {
        imageSeen = id;
        return Promise.resolve({});
      },
      fromRegistry: (tag: string) => {
        imageSeen = tag;
        return {};
      },
    },
    sandboxes: {
      create: (app: unknown, image: unknown, options: unknown) => {
        createSeen = { app, image, options };
        return Promise.resolve(raw);
      },
    },
  } as unknown as ModalClient;

  const sandbox = await create({
    adapter: modal({
      app: "sdk-app",
      client,
      createAppIfMissing: false,
      env: { A: "1" },
      options: { cpu: 0.5 },
      ports: [3000],
      tags: { owner: "sdk" },
      timeout: 123,
    }),
    cwd: "/work",
    env: { B: "2" },
    metadata: { task: "test" },
    ports: [8080],
    snapshot: "im-snapshot",
    timeout: 456,
  });

  expect(sandbox.id).toBe("sandbox");
  expect(sandbox.cwd).toBe("/work");
  expect(appSeen).toEqual({
    name: "sdk-app",
    options: { createIfMissing: false },
  });
  expect(imageSeen).toBe("im-snapshot");
  expect(createSeen).toMatchObject({
    options: {
      cpu: 0.5,
      encryptedPorts: [8080],
      env: { A: "1", B: "2" },
      timeoutMs: 1000,
      workdir: "/work",
    },
  });
  expect(tagsSeen).toEqual({ owner: "sdk", task: "test" });
  expect(execSeen[0]).toEqual({
    command: ["sh", "-lc", "mkdir -p /work"],
    options: {
      stderr: "pipe",
      stdout: "pipe",
      workdir: "/",
    },
  });

  await expect(sandbox.ports.expose(3000)).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });
  await expect(sandbox.ports.expose(8080)).resolves.toEqual({
    port: 8080,
    url: "https://preview.example.com",
  });

  await expect(
    sandbox.process.exec("echo", ["hello"], {
      cwd: "/tmp",
      env: { C: "3" },
      timeout: 321,
    })
  ).resolves.toMatchObject({
    code: 0,
    ok: true,
    stdout: "ok",
  });
  expect(execSeen.at(-1)).toEqual({
    command: ["echo", "hello"],
    options: {
      env: { C: "3" },
      stderr: "pipe",
      stdout: "pipe",
      timeoutMs: 1000,
      workdir: "/tmp",
    },
  });

  await expect(sandbox.process.spawn("sleep", ["1"])).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });

  await expect(sandbox.snapshots.create("ready")).resolves.toEqual({
    id: "im-snapshot-created",
    name: "ready",
  });
  expect(snapshotted).toBe(true);
  await expect(
    sandbox.snapshots.restore("im-snapshot-created")
  ).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });
});
