import { expect, test } from "bun:test";

import { sourceFixture } from "./fixture";
import type { Source } from "./fixture";

const source: Source = {
  capabilities: {
    environment: true,
    fileStreaming: "native",
    files: true,
    ports: "derived",
    process: true,
    processExec: true,
    processSpawn: "separate",
    raw: {},
    snapshotCreate: "memory",
    snapshotDelete: true,
    snapshotRestore: false,
    snapshotSource: "create-time",
    streaming: "separate",
  },
  file: {
    exists: true,
    text: "ready",
  },
  ok: true,
  provider: "e2b",
  snapshot: {
    id: "snapshot-secret",
    name: "team/private:default",
  },
  source: "snapshot-secret",
};

test("source fixtures remove provider snapshot identifiers and names", () => {
  const fixture = sourceFixture("e2b", source, []);

  expect(fixture.payload.snapshot).toEqual({
    id: "snapshot",
    name: "snapshot",
  });
  expect(fixture.payload.source).toBe("snapshot");
  expect(JSON.stringify(fixture)).not.toContain("snapshot-secret");
  expect(JSON.stringify(fixture)).not.toContain("team/private:default");
});
