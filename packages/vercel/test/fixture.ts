import { randomUUID } from "node:crypto";

import type { Sandbox as CoreSandbox } from "@sandbox-sdk/core";
import type { Sandbox as RawSandbox } from "@vercel/sandbox";

import { vercel } from "../src/index";

export type LiveSandbox = CoreSandbox<RawSandbox>;

type DeletableSandbox = RawSandbox & { delete: () => Promise<void> };

const explicit = ():
  | {
      projectId: string;
      teamId: string;
      token: string;
    }
  | undefined => {
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const token = process.env.VERCEL_TOKEN;
  if (projectId === undefined || teamId === undefined || token === undefined) {
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
  explicit() !== undefined || Boolean(process.env.VERCEL_OIDC_TOKEN);

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
