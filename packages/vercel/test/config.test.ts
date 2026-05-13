import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";

import { vercel } from "../src/index";

const restore = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = value;
};

test("vercel reports missing credentials before provider calls", async () => {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  process.env.VERCEL_OIDC_TOKEN = "";
  process.env.VERCEL_TOKEN = "";
  process.env.VERCEL_TEAM_ID = "";
  process.env.VERCEL_PROJECT_ID = "";

  try {
    await expect(create({ adapter: vercel() })).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
  } finally {
    restore("VERCEL_OIDC_TOKEN", oidc);
    restore("VERCEL_TOKEN", token);
    restore("VERCEL_TEAM_ID", teamId);
    restore("VERCEL_PROJECT_ID", projectId);
  }
});

test("vercel reports incomplete access token config", async () => {
  await expect(
    create({ adapter: vercel({ projectId: "", teamId: "", token: "token" }) })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "vercel",
  });
});

test("vercel passes env access token credentials to provider", async () => {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const original = VercelSandbox.create;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    sandboxId: "sandbox",
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;
  let seen: unknown;

  process.env.VERCEL_OIDC_TOKEN = "";
  process.env.VERCEL_TOKEN = "token";
  process.env.VERCEL_TEAM_ID = "team";
  process.env.VERCEL_PROJECT_ID = "project";
  VercelSandbox.create = ((input?: unknown) => {
    seen = input;
    return Promise.resolve(raw);
  }) as typeof VercelSandbox.create;

  try {
    const sandbox = await create({ adapter: vercel() });

    expect(sandbox.id).toBe("sandbox");
    expect(seen).toMatchObject({
      projectId: "project",
      teamId: "team",
      token: "token",
    });
  } finally {
    VercelSandbox.create = original;
    restore("VERCEL_OIDC_TOKEN", oidc);
    restore("VERCEL_TOKEN", token);
    restore("VERCEL_TEAM_ID", teamId);
    restore("VERCEL_PROJECT_ID", projectId);
  }
});
