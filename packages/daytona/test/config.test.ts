import { expect, test } from "bun:test";

import { Daytona as DaytonaClient } from "@daytona/sdk";
import { create } from "@sandbox-sdk/core";

import { daytona } from "../src/index";

const restore = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = value;
};

test("daytona reports missing credentials before provider calls", async () => {
  const apiKey = process.env.DAYTONA_API_KEY;
  const jwtToken = process.env.DAYTONA_JWT_TOKEN;
  const organizationId = process.env.DAYTONA_ORGANIZATION_ID;
  const target = process.env.DAYTONA_TARGET;
  process.env.DAYTONA_API_KEY = "";
  process.env.DAYTONA_JWT_TOKEN = "";
  process.env.DAYTONA_ORGANIZATION_ID = "";
  process.env.DAYTONA_TARGET = "";

  try {
    await expect(create({ adapter: daytona() })).rejects.toMatchObject({
      code: "configuration",
      provider: "daytona",
    });
  } finally {
    restore("DAYTONA_API_KEY", apiKey);
    restore("DAYTONA_JWT_TOKEN", jwtToken);
    restore("DAYTONA_ORGANIZATION_ID", organizationId);
    restore("DAYTONA_TARGET", target);
  }
});

test("daytona reports incomplete jwt config", async () => {
  await expect(
    create({
      adapter: daytona({
        jwtToken: "token",
        organizationId: "",
        target: "us",
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "daytona",
  });
});

test("daytona accepts api key config without target", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    stop: () => Promise.resolve(),
  };
  let seen: unknown;

  client.create = ((params?: unknown) => {
    seen = params;
    return Promise.resolve(raw);
  }) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({
        apiKey: "key",
      }),
    });

    expect(sandbox.id).toBe("sandbox");
    expect(seen).not.toMatchObject({
      target: expect.any(String),
    });
  } finally {
    client.create = original;
  }
});
