import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import type * as ModalSdk from "modal";

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

test("modal rejects invalid declared ports before provider calls", async () => {
  let called = false;
  const client = {
    apps: {
      fromName: () => Promise.resolve({}),
    },
    images: {
      fromRegistry: () => ({}),
    },
    sandboxes: {
      create: () => {
        called = true;
        return Promise.reject(new Error("provider called"));
      },
    },
  } as unknown as ModalSdk.ModalClient;

  await expect(
    create({
      adapter: modal({
        client,
      }),
      ports: [0],
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "modal",
  });
  expect(called).toBe(false);
});

test("modal rejects invalid create timeouts before provider calls", async () => {
  let called = false;
  const client = {
    apps: {
      fromName: () => Promise.resolve({}),
    },
    images: {
      fromRegistry: () => ({}),
    },
    sandboxes: {
      create: () => {
        called = true;
        return Promise.reject(new Error("provider called"));
      },
    },
  } as unknown as ModalSdk.ModalClient;

  await expect(
    create({
      adapter: modal({
        client,
      }),
      timeout: 0,
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "modal",
  });
  expect(called).toBe(false);
});

test("modal maps create options, tags, commands, and ports", async () => {
  const execSeen: unknown[] = [];
  let appSeen: unknown;
  let createSeen: unknown;
  let imageSeen: unknown;
  let snapshotted = false;
  let tagsSeen: unknown;
  const bucket = {} as ModalSdk.CloudBucketMount;
  const probe = {} as ModalSdk.Probe;
  const proxy = {} as ModalSdk.Proxy;
  const secret = {} as ModalSdk.Secret;
  const volume = {} as ModalSdk.Volume;
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
  } as unknown as ModalSdk.Sandbox;
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
  } as unknown as ModalSdk.ModalClient;

  const sandbox = await create({
    adapter: modal({
      app: "sdk-app",
      blockNetwork: false,
      client,
      cloud: "aws",
      cloudBucketMounts: { "/bucket": bucket },
      command: ["sleep", "60"],
      cpu: 0.25,
      cpuLimit: 1,
      createAppIfMissing: false,
      customDomain: "preview.example.com",
      env: { A: "1" },
      gpu: "T4",
      h2Ports: [9090],
      idleTimeout: 1200,
      inboundCidrAllowlist: ["10.0.0.0/8"],
      includeOidcIdentityToken: true,
      memoryLimitMiB: 1024,
      memoryMiB: 512,
      name: "sdk-sandbox",
      options: { cpu: 0.5 },
      outboundCidrAllowlist: ["0.0.0.0/0"],
      ports: [3000],
      proxy,
      pty: true,
      readinessProbe: probe,
      regions: ["us-east"],
      secrets: [secret],
      tags: { owner: "sdk" },
      timeout: 123,
      unencryptedPorts: [7070],
      verbose: true,
      volumes: { "/data": volume },
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
      blockNetwork: false,
      cloud: "aws",
      cloudBucketMounts: { "/bucket": bucket },
      command: ["sleep", "60"],
      cpu: 0.25,
      cpuLimit: 1,
      customDomain: "preview.example.com",
      encryptedPorts: [8080],
      env: { A: "1", B: "2" },
      gpu: "T4",
      h2Ports: [9090],
      idleTimeoutMs: 2000,
      inboundCidrAllowlist: ["10.0.0.0/8"],
      includeOidcIdentityToken: true,
      memoryLimitMiB: 1024,
      memoryMiB: 512,
      name: "sdk-sandbox",
      outboundCidrAllowlist: ["0.0.0.0/0"],
      proxy,
      pty: true,
      readinessProbe: probe,
      regions: ["us-east"],
      secrets: [secret],
      timeoutMs: 1000,
      unencryptedPorts: [7070],
      verbose: true,
      volumes: { "/data": volume },
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
  await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
    code: "configuration",
    provider: "modal",
  });
  await expect(sandbox.ports.expose(8080)).resolves.toEqual({
    port: 8080,
    url: "https://preview.example.com",
  });

  const count = execSeen.length;
  await expect(
    sandbox.process.exec("echo", ["hello"], {
      timeout: 0,
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "modal",
  });
  expect(execSeen).toHaveLength(count);

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

test("modal writes readable streams in chunks", async () => {
  const decoder = new TextDecoder();
  const execSeen: unknown[] = [];
  const writes: string[] = [];
  let closed = false;
  let flushed = false;
  let openSeen: unknown;
  const raw = {
    exec: (command: string[], options: unknown) => {
      execSeen.push({ command, options });
      return Promise.resolve(processOutput());
    },
    open: (path: string, mode: string) => {
      openSeen = { mode, path };
      return Promise.resolve({
        close: () => {
          closed = true;
          return Promise.resolve();
        },
        flush: () => {
          flushed = true;
          return Promise.resolve();
        },
        write: (data: Uint8Array) => {
          writes.push(decoder.decode(data));
          return Promise.resolve();
        },
      });
    },
    sandboxId: "sandbox",
    terminate: () => Promise.resolve(),
  } as unknown as ModalSdk.Sandbox;
  const client = {
    apps: {
      fromName: () => Promise.resolve({}),
    },
    images: {
      fromRegistry: () => ({}),
    },
    sandboxes: {
      create: () => Promise.resolve(raw),
    },
  } as unknown as ModalSdk.ModalClient;
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("chunk-1"));
      controller.enqueue(new TextEncoder().encode("chunk-2"));
      controller.close();
    },
  });

  const sandbox = await create({
    adapter: modal({
      client,
    }),
    cwd: "/work",
  });

  await sandbox.files.write("/work/stream.txt", input);

  expect(openSeen).toEqual({ mode: "w", path: "/work/stream.txt" });
  expect(writes).toEqual(["chunk-1", "chunk-2"]);
  expect(flushed).toBe(true);
  expect(closed).toBe(true);
  expect(execSeen.at(-1)).toEqual({
    command: ["sh", "-lc", "mkdir -p /work"],
    options: {
      stderr: "pipe",
      stdout: "pipe",
      workdir: "/work",
    },
  });
});
