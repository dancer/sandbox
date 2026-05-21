import { test } from "bun:test";

import { ports, tunnels, workflow } from "./behavior";
import {
  enabled,
  execute,
  executePorts,
  executeTunnels,
  portsEnabled,
  portsFixture,
  record,
  tunnelsFixture,
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

live("cloudflare exposes a live quick tunnel through raw", async () => {
  const result = await executeTunnels();
  tunnels(result);
  await record("tunnels", tunnelsFixture(result));
});
