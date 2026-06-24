import { expect, test } from "bun:test";

import {
  coverage,
  portCoverage,
  ports,
  raw,
  rawCoverageCheck,
  workflow,
} from "./behavior";
import type { Coverage, Payload, PortPayload, RawPayload } from "./fixture";

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

test("cloudflare replays the sanitized raw fixture", async () => {
  const fixture = await load<RawPayload>("raw");

  rawCoverageCheck(fixture.coverage);
  raw({
    body: fixture.body,
    response: new Response(null, { status: fixture.status }),
  });
});

test("cloudflare explains stale verifier deployments", async () => {
  const fixture = await load<RawPayload>("raw");

  expect(() =>
    raw({
      body: {
        ...fixture.body,
        capabilities: {
          ...fixture.body.capabilities,
          raw: {},
        },
        raw: {
          ...fixture.body.raw,
          websocket: false,
        },
      },
      response: new Response(null, { status: fixture.status }),
    })
  ).toThrow(
    "deployed cloudflare verifier does not expose raw.websocket. redeploy apps/cloudflare before live raw verification"
  );
});
