import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { expectSource, expectWorkflow, source, workflow } from "./behavior";
import {
  adapter,
  cleanup,
  cleanupSnapshot,
  cwd,
  enabled,
  path,
  record,
  sourceFixture,
  workflowFixture,
} from "./fixture";
import type { LiveSandbox } from "./fixture";

const live = enabled() ? test : test.skip;

const readPreview = async (url: string): Promise<string> => {
  let failure: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
      failure = new Error(`preview responded ${response.status}`);
    } catch (error) {
      failure = error;
    }
    await Bun.sleep(1000);
  }
  throw new Error("preview did not become reachable", { cause: failure });
};

live("vercel runs a live sandbox workflow", async () => {
  const file = path("workflow");
  const sandbox = await create({
    adapter: adapter(),
    cwd,
    env: { SANDBOX_SDK_CREATE: "create-env" },
    ports: [3000],
  });

  try {
    const payload = await workflow(sandbox, cwd, file, "hello from vercel");
    expectWorkflow(payload);
    await record("workflow", workflowFixture(payload));
  } finally {
    await cleanup(sandbox);
  }
});

live("vercel supports the latest typed node runtime", async () => {
  const sandbox = await create({
    adapter: adapter({ ports: [], runtime: "node26" }),
    cwd,
  });

  try {
    const output = await sandbox.process.exec("node", ["--version"]);
    expect(output.code).toBe(0);
    expect(output.stdout.trim()).toMatch(/^v26\./u);
  } finally {
    await cleanup(sandbox);
  }
});

live("vercel creates and starts from a live snapshot", async () => {
  const file = path("snapshot");
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });
  let derived: LiveSandbox | undefined;
  let snapshotId: string | undefined;

  try {
    await sandbox.files.write(file, "ready");

    const snapshot = await sandbox.snapshots.create();
    expect(snapshot.id).toBeTruthy();
    snapshotId = snapshot.id;

    derived = await create({
      adapter: adapter(),
      cwd,
      snapshot: snapshot.id,
    });

    const payload = await source(derived, snapshot, file, "ready");
    expectSource(payload);
    await record("source", sourceFixture(payload));
  } finally {
    await Promise.all([cleanup(derived), cleanup(sandbox)]);
    await cleanupSnapshot(snapshotId);
  }
});

live("vercel restores a live snapshot in place", async () => {
  const file = path("restore");
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });
  let snapshotId: string | undefined;

  try {
    await sandbox.files.write(file, "restored");
    const snapshot = await sandbox.snapshots.create();
    snapshotId = snapshot.id;

    await sandbox.snapshots.restore(snapshot.id);
    await expect(sandbox.files.text(file)).resolves.toBe("restored");
  } finally {
    await Promise.all([cleanup(sandbox), cleanupSnapshot(snapshotId)]);
  }
});

live("vercel exposes ports after creation", async () => {
  const sandbox = await create({
    adapter: adapter({ ports: [] }),
    cwd,
  });
  let running:
    | Awaited<ReturnType<LiveSandbox["process"]["spawnShell"]>>
    | undefined;

  try {
    running = await sandbox.process.spawnShell(
      "node -e \"require('node:http').createServer((_request,response)=>response.end('dynamic-vercel-port')).listen(3456,'0.0.0.0')\""
    );
    const preview = await sandbox.ports.expose(3456);
    await expect(readPreview(preview.url)).resolves.toBe("dynamic-vercel-port");
  } finally {
    await running?.kill();
    await cleanup(sandbox);
  }
});

live("vercel enforces command timeouts", async () => {
  const sandbox = await create({
    adapter: adapter({ ports: [] }),
    cwd,
  });

  try {
    await expect(
      sandbox.process.exec("sleep", ["60"], { timeout: 1000 })
    ).rejects.toMatchObject({
      code: "timeout",
      provider: "vercel",
    });
    await expect(sandbox.process.shell("printf ready")).resolves.toMatchObject({
      code: 0,
      stdout: "ready",
    });
  } finally {
    await cleanup(sandbox);
  }
});

live("vercel exposes advertised raw capabilities", async () => {
  const sandbox = await create({
    adapter: adapter({ resources: { vcpus: 1 } }),
    cwd,
  });

  try {
    expect(sandbox.raw.status).toBe("running");
    await sandbox.process.shell("printf raw-metrics");
    const sessions = await sandbox.raw.listSessions({ limit: 1 });
    expect(sessions.sessions.length).toBeGreaterThanOrEqual(1);
    await sandbox.raw.stop();
    expect(sandbox.raw.status).toBe("stopped");
    expect("activeCpuUsageMs" in sandbox.raw).toBe(true);
    expect("networkTransfer" in sandbox.raw).toBe(true);
    expect(sandbox.capabilities.raw?.pty).toBe(true);
  } finally {
    await cleanup(sandbox);
  }
});
