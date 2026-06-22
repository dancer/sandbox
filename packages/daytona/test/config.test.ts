import { expect, test } from "bun:test";
import { Readable } from "node:stream";

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

const notFound = (): Error & { statusCode: number } =>
  Object.assign(new Error("session not found"), { statusCode: 404 });

const forbidden = (): Error & { statusCode: number } =>
  Object.assign(new Error("access denied"), { statusCode: 403 });

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

test("daytona rejects provider credentials in sandbox env before provider calls", async () => {
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
          env: { DAYTONA_API_KEY: "key" },
        }),
        env: { DAYTONA_JWT_TOKEN: "jwt" },
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message:
        "Daytona provider credentials cannot be forwarded into sandbox env: DAYTONA_API_KEY, DAYTONA_JWT_TOKEN",
      provider: "daytona",
    });
    expect(called).toBe(false);
  } finally {
    client.create = original;
  }
});

test("daytona ignores empty explicit credentials when env credentials exist", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const apiKey = process.env.DAYTONA_API_KEY;
  const jwtToken = process.env.DAYTONA_JWT_TOKEN;
  const organizationId = process.env.DAYTONA_ORGANIZATION_ID;
  const target = process.env.DAYTONA_TARGET;
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

  process.env.DAYTONA_API_KEY = "env-key";
  process.env.DAYTONA_JWT_TOKEN = "";
  process.env.DAYTONA_ORGANIZATION_ID = "";
  process.env.DAYTONA_TARGET = "";
  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    await expect(
      create({
        adapter: daytona({
          apiKey: "",
        }),
      })
    ).resolves.toMatchObject({
      id: "sandbox",
    });
  } finally {
    client.create = original;
    restore("DAYTONA_API_KEY", apiKey);
    restore("DAYTONA_JWT_TOKEN", jwtToken);
    restore("DAYTONA_ORGANIZATION_ID", organizationId);
    restore("DAYTONA_TARGET", target);
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

test("daytona cleans up a created sandbox when workspace setup fails", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let deleted = false;
  const raw = {
    delete: () => {
      deleted = true;
      return Promise.reject(new Error("cleanup failed"));
    },
    fs: {
      createFolder: () => Promise.reject(new Error("mkdir failed")),
    },
    getWorkDir: () => Promise.resolve("/provider"),
    id: "sandbox",
  };

  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    await expect(
      create({
        adapter: daytona({ apiKey: "key" }),
      })
    ).rejects.toMatchObject({
      code: "provider",
      message: "mkdir failed",
      provider: "daytona",
    });
    expect(deleted).toBe(true);
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
        linkedSandbox: "source-sandbox",
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
      linkedSandbox: "source-sandbox",
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
    const host = { host: "preview.example.com" };
    await expect(sandbox.ports.expose(3000, host)).rejects.toMatchObject({
      code: "unsupported",
      provider: "daytona",
    });
  } finally {
    client.create = original;
  }
});

test("daytona deletes durable snapshots", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];
  type Snapshots = Pick<Client["snapshot"], "delete" | "get">;

  const client = DaytonaClient.prototype as Client;
  const originalCreate = client.create;
  const snapshots = Object.getPrototypeOf(
    new DaytonaClient({ apiKey: "key" }).snapshot
  ) as Snapshots;
  const originalDelete = snapshots.delete;
  const originalGet = snapshots.get;
  let deleted: unknown;
  let fetched: string | undefined;
  const snapshot = { name: "snapshot" };
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    stop: () => Promise.resolve(),
  };

  client.create = (() => Promise.resolve(raw)) as Create;
  snapshots.get = ((id: string) => {
    fetched = id;
    return Promise.resolve(snapshot);
  }) as Snapshots["get"];
  snapshots.delete = ((value: unknown) => {
    deleted = value;
    return Promise.resolve();
  }) as Snapshots["delete"];

  try {
    const sandbox = await create({ adapter: daytona({ apiKey: "key" }) });

    await expect(sandbox.snapshots.delete("snapshot")).resolves.toBe(undefined);
    expect(fetched).toBe("snapshot");
    expect(deleted).toBe(snapshot);
  } finally {
    client.create = originalCreate;
    snapshots.delete = originalDelete;
    snapshots.get = originalGet;
  }
});

test("daytona explains missing snapshot delete permission", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];
  type Snapshots = Pick<Client["snapshot"], "delete" | "get">;

  const client = DaytonaClient.prototype as Client;
  const originalCreate = client.create;
  const snapshots = Object.getPrototypeOf(
    new DaytonaClient({ apiKey: "key" }).snapshot
  ) as Snapshots;
  const originalDelete = snapshots.delete;
  const originalGet = snapshots.get;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    stop: () => Promise.resolve(),
  };

  client.create = (() => Promise.resolve(raw)) as Create;
  snapshots.get = (() =>
    Promise.resolve({ name: "snapshot" })) as Snapshots["get"];
  snapshots.delete = (() => Promise.reject(forbidden())) as Snapshots["delete"];

  try {
    const sandbox = await create({ adapter: daytona({ apiKey: "key" }) });

    await expect(sandbox.snapshots.delete("snapshot")).rejects.toMatchObject({
      code: "configuration",
      message:
        "Daytona snapshot deletion requires an API key with delete:snapshots",
      provider: "daytona",
    });
  } finally {
    client.create = originalCreate;
    snapshots.delete = originalDelete;
    snapshots.get = originalGet;
  }
});

test("daytona preview requests retain private preview tokens without serializing them", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  const server = Bun.serve({
    fetch: (request) => {
      if (request.headers.get("x-daytona-preview-token") !== "preview-secret") {
        return new Response("unauthorized", { status: 401 });
      }
      const url = new URL(request.url);
      return Response.json({
        client: request.headers.get("x-client"),
        source: url.searchParams.get("source"),
        token: request.headers.get("x-daytona-preview-token"),
      });
    },
    hostname: "127.0.0.1",
    port: 0,
  });
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getPreviewLink: () =>
      Promise.resolve({
        token: "preview-secret",
        url: `http://127.0.0.1:${server.port}/?source=provider`,
      }),
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    stop: () => Promise.resolve(),
  };

  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({ apiKey: "key" }),
    });
    const endpoint = await sandbox.ports.expose(server.port);

    await expect(fetch(endpoint.url)).resolves.toMatchObject({ status: 401 });
    const response = await endpoint.request("/health?source=caller", {
      headers: {
        "x-client": "client",
        "x-daytona-preview-token": "caller-token",
      },
    });

    expect(await response.json()).toEqual({
      client: "client",
      source: "provider",
      token: "preview-secret",
    });
    expect(Object.keys(endpoint)).toEqual(["port", "url"]);
    expect(JSON.stringify(endpoint)).not.toContain("preview-secret");
  } finally {
    client.create = original;
    server.stop(true);
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
        onStdout?: (chunk: string) => void,
        onStderr?: (chunk: string) => void
      ) => {
        onStdout?.("hello");
        onStderr?.("error");
        return Promise.resolve({ stderr: "error", stdout: "hello" });
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
    const [streamed, stdout, stderr, result] = await Promise.all([
      new Response(running.output).text(),
      new Response(running.stdout).text(),
      new Response(running.stderr).text(),
      running.result,
    ]);
    expect(streamed).toBe("helloerror");
    expect(stdout).toBe("hello");
    expect(stderr).toBe("error");
    expect(result).toMatchObject({
      code: 0,
      ok: true,
      stderr: "error",
      stdout: "hello",
    });
    await running.kill();
    expect(sessionDeleted).toBe(true);
  } finally {
    client.create = original;
  }
});

test("daytona resolves killed background processes without session errors", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let deleted = false;
  let deletes = 0;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    process: {
      createSession: () => Promise.resolve(),
      deleteSession: () => {
        deleted = true;
        deletes += 1;
        return Promise.resolve();
      },
      executeSessionCommand: () => Promise.resolve({ cmdId: "command" }),
      getSessionCommand: () => Promise.reject(notFound()),
      getSessionCommandLogs: async () => {
        for (;;) {
          if (deleted) {
            break;
          }
          await Bun.sleep(1);
        }
        throw notFound();
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
    const running = await sandbox.process.spawnShell("sleep 60");

    await running.kill();
    await running.kill();
    await expect(running.result).resolves.toMatchObject({
      code: 143,
      ok: false,
      signal: "SIGTERM",
    });
    expect(deletes).toBe(1);
  } finally {
    client.create = original;
  }
});

test("daytona deletes spawned sessions on abort", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let deleted = false;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    process: {
      createSession: () => Promise.resolve(),
      deleteSession: () => {
        deleted = true;
        return Promise.resolve();
      },
      executeSessionCommand: () => Promise.resolve({ cmdId: "command" }),
      getSessionCommand: () => Promise.resolve({ exitCode: 130 }),
      getSessionCommandLogs: async () => {
        for (;;) {
          if (deleted) {
            return { stderr: "", stdout: "" };
          }
          await Bun.sleep(1);
        }
      },
    },
    stop: () => Promise.resolve(),
  };
  const controller = new AbortController();

  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({
        apiKey: "key",
      }),
    });
    const running = await sandbox.process.spawnShell("sleep 10", {
      signal: controller.signal,
    });

    controller.abort("stopped");
    await running.result;

    expect(deleted).toBe(true);
  } finally {
    client.create = original;
  }
});

test("daytona deletes signal-backed exec sessions on abort", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  let deleted = false;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
    },
    getWorkDir: () => Promise.resolve("/workspace"),
    id: "sandbox",
    process: {
      createSession: () => Promise.resolve(),
      deleteSession: () => {
        deleted = true;
        return Promise.resolve();
      },
      executeSessionCommand: () => Promise.resolve({ cmdId: "command" }),
      getSessionCommand: () => Promise.resolve({ exitCode: 130 }),
      getSessionCommandLogs: async () => {
        for (;;) {
          if (deleted) {
            return { stderr: "", stdout: "" };
          }
          await Bun.sleep(1);
        }
      },
    },
    stop: () => Promise.resolve(),
  };
  const controller = new AbortController();

  client.create = (() => Promise.resolve(raw)) as Create;

  try {
    const sandbox = await create({
      adapter: daytona({
        apiKey: "key",
      }),
    });
    const output = sandbox.process.exec("sleep", ["10"], {
      signal: controller.signal,
    });

    await Promise.resolve();
    controller.abort("stopped");

    await expect(output).rejects.toMatchObject({
      code: "aborted",
      provider: "daytona",
    });
    expect(deleted).toBe(true);
  } finally {
    client.create = original;
  }
});

test("daytona uses provider streaming file APIs", async () => {
  type Client = InstanceType<typeof DaytonaClient>;
  type Create = Client["create"];

  const client = DaytonaClient.prototype as Client;
  const original = client.create;
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("stream"));
      controller.close();
    },
  });
  let uploadSeen: unknown;
  let downloadSeen: unknown;
  const raw = {
    fs: {
      createFolder: () => Promise.resolve(),
      downloadFileStream: (path: string) => {
        downloadSeen = path;
        return Promise.resolve(Readable.from(["stream"]));
      },
      uploadFileStream: (source: unknown, path: string) => {
        uploadSeen = { path, source };
        return Promise.resolve();
      },
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

    await sandbox.files.write("stream.txt", input);
    await expect(
      new Response(await sandbox.files.stream("stream.txt")).text()
    ).resolves.toBe("stream");

    expect(uploadSeen).toEqual({
      path: "/workspace/stream.txt",
      source: input,
    });
    expect(downloadSeen).toBe("/workspace/stream.txt");
  } finally {
    client.create = original;
  }
});
