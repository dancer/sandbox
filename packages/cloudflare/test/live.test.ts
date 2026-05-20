import { test } from "bun:test";

import { ports, workflow } from "./behavior";
import { enabled, execute, executePorts, portsEnabled } from "./fixture";

const live = enabled() ? test : test.skip;
const livePorts = portsEnabled() ? test : test.skip;

live("cloudflare runs a live sandbox workflow", async () => {
  workflow(await execute());
});

livePorts("cloudflare exposes a live preview port", async () => {
  ports(await executePorts());
});
