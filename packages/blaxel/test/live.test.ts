import { test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { workflow } from "../../../test/workflow";
import { blaxel } from "../src/index";

const enabled = Boolean(
  process.env.BL_WORKSPACE &&
  (process.env.BL_API_KEY || process.env.BL_CLIENT_CREDENTIALS)
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

live("blaxel runs a live sandbox workflow", async () => {
  const cwd = "/app";
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });

  try {
    await workflow(sandbox, {
      content: "hello from blaxel",
      cwd,
      port: 15_500,
      protocol: "https",
    });
  } finally {
    await sandbox.stop();
  }
});
