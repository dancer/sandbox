import { expect, test } from "bun:test";

import { tools } from "@sandbox-sdk/ai";
import { create } from "@sandbox-sdk/core";

import { requestPreview } from "../../../test/preview";
import { VercelDrive } from "../src/index";
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

live(
  "vercel uses universal images, fifteen ports, regions, and persistent drives",
  async () => {
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const credentials =
      token && teamId && projectId ? { projectId, teamId, token } : {};
    const drive = await VercelDrive.getOrCreate({
      ...credentials,
      name: `sandbox-sdk-${crypto.randomUUID()}`,
      region: "iad1",
    });
    let sandbox: LiveSandbox | undefined;
    try {
      sandbox = await create({
        adapter: adapter({
          image: "vercel/sandbox/universal",
          mounts: { "/data": drive },
          region: "iad1",
        }),
        ports: Array.from({ length: 15 }, (_, index) => 3000 + index),
      });
      expect(sandbox.raw.region).toBe("iad1");
      expect(sandbox.raw.image).toBeString();
      expect(sandbox.raw.routes).toHaveLength(15);
      const version = await sandbox.process.exec("node", ["--version"]);
      expect(version.ok).toBe(true);
      await sandbox.files.write("/data/message.txt", "drive");
      const session = tools(sandbox, { cwd: "/data" }).sandbox;
      expect(await session.stat({ path: "message.txt" })).toEqual({
        size: 5,
        type: "file",
      });
      expect(await session.listDirectory({ path: "." })).toContainEqual({
        name: "message.txt",
        type: "file",
      });
      await session.writeTextFile({
        content: "temporary",
        path: "temporary.txt",
      });
      expect(await session.deleteFile({ path: "temporary.txt" })).toBe(true);

      expect(await sandbox.files.text("/data/message.txt")).toBe("drive");
      const preview = await sandbox.ports.expose(3014);
      expect(preview.url).toStartWith("https://");
      await expect(sandbox.ports.expose(3015)).rejects.toMatchObject({
        code: "configuration",
      });
    } finally {
      try {
        await cleanup(sandbox);
      } finally {
        await drive.delete();
      }
    }
  }
);

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
    try {
      await Promise.all([cleanup(derived), cleanup(sandbox)]);
    } finally {
      if (snapshotId !== undefined) {
        await sandbox.snapshots.delete(snapshotId);
      }
    }
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

live("vercel forks a stopped sandbox from its current snapshot", async () => {
  const file = path("fork");
  const base = await create({
    adapter: adapter({ persistent: true }),
    cwd,
  });
  let fork: LiveSandbox | undefined;

  try {
    await base.files.write(file, "forked");
    await base.stop();

    const snapshot = base.raw.currentSnapshotId;
    expect(snapshot).toBeTruthy();

    fork = await create({
      adapter: adapter({ fork: { sourceSandbox: base.id } }),
      cwd,
    });

    expect(fork.raw.sourceSnapshotId).toBe(snapshot);
    await expect(fork.files.text(file)).resolves.toBe("forked");
  } finally {
    await Promise.all([cleanup(fork), cleanup(base)]);
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
    const response = await requestPreview(preview);
    expect(await response.text()).toBe("dynamic-vercel-port");
  } finally {
    try {
      await running?.kill();
    } finally {
      await cleanup(sandbox);
    }
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
