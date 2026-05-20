import { test } from "bun:test";

import { workflow } from "./behavior";
import { enabled, execute } from "./fixture";

const live = enabled() ? test : test.skip;

live("cloudflare runs a live sandbox workflow", async () => {
  workflow(await execute());
});
