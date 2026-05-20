import { test } from "bun:test";

import { expectCoverage, expectWorkflow } from "./behavior";
import type { Coverage, Workflow } from "./behavior";

type Fixture = Readonly<{
  coverage: Coverage;
  payload: Workflow;
}>;

const json = async (name: string): Promise<Fixture> =>
  (await Bun.file(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  ).json()) as Fixture;

test("codesandbox replays the sanitized workflow fixture", async () => {
  const fixture = await json("workflow");

  expectCoverage(fixture.coverage);
  expectWorkflow(fixture.payload);
});
