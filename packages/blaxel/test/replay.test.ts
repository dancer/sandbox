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
    processSpawn: true,
    raw: {
      codegen: true,
      drives: true,
      lifecycle: true,
      network: "create-time",
      previews: true,
      resources: "create-time",
      sessions: true,
      system: true,
      volumes: "create-time",
      watching: true,
    },
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: false,
    snapshots: false,
    streaming: "combined",
  },
  content: "hello from blaxel",
  features: workflowFeatures(true, true),
  port: 15_500,
  provider: "blaxel",
  spawn: true,
  uncovered: ["snapshots.create", "snapshots.restore", "snapshotSource"],
};

test("blaxel replays the sanitized workflow fixture", async () => {
  const fixture = await json<Payload>("workflow");

  expectCoverage(fixture.coverage, workflow);
  expectWorkflow(fixture.payload, workflow);
});
