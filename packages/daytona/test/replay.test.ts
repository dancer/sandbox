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
    desktop: true,
    environment: true,
    files: true,
    git: true,
    network: "dynamic",
    ports: "dynamic",
    process: true,
    processExec: true,
    processSpawn: "combined",
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: "create-time",
    snapshots: false,
    volumes: true,
  },
  content: "hello from daytona",
  features: workflowFeatures(true, true),
  port: 3000,
  provider: "daytona",
  spawn: true,
  uncovered: ["snapshots.create", "snapshotSource"],
};

test("daytona replays the sanitized workflow fixture", async () => {
  const fixture = await json<Payload>("workflow");

  expectCoverage(fixture.coverage, workflow);
  expectWorkflow(fixture.payload, workflow);
});
