import { test } from "bun:test";

import {
  expectSource,
  expectSourceCoverage,
  expectWorkflow,
  expectWorkflowCoverage,
} from "./behavior";
import type { Coverage, Source, Workflow } from "./behavior";

type Fixture<Payload> = Readonly<{
  coverage: Coverage;
  payload: Payload;
}>;

const json = async <Payload>(name: string): Promise<Payload> =>
  (await Bun.file(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  ).json()) as Payload;

test("vercel replays the sanitized workflow fixture", async () => {
  const fixture = await json<Fixture<Workflow>>("workflow");

  expectWorkflowCoverage(fixture.coverage);
  expectWorkflow(fixture.payload);
});

test("vercel replays the sanitized snapshot source fixture", async () => {
  const fixture = await json<Fixture<Source>>("source");

  expectSourceCoverage(fixture.coverage);
  expectSource(fixture.payload);
});
