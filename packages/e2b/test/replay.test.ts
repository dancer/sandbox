import { test } from "bun:test";

import {
  expectCoverage,
  expectSource,
  expectSourceCoverage,
  expectWorkflow,
  sourceFeatures,
  workflowFeatures,
} from "../../../test/fixture";
import type {
  Fixture,
  SnapshotSource,
  Source,
  Workflow,
} from "../../../test/fixture";
import type { Payload } from "../../../test/workflow";

const json = async <Body>(name: string): Promise<Fixture<Body>> =>
  (await Bun.file(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  ).json()) as Fixture<Body>;

const workflow: Workflow = {
  capabilities: {
    environment: true,
    files: true,
    ports: "derived",
    process: true,
    processExec: true,
    processSpawn: "combined",
    raw: {
      git: true,
      network: true,
      pty: true,
    },
    snapshotCreate: "disk",
    snapshotRestore: false,
    snapshotSource: "create-time",
    snapshots: false,
    streaming: "combined",
  },
  content: "hello from e2b",
  features: workflowFeatures(true, true),
  port: 3000,
  provider: "e2b",
  spawn: true,
  uncovered: ["snapshots.create", "snapshotSource"],
};

const source: SnapshotSource = {
  capabilities: workflow.capabilities,
  features: sourceFeatures(),
  provider: "e2b",
  source: "snapshot",
  uncovered: [
    "ports.expose",
    "process.exec",
    "process.shell",
    "process.spawnShell",
  ],
};

test("e2b replays the sanitized workflow fixture", async () => {
  const fixture = await json<Payload>("workflow");

  expectCoverage(fixture.coverage, workflow);
  expectWorkflow(fixture.payload, workflow);
});

test("e2b replays the sanitized snapshot source fixture", async () => {
  const fixture = await json<Source>("source");

  expectSourceCoverage(fixture.coverage, source);
  expectSource(fixture.payload, source);
});
