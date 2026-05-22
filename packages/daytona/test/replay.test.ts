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
    processSpawn: "combined",
    raw: {
      desktop: true,
      git: true,
      interpreter: true,
      lifecycle: "dynamic",
      lsp: true,
      network: "create-time",
      previews: true,
      pty: true,
      sessions: true,
      ssh: true,
      volumes: "create-time",
    },
    snapshotCreate: false,
    snapshotRestore: false,
    snapshotSource: "create-time",
    snapshots: false,
    streaming: "combined",
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
