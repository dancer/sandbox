import { beforeEach, expect, mock, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { cloudflare } from "../src/index";

let failure: Error | undefined;
let read: unknown;
let written: unknown;
let directory: unknown;
const files = new Map<string, string>();

void mock.module("@cloudflare/sandbox", () => ({
  Files: mock(() => ({
    mkdir: (path: string) => {
      directory = path;
      return failure === undefined
        ? Promise.resolve()
        : Promise.reject(new Error("setup failed", { cause: failure }));
    },
    readDirectory: () => Promise.resolve([{ name: "file.txt", type: "file" }]),
    readFile: (path: string) => {
      read = path;
      const value = files.get(path);
      return value === undefined
        ? Promise.reject(
            Object.assign(new Error("missing"), { code: "ENOENT" })
          )
        : Promise.resolve(new Response(value));
    },
    remove: () => Promise.resolve(),
    stat: (path: string) =>
      files.has(path)
        ? Promise.resolve()
        : Promise.reject(
            Object.assign(new Error("missing"), { code: "ENOENT" })
          ),
    writeFile: (path: string, value: unknown) => {
      written = { path, value };
      return Promise.resolve();
    },
  })),
}));

const stream = (value: string): ReadableStream<Uint8Array> =>
  new Blob([value]).stream();
const container = (running = false) => ({
  destroy: mock(() => Promise.resolve()),
  exec: mock((_argv: string[], _options?: ContainerExecOptions) =>
    Promise.resolve({
      exitCode: Promise.resolve(0),
      kill: mock(),
      pid: 42,
      stderr: stream("err"),
      stdout: stream("out"),
    })
  ),
  images: { sandbox: "image" },
  running,
  setInactivityTimeout: mock((_timeout: number) => Promise.resolve()),
  snapshotContainer: mock((options?: ContainerSnapshotOptions) =>
    Promise.resolve({
      id: "snapshot",
      name: options?.name,
    })
  ),
  start: mock((_options: ContainerStartupOptions) => void 0),
});

type Native = ReturnType<typeof container>;
const adapter = (raw: Native) =>
  cloudflare({ container: raw as unknown as Container });

beforeEach(() => {
  failure = undefined;
  read = undefined;
  written = undefined;
  directory = undefined;
  files.clear();
});

test("cloudflare starts native containers with separate process defaults", async () => {
  const raw = container();
  const sandbox = await create({
    adapter: cloudflare({
      container: raw as unknown as Container,
      env: { A: "default" },
      startup: { enableInternet: false },
    }),
    cwd: "/work",
    env: { B: "input" },
    timeout: 30_000,
  });
  expect(raw.start).toHaveBeenCalledWith({
    enableInternet: false,
    env: { A: "default", B: "input" },
    image: "image",
  });
  expect(raw.setInactivityTimeout).toHaveBeenCalledWith(30_000);
  expect(directory).toBe("/work");
  expect(sandbox.raw).toBe(raw as unknown as Container);
  await sandbox.process.exec("printf", ["%s", "literal; value"], {
    env: { A: "command" },
  });
  expect(raw.exec).toHaveBeenCalledWith(
    ["printf", "%s", "literal; value"],
    expect.objectContaining({ cwd: "/work", env: { A: "command", B: "input" } })
  );
});

test("cloudflare preserves existing containers during setup", async () => {
  const raw = container(true);
  await create({ adapter: adapter(raw) });
  expect(raw.start).not.toHaveBeenCalled();
  failure = new Error("setup failed");
  await expect(create({ adapter: adapter(raw) })).rejects.toMatchObject({
    code: "provider",
  });
  expect(raw.destroy).not.toHaveBeenCalled();
});

test("cloudflare cleans up containers it started when setup fails", async () => {
  const raw = container();
  failure = new Error("setup failed");
  await expect(create({ adapter: adapter(raw) })).rejects.toMatchObject({
    code: "provider",
  });
  expect(raw.destroy).toHaveBeenCalledTimes(1);
});

test("cloudflare resolves file paths and preserves streaming writes", async () => {
  const sandbox = await create({ adapter: adapter(container()), cwd: "/work" });
  files.set("/work/file.txt", "content");
  expect(await sandbox.files.text("file.txt")).toBe("content");
  expect(read).toBe("/work/file.txt");
  expect(await sandbox.files.exists("missing")).toBe(false);
  await expect(sandbox.files.read("missing")).rejects.toMatchObject({
    code: "not_found",
  });
  const input = stream("write");
  await sandbox.files.write("file.txt", input);
  expect(written).toEqual({ path: "/work/file.txt", value: input });
  expect(await sandbox.files.list()).toEqual([
    { kind: "file", path: "/work/file.txt" },
  ]);
});

test("cloudflare exposes separate streams and captured process results", async () => {
  const sandbox = await create({ adapter: adapter(container()) });
  const running = await sandbox.process.spawnShell("printf out");
  const [stdout, stderr, output, result] = await Promise.all([
    new Response(running.stdout).text(),
    new Response(running.stderr).text(),
    new Response(running.output).text(),
    running.result,
  ]);
  expect(stdout).toBe("out");
  expect(stderr).toBe("err");
  expect(output).toContain("out");
  expect(output).toContain("err");
  expect(result).toMatchObject({ code: 0, stderr: "err", stdout: "out" });
});

test("cloudflare rejects aborted commands and invalid durations before execution", async () => {
  const raw = container();
  const sandbox = await create({ adapter: adapter(raw) });
  const controller = new AbortController();
  controller.abort();
  await expect(
    sandbox.process.shell("true", { signal: controller.signal })
  ).rejects.toMatchObject({ code: "aborted" });
  await expect(
    sandbox.process.shell("true", { timeout: -1 })
  ).rejects.toMatchObject({ code: "configuration" });
  expect(raw.exec).not.toHaveBeenCalled();
});

test("cloudflare requires explicit preview routing and retains private headers", async () => {
  const sandbox = await create({ adapter: adapter(container()) });
  expect(sandbox.capabilities.ports).toBe(false);
  await expect(sandbox.ports.expose(8080)).rejects.toMatchObject({
    code: "unsupported",
  });
  const routed = await create({
    adapter: cloudflare({
      container: container() as unknown as Container,
      preview: (port) => ({
        headers: { authorization: "Bearer private" },
        port,
        url: "https://preview.example",
      }),
    }),
  });
  expect(routed.capabilities.ports).toBe("dynamic");
  const preview = await routed.ports.expose(3000);
  expect(JSON.stringify(preview)).not.toContain("private");
  await expect(routed.ports.expose(0)).rejects.toMatchObject({
    code: "configuration",
  });
});

test("cloudflare uses filesystem snapshots without claiming snapshot deletion", async () => {
  const raw = container();
  const sandbox = await create({ adapter: adapter(raw), snapshot: "source" });
  expect(raw.start).toHaveBeenCalledWith({
    containerSnapshot: { id: "source" },
    env: {},
  });
  expect(await sandbox.snapshots.create("checkpoint")).toEqual({
    id: "snapshot",
    name: "checkpoint",
  });
  await sandbox.snapshots.restore("snapshot");
  expect(raw.destroy).toHaveBeenCalledTimes(1);
  expect(raw.start).toHaveBeenLastCalledWith({
    containerSnapshot: { id: "snapshot" },
    env: {},
  });
  await expect(sandbox.snapshots.delete("snapshot")).rejects.toMatchObject({
    code: "unsupported",
  });
  await expect(
    create({ adapter: adapter(container(true)), snapshot: "source" })
  ).rejects.toMatchObject({ code: "configuration" });
});

test("cloudflare kills running commands on timeout and abort", async () => {
  const raw = container();
  let completion = Promise.withResolvers<number>();
  const kill = mock(() => completion.resolve(143));
  raw.exec.mockImplementation(() => {
    completion = Promise.withResolvers<number>();
    return Promise.resolve({
      exitCode: completion.promise,
      kill,
      pid: 42,
      stderr: stream(""),
      stdout: stream("partial"),
    });
  });
  const sandbox = await create({ adapter: adapter(raw) });
  await expect(
    sandbox.process.shell("sleep 60", { timeout: 1 })
  ).rejects.toMatchObject({ code: "timeout" });
  const controller = new AbortController();
  const running = await sandbox.process.spawnShell("sleep 60", {
    signal: controller.signal,
  });
  controller.abort();
  await expect(running.result).rejects.toMatchObject({ code: "aborted" });
  expect(kill).toHaveBeenCalledTimes(2);
});

test("cloudflare classifies timeout while native execution is starting", async () => {
  const raw = container();
  raw.exec.mockImplementation((_argv, options) => {
    const completion = Promise.withResolvers<never>();
    options?.signal?.addEventListener(
      "abort",
      () => completion.reject(new Error("cancelled")),
      { once: true }
    );
    return completion.promise;
  });
  const sandbox = await create({ adapter: adapter(raw) });
  await expect(
    sandbox.process.shell("true", { timeout: 1 })
  ).rejects.toMatchObject({ code: "timeout" });
});
