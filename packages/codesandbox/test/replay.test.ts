import { test } from "bun:test";

import {
  expectCoverage,
  expectSource,
  expectSourceCoverage,
  expectWorkflow,
} from "./behavior";
import type { Coverage, Source, Workflow } from "./behavior";

type Fixture<Payload> = Readonly<{
  coverage: Coverage;
  payload: Payload;
}>;

const json = async <Payload>(name: string): Promise<Fixture<Payload>> =>
  (await Bun.file(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  ).json()) as Fixture<Payload>;

test("codesandbox replays the sanitized workflow fixture", async () => {
  const fixture = await json<Workflow>("workflow");

  expectCoverage(fixture.coverage);
  expectWorkflow(fixture.payload);
});

test("codesandbox replays the sanitized snapshot source fixture", async () => {
  const fixture = await json<Source>("source");

  expectSourceCoverage(fixture.coverage);
  expectSource(fixture.payload);
});
