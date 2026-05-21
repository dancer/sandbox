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

const capabilities = {
  environment: true,
  files: true,
  ports: "create-time",
  process: true,
  processExec: true,
  processSpawn: false,
  raw: {
    gpu: "create-time",
    lifecycle: true,
    network: "create-time",
    secrets: "create-time",
    volumes: true,
  },
  snapshotCreate: "filesystem",
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "separate",
} as const;

const workflow: Workflow = {
  capabilities,
  content: "hello from modal",
  features: workflowFeatures(false, true),
  port: 3000,
  provider: "modal",
  spawn: false,
  uncovered: ["snapshots.create", "snapshotSource"],
};

const source: SnapshotSource = {
  capabilities,
  features: sourceFeatures(),
  provider: "modal",
  source: "snapshot",
  uncovered: [
    "ports.expose",
    "process.exec",
    "process.shell",
    "process.spawnShell",
  ],
};

test("modal replays the sanitized workflow fixture", async () => {
  const fixture = await json<Payload>("workflow");

  expectCoverage(fixture.coverage, workflow);
  expectWorkflow(fixture.payload, workflow);
});

test("modal replays the sanitized snapshot source fixture", async () => {
  const fixture = await json<Source>("source");

  expectSourceCoverage(fixture.coverage, source);
  expectSource(fixture.payload, source);
});
