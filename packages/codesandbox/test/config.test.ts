import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { codesandbox } from "../src/index";

const commandError = (exitCode: number, output: string): Error =>
  Object.assign(new Error("command failed"), { exitCode, output });

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

test("codesandbox maps create options and normalized operations", async () => {
  let createSeen: unknown;
  let connectSeen: unknown;
  let mkdirSeen: unknown;
  let portSeen: unknown;
  let backgroundSeen: unknown;
  let runSeen: unknown;
  let shutdownSeen: string | undefined;
  let disconnected = false;
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
        mkdirSeen = { path, recursive };
        return Promise.resolve();
      },
      readFile: () => Promise.resolve(new Uint8Array([1, 2])),
      readTextFile: () => Promise.resolve("text"),
      readdir: () =>
        Promise.resolve([{ name: "file.txt", type: "file" as const }]),
      remove: () => Promise.resolve(),
      stat: () => Promise.resolve({ mtime: 1_767_225_600_000, size: 2 }),
      writeFile: () => Promise.resolve(),
      writeTextFile: () => Promise.resolve(),
    },
    ports: {
      waitForPort: (port: number) => {
        portSeen = port;
        return Promise.resolve({ host: "https://preview.csb.app", port });
      },
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
    sandboxes: {
      create: (options: unknown) => {
        createSeen = options;
        return Promise.resolve(sandbox);
      },
      delete: () => Promise.resolve(),
      hibernate: () => Promise.resolve(),
      resume: () => Promise.resolve(sandbox),
      shutdown: (id: string) => {
        shutdownSeen = id;
        return Promise.resolve();
      },
    },
  };

  const current = await create({
    adapter: codesandbox({
      client: sdk,
      description: "description",
      env: { A: "1" },
      tags: ["sandbox-sdk"],
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
    description: "description",
    hibernationTimeoutSeconds: 5,
    id: "template",
    tags: ["sandbox-sdk"],
    title: "title",
  });
  expect(connectSeen).toEqual({ env: { A: "1", B: "2" } });
  expect(mkdirSeen).toEqual({ path: "/work", recursive: true });

  await expect(current.ports.expose(3000)).resolves.toEqual({
    port: 3000,
    url: "https://preview.csb.app",
  });
  expect(portSeen).toBe(3000);
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

  await current.stop();
  expect(disconnected).toBe(true);
  expect(shutdownSeen).toBe("sandbox");
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
  try {
    await current.snapshots.create();
    throw new Error("expected snapshot creation to fail");
  } catch (error) {
    expect(error).toMatchObject({
      code: "unsupported",
      provider: "codesandbox",
    });
  }
});
