import { test } from "bun:test";

import {
  coverage,
  portCoverage,
  ports,
  tunnelCoverage,
  tunnels,
  workflow,
} from "./behavior";
import type { Coverage, Payload, PortPayload, TunnelPayload } from "./fixture";

type Fixture<Body> = Readonly<{
  body: Body;
  coverage: Coverage;
  status: number;
}>;

const load = async <Body>(name: string): Promise<Fixture<Body>> =>
  (await Bun.file(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  ).json()) as Fixture<Body>;

test("cloudflare replays the sanitized workflow fixture", async () => {
  const fixture = await load<Payload>("workflow");

  coverage(fixture.coverage);
  workflow({
    body: fixture.body,
    response: new Response(null, { status: fixture.status }),
  });
});

test("cloudflare replays the sanitized ports fixture", async () => {
  const fixture = await load<PortPayload>("ports");

  portCoverage(fixture.coverage);
  ports({
    body: fixture.body,
    response: new Response(null, { status: fixture.status }),
  });
});

test("cloudflare replays the sanitized tunnels fixture", async () => {
  const fixture = await load<TunnelPayload>("tunnels");

  tunnelCoverage(fixture.coverage);
  tunnels({
    body: fixture.body,
    response: new Response(null, { status: fixture.status }),
  });
});
