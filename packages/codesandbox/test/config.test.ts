import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { codesandbox } from "../src/index";
import type { SandboxClient, Sdk } from "../src/types";

const commandError = (exitCode: number, output: string): Error =>
  Object.assign(new Error("command failed"), { exitCode, output });

const restore = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = value;
};

test("codesandbox reports missing credentials before provider calls", async () => {
  await expect(
    create({
      adapter: codesandbox({
        token: "",
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "codesandbox",
  });
});

test("codesandbox accepts csb api key fallback", async () => {
  const codeSandboxKey = process.env.CSB_API_KEY;
  process.env.CSB_API_KEY = "codesandbox";

  try {
    let called = false;
    await expect(
      create({
        adapter: codesandbox({
          clientOptions: {
            fetch: () => {
              called = true;
              return Promise.resolve(
                new Response("provider called", { status: 500 })
              );
            },
          },
        }),
      })
    ).rejects.not.toMatchObject({
      code: "configuration",
      provider: "codesandbox",
    });
    expect(called).toBe(true);
  } finally {
    restore("CSB_API_KEY", codeSandboxKey);
  }
});

test("codesandbox rejects provider credentials in sandbox env before provider calls", async () => {
  let called = false;
  const sdk = {
    sandboxes: {
      create: () => {
        called = true;
        return Promise.reject(new Error("provider called"));
      },
    },
  };

  const error = {
    code: "configuration",
    message:
      "CodeSandbox provider credentials cannot be forwarded into sandbox env: CSB_API_KEY",
    provider: "codesandbox",
  };

  await expect(
    create({
      adapter: codesandbox({
        client: sdk,
        env: { CSB_API_KEY: "key" },
      }),
    })
  ).rejects.toMatchObject(error);
  await expect(
    create({
      adapter: codesandbox({ client: sdk }),
      env: { CSB_API_KEY: "key" },
    })
  ).rejects.toMatchObject(error);
  expect(called).toBe(false);
});

test("codesandbox rejects invalid create timeouts before provider calls", async () => {
  let called = false;
  const sdk = {
    sandboxes: {
      create: () => {
        called = true;
        return Promise.reject(new Error("provider called"));
      },
    },
  };

  await expect(
    create({
      adapter: codesandbox({
        client: sdk,
      }),
      timeout: -1,
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "codesandbox",
  });
  expect(called).toBe(false);
});

test("codesandbox rejects invalid session ids before provider calls", async () => {
  let called = false;
  const sdk = {
    sandboxes: {
      create: () => {
        called = true;
        return Promise.reject(new Error("provider called"));
      },
    },
  };

  await expect(
    create({
      adapter: codesandbox({
        client: sdk,
        session: { id: "session-id-that-is-too-long" },
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "codesandbox",
  });
  expect(called).toBe(false);
});

test("codesandbox only treats documented missing paths as absent", async () => {
  const errors = new Map([
    ["/project/sandbox/missing.txt", "null: File not found"],
    [
      "/project/sandbox/missing-os.txt",
      '2: Os { code: 2, kind: NotFound, message: "No such file or directory" }',
    ],
  ]);
  const client = {
    fs: {
      mkdir: () => Promise.resolve(),
      stat: (path: string) =>
        Promise.reject(new Error(errors.get(path) ?? "session unavailable")),
    },
    workspacePath: "/project/sandbox",
  } as unknown as SandboxClient;
  const sandbox = {
    connect: () => Promise.resolve(client),
    id: "sandbox",
  };
  const sdk = {
    sandboxes: {
      create: () => Promise.resolve(sandbox),
    },
  } as unknown as Sdk;

  const current = await create({ adapter: codesandbox({ client: sdk }) });

  await expect(current.files.exists("missing.txt")).resolves.toBe(false);
  await expect(current.files.exists("missing-os.txt")).resolves.toBe(false);
  await expect(current.files.exists("unavailable.txt")).rejects.toMatchObject({
    code: "provider",
    provider: "codesandbox",
  });
});

test("codesandbox maps create options and normalized operations", async () => {
  let createSeen: unknown;
  let connectSeen: unknown;
  let mkdirSeen: unknown;
  let portSeen: unknown;
  let backgroundSeen: unknown;
  const fileSeen: unknown[] = [];
  let hostSeen: unknown;
  let runSeen: unknown;
  let shutdownSeen: string | undefined;
  let disconnected = false;
  let hibernated: string | undefined;
  let killed = false;
  const background = {
    command: "sleep 1",
    kill: () => {
      killed = true;
      return Promise.resolve();
    },
    name: "background",
    onOutput: () => ({ dispose: () => {} }),
    open: () => Promise.resolve(""),
    waitUntilComplete: () => Promise.resolve("done"),
  };
  const client = {
    commands: {
      run: (line: string, options: unknown) => {
        runSeen = { line, options };
        return Promise.resolve("ok");
      },
      runBackground: (line: string, options: unknown) => {
        backgroundSeen = { line, options };
        return Promise.resolve(background);
      },
    },
    disconnect: () => {
      disconnected = true;
      return Promise.resolve();
    },
    fs: {
      mkdir: (path: string, recursive?: boolean) => {
        fileSeen.push({ method: "mkdir", path, recursive });
        mkdirSeen = { path, recursive };
        return Promise.resolve();
      },
      readFile: (path: string) => {
        fileSeen.push({ method: "readFile", path });
        return Promise.resolve(new Uint8Array([1, 2]));
      },
      readTextFile: (path: string) => {
        fileSeen.push({ method: "readTextFile", path });
        return Promise.resolve("text");
      },
      readdir: (path: string) => {
        fileSeen.push({ method: "readdir", path });
        return Promise.resolve([{ name: "file.txt", type: "file" as const }]);
      },
      remove: (path: string, recursive?: boolean) => {
        fileSeen.push({ method: "remove", path, recursive });
        return Promise.resolve();
      },
      stat: (path: string) => {
        fileSeen.push({ method: "stat", path });
        return Promise.resolve({ mtime: 1_767_225_600_000, size: 2 });
      },
      watch: () =>
        Promise.resolve({
          dispose: () => {},
          onEvent: () => ({ dispose: () => {} }),
        }),
      writeFile: (path: string) => {
        fileSeen.push({ method: "writeFile", path });
        return Promise.resolve();
      },
      writeTextFile: (path: string, value: string) => {
        fileSeen.push({ method: "writeTextFile", path, value });
        return Promise.resolve();
      },
    },
    hosts: {
      getUrl: (port: number, protocol?: string) => {
        hostSeen = { port, protocol };
        return `${protocol ?? "https"}://sandbox-${port}.csb.app`;
      },
    },
    interpreters: {
      javascript: () => Promise.resolve("javascript"),
      python: () => Promise.resolve("python"),
    },
    ports: {
      get: () => Promise.resolve(),
      getAll: () => Promise.resolve([]),
      waitForPort: (port: number) => {
        portSeen = port;
        return Promise.resolve({ host: "https://preview.csb.app", port });
      },
    },
    setup: {
      currentStepIndex: 0,
      getSteps: () => [],
      run: () => Promise.resolve(),
      status: "IDLE",
      waitUntilComplete: () => Promise.resolve(),
    },
    tasks: {
      get: () => Promise.resolve(),
      getAll: () => Promise.resolve([]),
    },
    terminals: {
      create: () =>
        Promise.resolve({
          id: "terminal",
          kill: () => Promise.resolve(),
          name: "terminal",
          onOutput: () => ({ dispose: () => {} }),
          open: () => Promise.resolve(""),
          run: () => Promise.resolve(),
          write: () => Promise.resolve(),
        }),
      get: () => Promise.resolve(),
      getAll: () => Promise.resolve([]),
    },
    workspacePath: "/project/sandbox",
  };
  const sandbox = {
    connect: (options: unknown) => {
      connectSeen = options;
      return Promise.resolve(client);
    },
    id: "sandbox",
  };
  const sdk = {
    hosts: {
      getUrl: (
        token: { sandboxId: string; token: string },
        port: number,
        protocol?: string
      ) => {
        hostSeen = { port, protocol, token };
        return `${protocol ?? "https"}://${token.sandboxId}-${port}.csb.app?preview_token=${token.token}`;
      },
    },
    sandboxes: {
      create: (options: unknown) => {
        createSeen = options;
        return Promise.resolve(sandbox);
      },
      delete: () => Promise.resolve(),
      hibernate: (id: string) => {
        hibernated = id;
        return Promise.resolve();
      },
      resume: () => Promise.resolve(sandbox),
      shutdown: (id: string) => {
        shutdownSeen = id;
        return Promise.resolve();
      },
    },
  };

  const current = await create({
    adapter: codesandbox({
      automaticWakeupConfig: {
        http: true,
        websocket: false,
      },
      client: sdk,
      description: "description",
      env: { A: "1" },
      tags: ["sandbox-sdk"],
      timeout: 3000,
      title: "title",
    }),
    cwd: "/work",
    env: { B: "2" },
    template: "template",
    timeout: 4500,
  });

  expect(current.id).toBe("sandbox");
  expect(current.cwd).toBe("/work");
  expect(createSeen).toMatchObject({
    automaticWakeupConfig: {
      http: true,
      websocket: false,
    },
    description: "description",
    hibernationTimeoutSeconds: 5,
    id: "template",
    tags: ["sandbox-sdk"],
    title: "title",
  });
  expect(connectSeen).toEqual({ env: { A: "1", B: "2" } });
  expect(mkdirSeen).toEqual({ path: "/work", recursive: true });
  fileSeen.length = 0;

  await current.files.write("data.txt", "value");
  await expect(current.files.text("data.txt")).resolves.toBe("text");
  await expect(current.files.read("data.txt")).resolves.toEqual(
    new Uint8Array([1, 2])
  );
  await expect(current.files.list()).resolves.toEqual([
    {
      kind: "file",
      modified: new Date(1_767_225_600_000),
      path: "/work/file.txt",
      size: 2,
    },
  ]);
  await current.files.remove("data.txt");
  expect(fileSeen).toEqual([
    { method: "mkdir", path: "/work", recursive: true },
    { method: "writeTextFile", path: "/work/data.txt", value: "value" },
    { method: "readTextFile", path: "/work/data.txt" },
    { method: "readFile", path: "/work/data.txt" },
    { method: "readdir", path: "/work" },
    { method: "stat", path: "/work/file.txt" },
    { method: "remove", path: "/work/data.txt", recursive: true },
  ]);

  await expect(current.ports.expose(3000)).resolves.toEqual({
    port: 3000,
    url: "https://sandbox-3000.csb.app",
  });
  expect(portSeen).toBe(3000);
  expect(hostSeen).toEqual({ port: 3000, protocol: undefined });
  const host = { host: "preview.example.com" };
  portSeen = undefined;
  hostSeen = undefined;
  await expect(current.ports.expose(3000, host)).rejects.toMatchObject({
    code: "unsupported",
    provider: "codesandbox",
  });
  expect(portSeen).toBeUndefined();
  expect(hostSeen).toBeUndefined();
  client.ports.waitForPort = (port: number) => {
    portSeen = port;
    return Promise.resolve({ host: "preview.csb.app", port });
  };
  await expect(
    current.ports.expose(3000, { protocol: "http" })
  ).resolves.toEqual({
    port: 3000,
    url: "http://sandbox-3000.csb.app",
  });
  expect(hostSeen).toEqual({ port: 3000, protocol: "http" });
  await expect(
    current.ports.expose(3000, { token: "private" })
  ).resolves.toEqual({
    port: 3000,
    url: "https://sandbox-3000.csb.app?preview_token=private",
  });
  expect(hostSeen).toEqual({
    port: 3000,
    protocol: undefined,
    token: { sandboxId: "sandbox", token: "private" },
  });
  portSeen = undefined;
  await expect(current.ports.expose(0)).rejects.toMatchObject({
    code: "configuration",
    provider: "codesandbox",
  });
  expect(portSeen).toBeUndefined();

  await expect(
    current.process.exec("echo", ["hello world"], {
      timeout: -1,
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "codesandbox",
  });
  expect(runSeen).toBeUndefined();
  expect(backgroundSeen).toBeUndefined();

  await expect(
    current.process.exec("echo", ["hello world"], {
      cwd: "/tmp",
      env: { C: "3" },
    })
  ).resolves.toMatchObject({
    code: 0,
    ok: true,
    stdout: "ok",
  });
  expect(runSeen).toEqual({
    line: "echo 'hello world'",
    options: { cwd: "/tmp", env: { C: "3" } },
  });

  await expect(
    current.process.exec("sleep", ["1"], {
      timeout: 2500,
    })
  ).resolves.toMatchObject({
    code: 0,
    ok: true,
    stdout: "done",
  });
  expect(backgroundSeen).toEqual({
    line: "sleep 1",
    options: { cwd: "/work" },
  });

  const running = await current.process.spawnShell("sleep 1");
  await running.kill();
  expect(killed).toBe(true);
  await expect(current.snapshots.create("ready")).resolves.toEqual({
    id: "sandbox",
    name: "ready",
  });
  expect(hibernated).toBe("sandbox");

  await current.stop();
  expect(disconnected).toBe(true);
  expect(shutdownSeen).toBe("sandbox");
});

test("codesandbox uses adapter timeout when create input omits one", async () => {
  let createSeen: unknown;
  const client = {
    commands: {
      run: () => Promise.resolve("ok"),
      runBackground: () =>
        Promise.resolve({
          command: "sleep 1",
          kill: () => Promise.resolve(),
          onOutput: () => ({ dispose: () => {} }),
          open: () => Promise.resolve(""),
          waitUntilComplete: () => Promise.resolve(""),
        }),
    },
    disconnect: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve(),
      readFile: () => Promise.resolve(new Uint8Array()),
      readTextFile: () => Promise.resolve(""),
      readdir: () => Promise.resolve([]),
      remove: () => Promise.resolve(),
      stat: () => Promise.resolve({ mtime: 0, size: 0 }),
      writeFile: () => Promise.resolve(),
      writeTextFile: () => Promise.resolve(),
    },
    ports: {
      waitForPort: () =>
        Promise.resolve({ host: "https://preview.csb.app", port: 3000 }),
    },
    workspacePath: "/project/sandbox",
  };
  const sandbox = {
    connect: () => Promise.resolve(client),
    id: "sandbox",
  };
  const sdk = {
    sandboxes: {
      create: (options: unknown) => {
        createSeen = options;
        return Promise.resolve(sandbox);
      },
      delete: () => Promise.resolve(),
      hibernate: () => Promise.resolve(),
      resume: () => Promise.resolve(sandbox),
      shutdown: () => Promise.resolve(),
    },
  };

  await create({
    adapter: codesandbox({
      client: sdk,
      timeout: 2500,
    }),
  });

  expect(createSeen).toMatchObject({
    hibernationTimeoutSeconds: 3,
  });
});

test("codesandbox starts from a normalized snapshot source", async () => {
  let createSeen: unknown;
  const client = {
    commands: {
      run: () => Promise.resolve("ok"),
      runBackground: () =>
        Promise.resolve({
          command: "sleep 1",
          kill: () => Promise.resolve(),
          onOutput: () => ({ dispose: () => {} }),
          open: () => Promise.resolve(""),
          waitUntilComplete: () => Promise.resolve(""),
        }),
    },
    disconnect: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve(),
      readFile: () => Promise.resolve(new Uint8Array()),
      readTextFile: () => Promise.resolve(""),
      readdir: () => Promise.resolve([]),
      remove: () => Promise.resolve(),
      stat: () => Promise.resolve({ mtime: 0, size: 0 }),
      writeFile: () => Promise.resolve(),
      writeTextFile: () => Promise.resolve(),
    },
    ports: {
      waitForPort: () =>
        Promise.resolve({ host: "https://preview.csb.app", port: 3000 }),
    },
    workspacePath: "/project/sandbox",
  };
  const sandbox = {
    connect: () => Promise.resolve(client),
    id: "sandbox",
  };
  const sdk = {
    sandboxes: {
      create: (options: unknown) => {
        createSeen = options;
        return Promise.resolve(sandbox);
      },
      delete: () => Promise.resolve(),
      hibernate: () => Promise.resolve(),
      resume: () => Promise.resolve(sandbox),
      shutdown: () => Promise.resolve(),
    },
  };

  const current = await create({
    adapter: codesandbox({ client: sdk }),
    snapshot: "snapshot-source",
  });

  expect(current.capabilities.snapshotCreate).toBe("memory");
  expect(current.capabilities.snapshotRestore).toBe(false);
  expect(current.capabilities.snapshotSource).toBe("create-time");
  expect(createSeen).toMatchObject({ id: "snapshot-source" });
});

test("codesandbox returns non-zero command results", async () => {
  const client = {
    commands: {
      run: () => Promise.reject(commandError(2, "bad")),
      runBackground: () => Promise.reject(commandError(2, "bad")),
    },
    disconnect: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve(),
      readFile: () => Promise.resolve(new Uint8Array()),
      readTextFile: () => Promise.resolve(""),
      readdir: () => Promise.resolve([]),
      remove: () => Promise.resolve(),
      stat: () => Promise.resolve({ mtime: 0, size: 0 }),
      writeFile: () => Promise.resolve(),
      writeTextFile: () => Promise.resolve(),
    },
    ports: {
      waitForPort: () =>
        Promise.resolve({ host: "https://preview", port: 3000 }),
    },
    workspacePath: "/project/sandbox",
  };
  const sandbox = {
    connect: () => Promise.resolve(client),
    id: "sandbox",
  };
  const sdk = {
    sandboxes: {
      create: () => Promise.resolve(sandbox),
      delete: () => Promise.resolve(),
      hibernate: () => Promise.resolve(),
      resume: () => Promise.resolve(sandbox),
      shutdown: () => Promise.resolve(),
    },
  };

  const current = await create({ adapter: codesandbox({ client: sdk }) });

  await expect(current.process.shell("exit 2")).resolves.toMatchObject({
    code: 2,
    ok: false,
    stdout: "bad",
  });
  await expect(current.snapshots.restore("snapshot")).rejects.toMatchObject({
    code: "unsupported",
    provider: "codesandbox",
  });
});

test("codesandbox aborts signal-backed exec by killing the background command", async () => {
  let killed = false;
  const background = {
    command: "sleep 10",
    kill: () => {
      killed = true;
      return Promise.resolve();
    },
    name: "background",
    onOutput: () => ({ dispose: () => {} }),
    open: () => Promise.resolve(""),
    waitUntilComplete: async () => {
      for (;;) {
        if (killed) {
          return "done";
        }
        await Bun.sleep(1);
      }
    },
  };
  const client = {
    commands: {
      run: () => Promise.resolve("ok"),
      runBackground: () => Promise.resolve(background),
    },
    disconnect: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve(),
      readFile: () => Promise.resolve(new Uint8Array()),
      readTextFile: () => Promise.resolve(""),
      readdir: () => Promise.resolve([]),
      remove: () => Promise.resolve(),
      stat: () => Promise.resolve({ mtime: 0, size: 0 }),
      writeFile: () => Promise.resolve(),
      writeTextFile: () => Promise.resolve(),
    },
    ports: {
      waitForPort: () =>
        Promise.resolve({ host: "https://preview", port: 3000 }),
    },
    workspacePath: "/project/sandbox",
  };
  const sandbox = {
    connect: () => Promise.resolve(client),
    id: "sandbox",
  };
  const sdk = {
    sandboxes: {
      create: () => Promise.resolve(sandbox),
      delete: () => Promise.resolve(),
      hibernate: () => Promise.resolve(),
      resume: () => Promise.resolve(sandbox),
      shutdown: () => Promise.resolve(),
    },
  };

  const current = await create({ adapter: codesandbox({ client: sdk }) });
  const controller = new AbortController();
  const output = current.process.exec("sleep", ["10"], {
    signal: controller.signal,
  });

  await Promise.resolve();
  controller.abort("stopped");

  await expect(output).rejects.toMatchObject({
    code: "aborted",
    provider: "codesandbox",
  });
  expect(killed).toBe(true);
});

test("codesandbox kills spawned commands on abort", async () => {
  let killed = false;
  const background = {
    command: "sleep 10",
    kill: () => {
      killed = true;
      return Promise.resolve();
    },
    name: "background",
    onOutput: () => ({ dispose: () => {} }),
    open: () => Promise.resolve(""),
    waitUntilComplete: async () => {
      for (;;) {
        if (killed) {
          return "";
        }
        await Bun.sleep(1);
      }
    },
  };
  const client = {
    commands: {
      run: () => Promise.resolve("ok"),
      runBackground: () => Promise.resolve(background),
    },
    disconnect: () => Promise.resolve(),
    fs: {
      mkdir: () => Promise.resolve(),
      readFile: () => Promise.resolve(new Uint8Array()),
      readTextFile: () => Promise.resolve(""),
      readdir: () => Promise.resolve([]),
      remove: () => Promise.resolve(),
      stat: () => Promise.resolve({ mtime: 0, size: 0 }),
      writeFile: () => Promise.resolve(),
      writeTextFile: () => Promise.resolve(),
    },
    ports: {
      waitForPort: () =>
        Promise.resolve({ host: "https://preview", port: 3000 }),
    },
    workspacePath: "/project/sandbox",
  };
  const sandbox = {
    connect: () => Promise.resolve(client),
    id: "sandbox",
  };
  const sdk = {
    sandboxes: {
      create: () => Promise.resolve(sandbox),
      delete: () => Promise.resolve(),
      hibernate: () => Promise.resolve(),
      resume: () => Promise.resolve(sandbox),
      shutdown: () => Promise.resolve(),
    },
  };

  const current = await create({ adapter: codesandbox({ client: sdk }) });
  const controller = new AbortController();
  const running = await current.process.spawnShell("sleep 10", {
    signal: controller.signal,
  });

  controller.abort("stopped");
  await running.result;

  expect(killed).toBe(true);
});
