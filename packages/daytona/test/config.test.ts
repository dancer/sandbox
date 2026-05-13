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

test("daytona maps create options without running a real provider", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let folderSeen: unknown;
  let paramsSeen: unknown;
  let settingsSeen: unknown;
  const raw = {
    fs: {
      createFolder: (path: string, mode: string) => {
        folderSeen = { mode, path };
        return Promise.resolve();
      },
    },
    getWorkDir: () => Promise.resolve("/provider"),
    id: "sandbox",
    stop: () => Promise.resolve(),
  };

  client.create = ((params?: unknown, settings?: unknown) => {
    paramsSeen = params;
    settingsSeen = settings;
    return Promise.resolve(raw);
  }) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({
        apiKey: "key",
        autoStopInterval: 5,
        env: { A: "1" },
        labels: { owner: "sdk" },
        language: "typescript",
        name: "option-name",
        networkBlockAll: true,
        public: true,
        snapshot: "option-snapshot",
        timeout: 1000,
        user: "daytona",
      }),
      cwd: "/work",
      env: { B: "2" },
      metadata: { task: "test" },
      snapshot: "input-snapshot",
      timeout: 2500,
    });

    expect(sandbox.id).toBe("sandbox");
    expect(sandbox.cwd).toBe("/work");
    expect(paramsSeen).toMatchObject({
      autoStopInterval: 5,
      envVars: { A: "1", B: "2" },
      labels: { owner: "sdk", task: "test" },
      language: "typescript",
      name: "option-name",
      networkBlockAll: true,
      public: true,
      snapshot: "input-snapshot",
      user: "daytona",
    });
    expect(settingsSeen).toEqual({ timeout: 3 });
    expect(folderSeen).toEqual({ mode: "755", path: "/work" });
  } finally {
    client.create = original;
  }
});

test("daytona rejects unsupported background process APIs", async () => {
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

  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({
        apiKey: "key",
      }),
    });

    await expect(sandbox.process.spawn("sleep")).rejects.toMatchObject({
      code: "unsupported",
      provider: "daytona",
    });
    await expect(sandbox.process.spawnShell("sleep 1")).rejects.toMatchObject({
      code: "unsupported",
      provider: "daytona",
    });
  } finally {
    client.create = original;
  }
});
