import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { create } from "@sandbox-sdk/core";

import { record, workflowFixture } from "../../../test/fixture";
import { workflow } from "../../../test/workflow";
import { blaxel, updateNetwork } from "../src/index";

const config = (): boolean =>
  existsSync(join(homedir(), ".blaxel", "config.yaml"));

const enabled = Boolean(
  (process.env.BL_WORKSPACE &&
    (process.env.BL_API_KEY || process.env.BL_CLIENT_CREDENTIALS)) ||
  config()
);
const live = enabled ? test : test.skip;

const adapter = () =>
  blaxel({
    apiKey: process.env.BL_API_KEY,
    clientCredentials: process.env.BL_CLIENT_CREDENTIALS,
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
      await sandbox.files.write(`${cwd}/watched.txt`, "watch");
      await waitFor(() => watched, "blaxel file watch");
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
