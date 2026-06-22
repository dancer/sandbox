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

test("modal rejects provider credentials in sandbox env before provider calls", async () => {
  let called = false;
  const client = {
    apps: {
      fromName: () => {
        called = true;
        return Promise.resolve({});
      },
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
        env: {
          MODAL_TOKEN_SECRET: "secret",
        },
      }),
      env: {
        MODAL_TOKEN_ID: "id",
      },
    })
  ).rejects.toMatchObject({
    code: "configuration",
    message:
      "Modal provider credentials cannot be forwarded into sandbox env: MODAL_TOKEN_ID, MODAL_TOKEN_SECRET",
    provider: "modal",
  });
  expect(called).toBe(false);
});

test("modal rejects ambiguous image configuration before provider calls", async () => {
  let called = false;
  const client = {
    apps: {
      fromName: () => {
        called = true;
        return Promise.resolve({});
      },
    },
  } as unknown as ModalSdk.ModalClient;

  await expect(
    create({
      adapter: modal({
        client,
        image: "alpine:3.21",
        namedImage: "sandbox-base:v1",
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "modal",
  });
  expect(called).toBe(false);
});

test("modal rejects invalid snapshot retention before provider calls", async () => {
  let called = false;
  const client = {
    apps: {
      fromName: () => {
        called = true;
        return Promise.resolve({});
      },
    },
  } as unknown as ModalSdk.ModalClient;

  await expect(
    create({
      adapter: modal({
        client,
        snapshotTtl: 1500,
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "modal",
  });
  expect(called).toBe(false);
});

test("modal cleans up a created sandbox when workspace setup fails", async () => {
  let terminated = false;
  const raw = {
    filesystem: {
      makeDirectory: () => Promise.reject(new Error("mkdir failed")),
    },
    terminate: () => {
      terminated = true;
      return Promise.reject(new Error("cleanup failed"));
    },
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

  await expect(
    create({
      adapter: modal({ client }),
    })
  ).rejects.toThrow("mkdir failed");
  expect(terminated).toBe(true);
});

test("modal resolves named images explicitly", async () => {
  let namedSeen: unknown;
  const raw = {
    filesystem: {
      makeDirectory: () => Promise.resolve(),
    },
    sandboxId: "sandbox",
  } as unknown as ModalSdk.Sandbox;
  const client = {
    apps: {
      fromName: () => Promise.resolve({}),
    },
    images: {
      fromName: (name: string, options: unknown) => {
        namedSeen = { name, options };
        return Promise.resolve({});
      },
    },
    sandboxes: {
      create: () => Promise.resolve(raw),
    },
  } as unknown as ModalSdk.ModalClient;

  await create({
    adapter: modal({
      client,
      environment: "main",
      namedImage: "sandbox-base:v1",
    }),
  });

  expect(namedSeen).toEqual({
    name: "sandbox-base:v1",
    options: { environment: "main" },
  });
});

test("modal maps create options, tags, commands, and ports", async () => {
  const execSeen: unknown[] = [];
  let appSeen: unknown;
  let createSeen: unknown;
  let imageSeen: unknown;
  const directories: unknown[] = [];
  let detached = false;
  let snapshotCalls = 0;
  let snapshotSeen: unknown;
  let tagsSeen: unknown;
  let terminated = false;
  let tunnelCalls = 0;
  const bucket = {} as ModalSdk.CloudBucketMount;
  const probe = {} as ModalSdk.Probe;
  const proxy = {} as ModalSdk.Proxy;
  const secret = {} as ModalSdk.Secret;
  const volume = {} as ModalSdk.Volume;
  const raw = {
    detach: () => {
      detached = true;
    },
    exec: (command: string[], options: unknown) => {
      execSeen.push({ command, options });
      return Promise.resolve(processOutput());
    },
    filesystem: {
      makeDirectory: (path: string, options: unknown) => {
        directories.push({ options, path });
        return Promise.resolve();
      },
    },
    sandboxId: "sandbox",
    setTags: (tags: unknown) => {
      tagsSeen = tags;
      return Promise.resolve();
    },
    snapshotFilesystem: (options: unknown) => {
      snapshotSeen = options;
      snapshotCalls += 1;
      return Promise.resolve({ imageId: "im-snapshot-created" });
    },
    terminate: () => {
      terminated = true;
      return Promise.resolve();
    },
    tunnels: () => {
      tunnelCalls += 1;
      return Promise.resolve({
        8080: {
          url: "https://preview.example.com",
        },
      });
    },
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
      experimentalOptions: { waitUntilReady: true },
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
      outboundDomainAllowlist: ["api.example.com"],
      ports: [3000],
      proxy,
      pty: true,
      readinessProbe: probe,
      regions: ["us-east"],
      secrets: [secret],
      snapshotTimeout: 1200,
      snapshotTtl: 3_600_000,
      stop: "detach",
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
      experimentalOptions: { waitUntilReady: true },
      gpu: "T4",
      h2Ports: [9090],
      idleTimeoutMs: 2000,
      inboundCidrAllowlist: ["10.0.0.0/8"],
      includeOidcIdentityToken: true,
      memoryLimitMiB: 1024,
      memoryMiB: 512,
      name: "sdk-sandbox",
      outboundCidrAllowlist: ["0.0.0.0/0"],
      outboundDomainAllowlist: ["api.example.com"],
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
  expect(directories).toContainEqual({
    options: { createParents: true },
    path: "/work",
  });

  await expect(sandbox.ports.expose(3000)).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });
  expect(tunnelCalls).toBe(0);
  await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
    code: "configuration",
    provider: "modal",
  });
  await expect(
    sandbox.ports.expose(8080, { token: "private" })
  ).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });
  expect(tunnelCalls).toBe(0);
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

  await expect(sandbox.snapshots.create()).resolves.toEqual({
    id: "im-snapshot-created",
  });
  expect(snapshotCalls).toBe(1);
  expect(snapshotSeen).toEqual({
    timeoutMs: 2000,
    ttlMs: 3_600_000,
  });
  await expect(sandbox.snapshots.create("ready")).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });
  expect(snapshotCalls).toBe(1);
  await expect(
    sandbox.snapshots.restore("im-snapshot-created")
  ).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });

  await sandbox.stop();
  expect(detached).toBe(true);
  expect(terminated).toBe(false);
});

test("modal discovers existing tunnels when reconnecting by id", async () => {
  const raw = {
    sandboxId: "sb-reconnected",
    tunnels: () =>
      Promise.resolve({
        8080: { url: "https://reconnected.example.com" },
      }),
  } as unknown as ModalSdk.Sandbox;
  const client = {
    sandboxes: {
      fromId: (id: string) => {
        expect(id).toBe("sb-reconnected");
        return Promise.resolve(raw);
      },
    },
  } as unknown as ModalSdk.ModalClient;

  const sandbox = await create({
    adapter: modal({ client }),
    id: "sb-reconnected",
  });

  await expect(sandbox.ports.expose(8080)).resolves.toEqual({
    port: 8080,
    url: "https://reconnected.example.com",
  });
  await expect(sandbox.ports.expose(3000)).rejects.toMatchObject({
    code: "unsupported",
    provider: "modal",
  });
});

test("modal writes readable streams in chunks", async () => {
  const decoder = new TextDecoder();
  const directories: unknown[] = [];
  const writes: string[] = [];
  let closed = false;
  let execSeen: unknown;
  const raw = {
    exec: (command: string[], options: unknown) => {
      execSeen = { command, options };
      return Promise.resolve({
        stderr: {
          readBytes: () => Promise.resolve(new Uint8Array()),
        },
        stdin: new WritableStream<Uint8Array>({
          close() {
            closed = true;
          },
          write(data) {
            writes.push(decoder.decode(data));
          },
        }),
        stdout: {
          readBytes: () => Promise.resolve(new Uint8Array()),
        },
        wait: () => Promise.resolve(0),
      });
    },
    filesystem: {
      makeDirectory: (path: string, options: unknown) => {
        directories.push({ options, path });
        return Promise.resolve();
      },
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

  await sandbox.files.write("stream.txt", input);

  expect(execSeen).toEqual({
    command: [
      "sh",
      "-c",
      'mkdir -p "$(dirname -- "$1")" && cat > "$1"',
      "sandbox-sdk",
      "/work/stream.txt",
    ],
    options: {
      mode: "binary",
      stderr: "pipe",
      stdout: "pipe",
    },
  });
  expect(directories).toEqual([
    { options: { createParents: true }, path: "/work" },
  ]);
  expect(writes).toEqual(["chunk-1", "chunk-2"]);
  expect(closed).toBe(true);
});
