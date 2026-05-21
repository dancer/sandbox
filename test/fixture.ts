import { expect } from "bun:test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Capabilities, Snapshot } from "@sandbox-sdk/core";

import type { Payload } from "./workflow";

export type Coverage = Readonly<{
  features: readonly string[];
  fixture: string;
  provider: string;
  uncovered: readonly string[];
}>;

export type Fixture<Body> = Readonly<{
  coverage: Coverage;
  payload: Body;
}>;

export type Source = Readonly<{
  capabilities: Capabilities;
  file: Readonly<{
    exists: boolean;
    text: string;
  }>;
  ok: boolean;
  provider: string;
  snapshot: Snapshot;
  source?: string;
}>;

export type Workflow = Readonly<{
  capabilities: Capabilities;
  content: string;
  features: readonly string[];
  port?: number;
  provider: string;
  spawn: boolean;
  uncovered: readonly string[];
}>;

export type SnapshotSource = Readonly<{
  capabilities: Capabilities;
  features: readonly string[];
  provider: string;
  source?: string;
  uncovered: readonly string[];
}>;

export const workflowFeatures = (
  spawn: boolean,
  port: boolean
): readonly string[] => [
  "capabilities",
  "files.mkdir",
  "files.write",
  "files.write.bytes",
  "files.write.arrayBuffer",
  "files.write.blob",
  "files.write.readableStream",
  "files.exists",
  "files.read",
  "files.stream",
  "files.text",
  "files.list",
  "files.remove",
  "environment.create",
  "process.exec",
  "process.exec.options",
  "process.shell",
  "process.shell.options",
  spawn ? "process.spawnShell" : "process.spawn.unsupported",
  "process.failure",
  ...(port ? ["ports.expose"] : []),
  "sandbox.stop",
];

export const sourceFeatures = (): readonly string[] => [
  "capabilities",
  "snapshots.create",
  "snapshotSource",
  "files.exists",
  "files.text",
  "sandbox.stop",
];

export const workflowFixture = (
  provider: string,
  payload: Payload,
  uncovered: readonly string[]
): Fixture<Payload> => ({
  coverage: {
    features: workflowFeatures(
      !payload.unsupported.spawn,
      payload.port !== undefined
    ),
    fixture: "workflow",
    provider,
    uncovered,
  },
  payload: {
    ...payload,
    ...(payload.port === undefined
      ? {}
      : { port: { ...payload.port, url: "https://preview.example.com" } }),
  },
});

export const sourceFixture = (
  provider: string,
  payload: Source,
  uncovered: readonly string[]
): Fixture<Source> => ({
  coverage: {
    features: sourceFeatures(),
    fixture: "source",
    provider,
    uncovered,
  },
  payload: {
    ...payload,
    snapshot: { ...payload.snapshot, id: "snapshot" },
    ...(payload.source === undefined ? {} : { source: "snapshot" }),
  },
});

export const record = async (
  file: URL,
  value: Fixture<Payload> | Fixture<Source>
): Promise<void> => {
  if (process.env.SANDBOX_SDK_RECORD_FIXTURES !== "1") {
    return;
  }
  const path = fileURLToPath(file);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(file, `${JSON.stringify(value, null, 2)}\n`);
};

export const expectCoverage = (
  coverage: Coverage,
  expected: Workflow
): void => {
  expect(coverage.provider).toBe(expected.provider);
  expect(coverage.fixture).toBe("workflow");
  expect(coverage.features).toEqual(expected.features);
  expect(coverage.uncovered).toEqual(expected.uncovered);
};

export const expectWorkflow = (payload: Payload, expected: Workflow): void => {
  expect(payload.ok).toBe(true);
  expect(payload.provider).toBe(expected.provider);
  expect(payload.capabilities).toEqual(expected.capabilities);
  expect(payload.file).toEqual({
    exists: true,
    listed: true,
    read: expected.content,
    stream: expected.content,
    text: expected.content,
  });
  expect(payload.inputs).toEqual({
    blob: "blob",
    buffer: "buffer",
    bytes: "bytes",
    stream: "stream",
  });
  expect(payload.commands).toEqual({
    create: "create-env",
    exec: "exec-env",
    shell: "shell-env",
  });
  expect(payload.exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: expected.content,
  });
  expect(payload.shell).toMatchObject({
    code: 0,
    ok: true,
    stdout: expected.content,
  });
  expect(payload.failure).toMatchObject({
    code: 7,
    ok: false,
  });
  expect(`${payload.failure?.stdout}\n${payload.failure?.stderr}`).toContain(
    "failed"
  );
  expect(payload.unsupported).toEqual({
    spawn: !expected.spawn,
    spawnShell: !expected.spawn,
  });
  if (expected.spawn) {
    expect(payload.spawn).toMatchObject({
      code: 0,
      ok: true,
    });
    expect(payload.spawn?.output).toContain(expected.content);
  } else {
    expect(payload.spawn).toBeUndefined();
  }
  if (payload.port !== undefined) {
    expect(payload.port.port).toBe(expected.port);
    expect(payload.port.url).toMatch(/^https?:\/\//u);
  }
};

export const expectSourceCoverage = (
  coverage: Coverage,
  expected: SnapshotSource
): void => {
  expect(coverage.provider).toBe(expected.provider);
  expect(coverage.fixture).toBe("source");
  expect(coverage.features).toEqual(expected.features);
  expect(coverage.uncovered).toEqual(expected.uncovered);
};

export const expectSource = (
  payload: Source,
  expected: SnapshotSource
): void => {
  expect(payload.ok).toBe(true);
  expect(payload.provider).toBe(expected.provider);
  expect(payload.capabilities).toEqual(expected.capabilities);
  expect(payload.snapshot.id).toBe("snapshot");
  expect(payload.source).toBe(expected.source);
  expect(payload.file).toEqual({
    exists: true,
    text: "ready",
  });
};
