import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { SandboxInstance } from "@blaxel/core";
import { create } from "@sandbox-sdk/core";

import { record, workflowFixture } from "../../../test/fixture";
import { workflow } from "../../../test/workflow";
import {
  blaxel,
  updateLifecycle,
  updateNetwork,
  updateTtl,
} from "../src/index";

const config = (): boolean =>
  existsSync(join(homedir(), ".blaxel", "config.yaml"));

const enabled = Boolean(
  (process.env.BL_WORKSPACE &&
    (process.env.BL_API_KEY || process.env.BL_CLIENT_CREDENTIALS)) ||
  config()
);
const live = enabled ? test : test.skip;

const adapter = (externalId?: string) =>
  blaxel({
    apiKey: process.env.BL_API_KEY,
    clientCredentials: process.env.BL_CLIENT_CREDENTIALS,
    disableH2: true,
    ...(externalId === undefined ? {} : { externalId }),
    image: "blaxel/base-image:latest",
    name: `sandbox-sdk-${randomUUID()}`,
    region: process.env.BL_REGION,
    ttl: "10m",
    workspace: process.env.BL_WORKSPACE,
  });

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

live("blaxel runs a live sandbox workflow", async () => {
  const cwd = "/app";
  const sandbox = await create({
    adapter: adapter(),
    cwd,
    env: { SANDBOX_SDK_CREATE: "create-env" },
  });

  try {
    const payload = await workflow(sandbox, {
      content: "hello from blaxel",
      cwd,
      port: 15_500,
      protocol: "https",
    });
    await record(
      new URL("__fixtures__/workflow.json", import.meta.url),
      workflowFixture("blaxel", payload, [
        "snapshots.create",
        "snapshots.restore",
        "snapshotSource",
      ])
    );
  } finally {
    await sandbox.stop();
  }
});

live("blaxel maps native missing paths to false", async () => {
  const cwd = `/app/sandbox-sdk-missing-${randomUUID()}`;
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });

  try {
    const missing = `${cwd}/missing`;
    await expect(sandbox.raw.fs.ls(missing)).rejects.toMatchObject({
      message: expect.stringContaining('"status":404'),
    });
    await expect(sandbox.files.exists(missing)).resolves.toBe(false);
  } finally {
    await sandbox.stop();
  }
});

live("blaxel exposes advertised raw capabilities", async () => {
  const cwd = `/app/sandbox-sdk-raw-${randomUUID()}`;
  let watched = false;
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });

  try {
    const handle = sandbox.raw.fs.watch(
      cwd,
      (event) => {
        if (event.name === "watched.txt") {
          watched = true;
        }
      },
      { withContent: true }
    );

    try {
      await delay(1000);
      await sandbox.files.write(`${cwd}/watched.txt`, "watch");
      await waitFor(() => watched, "blaxel file watch", 20_000);
    } finally {
      handle.close();
    }
    await sandbox.files.remove(`${cwd}/watched.txt`);

    const session = await sandbox.raw.sessions.create({
      expiresAt: new Date(Date.now() + 300_000),
    });
    try {
      expect(session.name).toBeTruthy();
      expect(session.url.startsWith("https://")).toBe(true);
      expect(session.token.length).toBeGreaterThan(0);

      const sessions = await sandbox.raw.sessions.list();
      expect(sessions.some((current) => current.name === session.name)).toBe(
        true
      );
    } finally {
      await sandbox.raw.sessions.delete(session.name);
    }

    const preview = await sandbox.raw.previews.createIfNotExists({
      metadata: { name: "sandbox-sdk-raw" },
      spec: { port: 15_501, public: true },
    });
    try {
      expect(preview.name).toBe("sandbox-sdk-raw");
      expect(preview.spec.url?.startsWith("https://")).toBe(true);

      const previews = await sandbox.raw.previews.list();
      expect(previews.some((current) => current.name === preview.name)).toBe(
        true
      );
    } finally {
      await sandbox.raw.previews.delete(preview.name);
    }

    const mounts = await sandbox.raw.drives.list();
    expect(Array.isArray(mounts)).toBe(true);
    expect(typeof sandbox.raw.system.upgrade).toBe("function");
    expect(typeof sandbox.raw.codegen.reranking).toBe("function");
  } finally {
    await sandbox.stop();
  }
});

live("blaxel updates a live sandbox network", async () => {
  const cwd = "/app";
  const sandbox = await create({
    adapter: blaxel({
      apiKey: process.env.BL_API_KEY,
      clientCredentials: process.env.BL_CLIENT_CREDENTIALS,
      disableH2: true,
      image: "blaxel/base-image:latest",
      name: `sdk-net-${randomUUID().slice(0, 8)}`,
      network: {
        proxy: {
          routing: [],
        },
      },
      region: process.env.BL_REGION,
      ttl: "10m",
      workspace: process.env.BL_WORKSPACE,
    }),
    cwd,
  });

  try {
    const updated = await updateNetwork(sandbox.raw, {
      proxy: {
        allowedDomains: ["example.com"],
        routing: [],
      },
    });
    expect(updated.spec.network?.proxy?.allowedDomains).toEqual([
      "example.com",
    ]);
  } finally {
    await sandbox.stop();
  }
});

live("blaxel updates live expiration and external id", async () => {
  const externalId = `sandbox-sdk-${randomUUID()}`;
  const file = `/app/sandbox-sdk-lifecycle-${randomUUID()}.txt`;
  const sandbox = await create({
    adapter: adapter(externalId),
    cwd: "/app",
  });

  try {
    expect(sandbox.raw.metadata.externalId).toBe(externalId);
    const found = await SandboxInstance.getByExternalId(externalId);
    expect(found.metadata.name).toBe(sandbox.id);

    await sandbox.files.write(file, "before update");

    const ttl = await updateTtl(sandbox.raw, "30m");
    expect(ttl.spec.runtime?.ttl).toBe("30m");

    const cleared = await updateTtl(ttl, null);
    expect(cleared.spec.runtime?.ttl).not.toBe("30m");

    const lifecycle = {
      expirationPolicies: [
        { action: "delete" as const, type: "ttl-idle" as const, value: "1h" },
      ],
    };
    const updated = await updateLifecycle(cleared, lifecycle);
    expect(updated.spec.lifecycle?.expirationPolicies).toEqual(
      lifecycle.expirationPolicies
    );
    await updated.wait({ interval: 1000, maxWait: 60_000 });
    expect(await updated.fs.read(file)).toBe("before update");
  } finally {
    await sandbox.stop();
  }
});
