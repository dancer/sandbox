import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { expectSource, expectWorkflow, source, workflow } from "./behavior";
import {
  adapter,
  cleanup,
  cwd,
  enabled,
  path,
  record,
  sourceFixture,
  workflowFixture,
} from "./fixture";
import type { LiveSandbox } from "./fixture";

const live = enabled() ? test : test.skip;

live("vercel runs a live sandbox workflow", async () => {
  const file = path("workflow");
  const sandbox = await create({
    adapter: adapter(),
    cwd,
    ports: [3000],
  });

  try {
    const payload = await workflow(sandbox, cwd, file, "hello from vercel");
    expectWorkflow(payload);
    await record("workflow", workflowFixture(payload));
  } finally {
    await cleanup(sandbox);
  }
});

live("vercel creates and starts from a live snapshot", async () => {
  const file = path("snapshot");
  const sandbox = await create({
    adapter: adapter(),
    cwd,
  });
  let derived: LiveSandbox | undefined;

  try {
    await sandbox.files.write(file, "ready");

    const snapshot = await sandbox.snapshots.create("sandbox-sdk-live");
    expect(snapshot.id).toBeTruthy();

    derived = await create({
      adapter: adapter(),
      cwd,
      snapshot: snapshot.id,
    });

    const payload = await source(derived, snapshot, file, "ready");
    expectSource(payload);
    await record("source", sourceFixture(payload));
  } finally {
    await Promise.all([cleanup(derived), cleanup(sandbox)]);
  }
});
