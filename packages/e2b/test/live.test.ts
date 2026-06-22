import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { create } from "@sandbox-sdk/core";

import { record, sourceFixture, workflowFixture } from "../../../test/fixture";
import type { Source } from "../../../test/fixture";
import { workflow } from "../../../test/workflow";
import { e2b } from "../src/index";

const enabled = Boolean(
  process.env.E2B_API_KEY || process.env.E2B_ACCESS_TOKEN
);
const live = enabled ? test : test.skip;

const withTimeout = async <Value>(
  promise: Promise<Value>,
  label: string,
  milliseconds = 60_000
): Promise<Value> => {
  const controller = new AbortController();
  const timeout = (async (): Promise<never> => {
    await delay(milliseconds, undefined, {
      signal: controller.signal,
    });
    throw new Error(`${label} timed out`);
  })();

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    controller.abort();
  }
};

const waitFor = async (
  predicate: () => boolean,
  label: string,
  milliseconds = 10_000
): Promise<void> => {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > milliseconds) {
      throw new Error(`${label} timed out`);
    }

    await delay(100);
  }
};

live("e2b runs a live sandbox workflow", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const sandbox = await create({
    adapter: e2b({ timeout: 300_000 }),
    cwd,
    env: { SANDBOX_SDK_CREATE: "create-env" },
  });

  try {
    const payload = await workflow(sandbox, {
      content: "hello from e2b",
      cwd,
      port: 3000,
    });
    await record(
      new URL("__fixtures__/workflow.json", import.meta.url),
      workflowFixture("e2b", payload, ["snapshots.create", "snapshotSource"])
    );
  } finally {
    await sandbox.stop();
  }
});

live("e2b exposes advertised raw capabilities", async () => {
  const cwd = `/tmp/sandbox-sdk-raw-${randomUUID()}`;
  let output = "";
  let watched = false;
  const sandbox = await create({
    adapter: e2b({
      network: { allowPublicTraffic: false },
      timeout: 300_000,
    }),
    cwd,
  });

  try {
    expect(await sandbox.raw.isRunning()).toBe(true);
    await sandbox.raw.setTimeout(300_000);

    const info = await sandbox.raw.getInfo();
    expect(info.network?.allowPublicTraffic).toBe(false);

    await sandbox.raw.updateNetwork({ allowInternetAccess: false });
    const restricted = await sandbox.raw.getInfo();
    expect(restricted.allowInternetAccess).toBe(false);
    await sandbox.raw.updateNetwork({});

    const metrics = await sandbox.raw.getMetrics();
    expect(Array.isArray(metrics)).toBe(true);

    const watcher = await sandbox.raw.files.watchDir(
      cwd,
      () => {
        watched = true;
      },
      { timeoutMs: 10_000 }
    );

    try {
      await sandbox.files.write(`${cwd}/watched.txt`, "watch");
      await waitFor(() => watched, "e2b file watch");
    } finally {
      await watcher.stop();
    }
    await sandbox.files.remove(`${cwd}/watched.txt`);

    await sandbox.raw.git.init(cwd, { initialBranch: "main" });
    await sandbox.files.write(`${cwd}/raw.txt`, "raw");
    await sandbox.raw.git.add(cwd, { files: ["raw.txt"] });
    const commit = await sandbox.raw.git.commit(cwd, "raw", {
      authorEmail: "sandbox@example.com",
      authorName: "sandbox sdk",
    });
    expect(commit.exitCode).toBe(0);

    const git = await sandbox.raw.git.status(cwd);
    expect(git.currentBranch).toBe("main");
    expect(git.isClean).toBe(true);

    const handle = await withTimeout(
      sandbox.raw.pty.create({
        cols: 80,
        cwd,
        onData: (chunk) => {
          output += new TextDecoder().decode(chunk);
        },
        rows: 24,
      }),
      "e2b pty create"
    );

    try {
      await sandbox.raw.pty.resize(handle.pid, { cols: 100, rows: 30 });
      await sandbox.raw.pty.sendInput(
        handle.pid,
        new TextEncoder().encode("printf raw-pty\\n")
      );
      await waitFor(() => output.includes("raw-pty"), "e2b pty output");
      expect(await withTimeout(handle.kill(), "e2b pty kill")).toBe(true);
    } finally {
      await handle.disconnect();
    }
  } finally {
    await sandbox.stop();
  }
});

live("e2b preserves process state in a live snapshot", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const file = `${cwd}/snapshot.txt`;
  const sandbox = await create({
    adapter: e2b({ timeout: 300_000 }),
    cwd,
  });
  let derived: typeof sandbox | undefined;

  try {
    await sandbox.files.write(file, "ready");
    const process = await sandbox.raw.commands.run("sleep 60", {
      background: true,
    });

    const snapshot = await sandbox.snapshots.create("sandbox-sdk-live");
    expect(snapshot.id).toBeTruthy();

    derived = await create({
      adapter: e2b({ timeout: 300_000 }),
      cwd,
      snapshot: snapshot.id,
    });

    expect(await derived.files.exists(file)).toBe(true);
    expect(await derived.files.text(file)).toBe("ready");
    const processes = await derived.raw.commands.list();
    expect(processes.some((value) => value.pid === process.pid)).toBe(true);
    const payload: Source = {
      capabilities: derived.capabilities,
      file: {
        exists: await derived.files.exists(file),
        text: await derived.files.text(file),
      },
      ok: true,
      provider: derived.provider,
      snapshot,
      source: snapshot.id,
    };
    await record(
      new URL("__fixtures__/source.json", import.meta.url),
      sourceFixture("e2b", payload, [
        "ports.expose",
        "process.exec",
        "process.shell",
        "process.spawnShell",
      ])
    );
  } finally {
    await Promise.all([derived?.stop(), sandbox.stop()]);
  }
});
