import { test } from "bun:test";

import { ports, raw, workflow } from "./behavior";
import {
  enabled,
  execute,
  executePorts,
  executeRaw,
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

live("cloudflare exposes a live tunnel", async () => {
  const result = await executePorts();
  ports(result);
  await record("ports", portsFixture(result));
});

live(
  "cloudflare verifies live raw sessions and interpreter features",
  async () => {
    const result = await executeRaw();
    raw(result);
    await record("raw", rawFixture(result));
  }
);
