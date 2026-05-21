import { test } from "bun:test";

import { ports, workflow } from "./behavior";
import {
  enabled,
  execute,
  executePorts,
  portsEnabled,
  portsFixture,
  record,
  workflowFixture,
} from "./fixture";

const live = enabled() ? test : test.skip;
const livePorts = portsEnabled() ? test : test.skip;

live("cloudflare runs a live sandbox workflow", async () => {
  const result = await execute();
  workflow(result);
  await record("workflow", workflowFixture(result));
});

livePorts("cloudflare exposes a live preview port", async () => {
  const result = await executePorts();
  ports(result);
  await record("ports", portsFixture(result));
});
