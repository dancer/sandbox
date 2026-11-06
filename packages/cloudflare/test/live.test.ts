import { expect, test } from "bun:test";

import { ports, raw, workflow } from "./behavior";
import {
  enabled,
  execute,
  executePorts,
  executeRaw,
  executeSnapshots,
  portsFixture,
  rawFixture,
  record,
  workflowFixture,
} from "./fixture";

const live = enabled() ? test : test.skip;

live("cloudflare runs a live sandbox workflow", async () => {
  const result = await execute();
  workflow(result);
  await record("workflow", workflowFixture(result));
});

live("cloudflare exposes an authenticated application preview", async () => {
  const result = await executePorts();
  ports(result);
  await record("ports", portsFixture(result));
});

live("cloudflare verifies native container execution", async () => {
  const result = await executeRaw();
  raw(result);
  await record("raw", rawFixture(result));
});

live(
  "cloudflare restores native filesystem snapshots and starts from a snapshot",
  async () => {
    const response = await executeSnapshots();
    const body: unknown = await response.json();
    expect(body).toEqual({
      ok: true,
      restored: "checkpoint",
      source: "checkpoint",
    });
    expect(response.ok).toBe(true);
  }
);
