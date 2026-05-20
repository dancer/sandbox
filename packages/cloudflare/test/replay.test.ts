import { test } from "bun:test";

import { coverage, workflow } from "./behavior";
import type { Coverage, Payload } from "./fixture";

type Fixture = Readonly<{
  body: Payload;
  coverage: Coverage;
  status: number;
}>;

const load = async (): Promise<Fixture> =>
  (await Bun.file(
    new URL("__fixtures__/workflow.json", import.meta.url)
  ).json()) as Fixture;

test("cloudflare replays the sanitized workflow fixture", async () => {
  const fixture = await load();

  coverage(fixture.coverage);
  workflow({
    body: fixture.body,
    response: new Response(null, { status: fixture.status }),
  });
});
