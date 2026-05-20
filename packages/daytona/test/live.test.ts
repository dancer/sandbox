import { test } from "bun:test";
import { randomUUID } from "node:crypto";

import { create } from "@sandbox-sdk/core";

import { workflow } from "../../../test/workflow";
import { daytona } from "../src/index";

const credentialed = Boolean(
  process.env.DAYTONA_API_KEY ||
  (process.env.DAYTONA_JWT_TOKEN && process.env.DAYTONA_ORGANIZATION_ID)
);
const enabled = credentialed;
const live = enabled ? test : test.skip;

live("daytona runs a live sandbox workflow", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const sandbox = await create({
    adapter: daytona({
      deleteOnStop: true,
      timeout: 300_000,
    }),
    cwd,
  });

  try {
    await workflow(sandbox, {
      content: "hello from daytona",
      cwd,
      port: 3000,
    });
  } finally {
    await sandbox.stop();
  }
});
