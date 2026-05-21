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

const snapshotLogs = () => void 0;

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

test("daytona rejects invalid create timeouts before provider calls", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let called = false;

  client.create = (() => {
    called = true;
    return Promise.reject(new Error("provider called"));
  }) as Create;

  try {
    await expect(
      create({
        adapter: daytona({
          apiKey: "key",
        }),
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "daytona",
    });
    expect(called).toBe(false);
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
        ephemeral: true,
        labels: { owner: "sdk" },
        language: "typescript",
        name: "option-name",
        networkBlockAll: true,
        public: true,
        snapshot: "option-snapshot",
        snapshotLogs,
        timeout: 1000,
        user: "daytona",
        volumes: [{ mountPath: "/cache", volumeId: "volume" }],
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
      ephemeral: true,
      labels: { owner: "sdk", task: "test" },
      language: "typescript",
      name: "option-name",
      networkBlockAll: true,
      public: true,
      snapshot: "input-snapshot",
      user: "daytona",
      volumes: [{ mountPath: "/cache", volumeId: "volume" }],
    });
    expect(settingsSeen).toEqual({
      onSnapshotCreateLogs: snapshotLogs,
      timeout: 3,
    });
    expect(folderSeen).toEqual({ mode: "755", path: "/work" });
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "daytona",
    });
  } finally {
    client.create = original;
  }
});

test("daytona rejects invalid command timeouts before provider calls", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let called = false;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    process: {
      executeCommand: () => {
        called = true;
        return Promise.reject(new Error("provider called"));
      },
    },
    stop: () => Promise.resolve(),
  };

  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({
        apiKey: "key",
      }),
    });

    await expect(
      sandbox.process.exec("echo", ["hello"], {
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "daytona",
    });
    expect(called).toBe(false);
  } finally {
    client.create = original;
  }
});

test("daytona maps background process APIs", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let sessionDeleted = false;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    process: {
      createSession: () => Promise.resolve(),
      deleteSession: () => {
        sessionDeleted = true;
        return Promise.resolve();
      },
      executeSessionCommand: () => Promise.resolve({ cmdId: "command" }),
      getSessionCommand: () => Promise.resolve({ exitCode: 0 }),
      getSessionCommandLogs: (
        _session: string,
        _command: string,
        onStdout?: (chunk: string) => void
      ) => {
        onStdout?.("hello");
        return Promise.resolve({ stderr: "", stdout: "hello" });
      },
    },
    stop: () => Promise.resolve(),
  };

  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({
        apiKey: "key",
      }),
    });

    const running = await sandbox.process.spawn("echo", ["hello"]);
    await expect(new Response(running.output).text()).resolves.toBe("hello");
    await expect(running.result).resolves.toMatchObject({
      code: 0,
      ok: true,
      stdout: "hello",
    });
    await running.kill();
    expect(sessionDeleted).toBe(true);
  } finally {
    client.create = original;
  }
});
