import { test } from "bun:test";

import {
  expectCoverage,
  expectWorkflow,
  workflowFeatures,
} from "../../../test/fixture";
import type { Fixture, Workflow } from "../../../test/fixture";
import type { Payload } from "../../../test/workflow";

const json = async <Body>(name: string): Promise<Fixture<Body>> =>
  (await Bun.file(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  ).json()) as Fixture<Body>;

const workflow: Workflow = {
  capabilities: {
    environment: true,
    files: true,
    ports: "dynamic",
    process: true,
    processExec: true,
    processSpawn: "separate",
    raw: {
      desktop: true,
      git: true,
      interpreter: true,
      lifecycle: "dynamic",
      lsp: true,
      network: "dynamic",
      previews: true,
      pty: true,
      resources: "dynamic",
      sessions: true,
      ssh: true,
      volumes: "create-time",
    },
    snapshotCreate: false,
    snapshotDelete: true,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "separate",
  },
  content: "hello from daytona",
  features: workflowFeatures(true, true, true),
  port: 3000,
  provider: "daytona",
  spawn: true,
  uncovered: ["snapshots.create", "snapshots.delete", "snapshotSource"],
};

test("daytona replays the sanitized workflow fixture", async () => {
  const fixture = await json<Payload>("workflow");

  expectCoverage(fixture.coverage, workflow);
  expectWorkflow(fixture.payload, workflow);
});
