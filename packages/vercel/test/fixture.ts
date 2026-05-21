import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Sandbox as CoreSandbox } from "@sandbox-sdk/core";
import { Snapshot as RawSnapshot } from "@vercel/sandbox";
import type { Sandbox as RawSandbox } from "@vercel/sandbox";

import { vercel } from "../src/index";
import type { Source, Workflow } from "./behavior";
import { sourceCoverage, workflowCoverage } from "./behavior";

export type LiveSandbox = CoreSandbox<RawSandbox>;

type DeletableSandbox = RawSandbox & { delete: () => Promise<void> };

type Fixture<Payload> = Readonly<{
  coverage: typeof sourceCoverage | typeof workflowCoverage;
  payload: Payload;
}>;

const explicit = ():
  | {
      projectId: string;
      teamId: string;
      token: string;
    }
  | undefined => {
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!projectId || !teamId || !token) {
    return;
  }
  return { projectId, teamId, token };
};

const deletable = (sandbox: RawSandbox): sandbox is DeletableSandbox => {
  const candidate = sandbox as RawSandbox & { delete?: unknown };
  return typeof candidate.delete === "function";
};

export const cwd = "/vercel/sandbox";

export const enabled = (): boolean =>
  explicit() !== undefined || Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());

export const path = (name: string): string =>
  `${cwd}/sandbox-sdk-${name}-${randomUUID()}.txt`;

export const adapter = () => {
  const credentials = explicit();
  return credentials === undefined
    ? vercel({
        ports: [3000],
        timeout: 300_000,
      })
    : vercel({
        ...credentials,
        ports: [3000],
        timeout: 300_000,
      });
};

export const cleanup = async (
  sandbox: LiveSandbox | undefined
): Promise<void> => {
  if (sandbox === undefined) {
    return;
  }
  if (deletable(sandbox.raw)) {
    await sandbox.raw.delete();
    return;
  }
  if (sandbox.raw.status !== "stopped") {
    await sandbox.stop();
  }
};

export const cleanupSnapshot = async (
  snapshotId: string | undefined
): Promise<void> => {
  if (snapshotId === undefined) {
    return;
  }
  const credentials = explicit();
  const snapshot = await RawSnapshot.get(
    credentials === undefined ? { snapshotId } : { ...credentials, snapshotId }
  );
  await snapshot.delete();
};

export const workflowFixture = (payload: Workflow): Fixture<Workflow> => ({
  coverage: workflowCoverage,
  payload: {
    ...payload,
    port: {
      ...payload.port,
      url: "https://preview.example.com",
    },
  },
});

export const sourceFixture = (payload: Source): Fixture<Source> => ({
  coverage: sourceCoverage,
  payload: {
    ...payload,
    snapshot: { ...payload.snapshot, id: "snapshot" },
    source: payload.source === undefined ? undefined : "snapshot",
  },
});

export const record = async <Payload>(
  name: string,
  value: Fixture<Payload>
): Promise<void> => {
  if (process.env.SANDBOX_SDK_RECORD_FIXTURES !== "1") {
    return;
  }
  const file = fileURLToPath(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  );
  await mkdir(dirname(file), { recursive: true });
  await Bun.write(file, `${JSON.stringify(value, null, 2)}\n`);
};
