import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

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

const logs = async function* logs(): AsyncIterable<{
  data: string;
  stream: string;
}> {};

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");

const jwt = (payload: Record<string, unknown>): string =>
  `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;

test("vercel reports missing credentials before provider calls", async () => {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  const accessToken = process.env.VERCEL_TOKEN;
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
    restore("VERCEL_TOKEN", accessToken);
    restore("VERCEL_TEAM_ID", teamId);
    restore("VERCEL_PROJECT_ID", projectId);
  }
});

test("vercel passes oidc credentials directly to provider", async () => {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  const access = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const original = VercelSandbox.create;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;
  let seen: unknown;
  const value = jwt({
    exp: Math.floor(Date.now() / 1000) + 60,
    owner_id: "team",
    project_id: "project",
  });

  process.env.VERCEL_OIDC_TOKEN = value;
  process.env.VERCEL_TOKEN = "";
  process.env.VERCEL_TEAM_ID = "";
  process.env.VERCEL_PROJECT_ID = "";
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
      token: value,
    });
  } finally {
    VercelSandbox.create = original;
    restore("VERCEL_OIDC_TOKEN", oidc);
    restore("VERCEL_TOKEN", access);
    restore("VERCEL_TEAM_ID", teamId);
    restore("VERCEL_PROJECT_ID", projectId);
  }
});

test("vercel reports expired oidc credentials before provider calls", async () => {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  const access = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const original = VercelSandbox.create;
  let called = false;

  process.env.VERCEL_OIDC_TOKEN = jwt({
    exp: Math.floor(Date.now() / 1000) - 60,
    owner_id: "team",
    project_id: "project",
  });
  process.env.VERCEL_TOKEN = "";
  process.env.VERCEL_TEAM_ID = "";
  process.env.VERCEL_PROJECT_ID = "";
  VercelSandbox.create = (() => {
    called = true;
    return Promise.reject(new Error("provider called"));
  }) as typeof VercelSandbox.create;

  try {
    await expect(create({ adapter: vercel() })).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = original;
    restore("VERCEL_OIDC_TOKEN", oidc);
    restore("VERCEL_TOKEN", access);
    restore("VERCEL_TEAM_ID", teamId);
    restore("VERCEL_PROJECT_ID", projectId);
  }
});

test("vercel prefers explicit access credentials over local oidc", async () => {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  const access = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const original = VercelSandbox.create;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;
  let seen: unknown;

  process.env.VERCEL_OIDC_TOKEN = jwt({
    exp: Math.floor(Date.now() / 1000) - 60,
    owner_id: "expired-team",
    project_id: "expired-project",
  });
  process.env.VERCEL_TOKEN = "";
  process.env.VERCEL_TEAM_ID = "";
  process.env.VERCEL_PROJECT_ID = "";
  VercelSandbox.create = ((input?: unknown) => {
    seen = input;
    return Promise.resolve(raw);
  }) as typeof VercelSandbox.create;

  try {
    const sandbox = await create({
      adapter: vercel({
        projectId: "project",
        teamId: "team",
        token: "token",
      }),
    });

    expect(sandbox.id).toBe("sandbox");
    expect(seen).toMatchObject({
      projectId: "project",
      teamId: "team",
      token: "token",
    });
  } finally {
    VercelSandbox.create = original;
    restore("VERCEL_OIDC_TOKEN", oidc);
    restore("VERCEL_TOKEN", access);
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
  const accessToken = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const original = VercelSandbox.create;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
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
    restore("VERCEL_TOKEN", accessToken);
    restore("VERCEL_TEAM_ID", teamId);
    restore("VERCEL_PROJECT_ID", projectId);
  }
});

test("vercel gets named sandboxes and preserves existing routes", async () => {
  const original = VercelSandbox.get;
  let getSeen: unknown;
  let updateSeen: unknown;
  const raw = {
    domain: (port: number) => `https://preview.example.com/${port}`,
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "workspace",
    routes: [{ port: 4567, subdomain: "old", url: "https://old.example.com" }],
    stop: () => Promise.resolve(),
    update: (input: unknown) => {
      updateSeen = input;
      return Promise.resolve();
    },
  } as unknown as VercelSandbox;

  VercelSandbox.get = ((input: unknown) => {
    getSeen = input;
    return Promise.resolve(raw);
  }) as typeof VercelSandbox.get;

  try {
    const sandbox = await create({
      adapter: vercel({
        projectId: "project",
        teamId: "team",
        token: "token",
      }),
      id: "workspace",
    });

    expect(sandbox.id).toBe("workspace");
    expect(getSeen).toMatchObject({
      name: "workspace",
      projectId: "project",
      resume: true,
      teamId: "team",
      token: "token",
    });
    await expect(sandbox.ports.expose(3000)).resolves.toEqual({
      port: 3000,
      url: "https://preview.example.com/3000",
    });
    expect(updateSeen).toEqual({ ports: [4567, 3000] });
  } finally {
    VercelSandbox.get = original;
  }
});

test("vercel forwards process kill signals", async () => {
  const original = VercelSandbox.create;
  let signal: unknown;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    runCommand: () =>
      Promise.resolve({
        cmdId: "command",
        kill: (input?: unknown) => {
          signal = input;
          return Promise.resolve();
        },
        logs,
        wait: () =>
          Promise.resolve({
            exitCode: 0,
            stderr: () => Promise.resolve(""),
            stdout: () => Promise.resolve(""),
          }),
      }),
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;

  VercelSandbox.create = (() =>
    Promise.resolve(raw)) as typeof VercelSandbox.create;

  try {
    const sandbox = await create({
      adapter: vercel({
        projectId: "project",
        teamId: "team",
        token: "token",
      }),
    });
    const process = await sandbox.process.spawn("sleep", ["10"]);

    await process.kill("SIGINT");
    await process.result;

    expect(signal).toBe("SIGINT");
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel rejects invalid declared ports before provider calls", async () => {
  const original = VercelSandbox.create;
  let called = false;
  VercelSandbox.create = (() => {
    called = true;
    return Promise.reject(new Error("provider called"));
  }) as typeof VercelSandbox.create;

  try {
    await expect(
      create({
        adapter: vercel({
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
        ports: [0],
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel rejects invalid create timeouts before provider calls", async () => {
  const original = VercelSandbox.create;
  let called = false;
  VercelSandbox.create = (() => {
    called = true;
    return Promise.reject(new Error("provider called"));
  }) as typeof VercelSandbox.create;

  try {
    await expect(
      create({
        adapter: vercel({
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel maps create options and updates dynamic ports", async () => {
  const original = VercelSandbox.create;
  let createSeen: unknown;
  let domainSeen: unknown;
  let mkdirSeen: unknown;
  let snapshotSeen: unknown;
  let restoreSeen: unknown;
  let stopCalled = false;
  let updateSeen: unknown;
  let snapshotted = false;
  const raw = {
    domain: (port: number) => {
      domainSeen = port;
      return `https://preview.example.com/${port}`;
    },
    fs: {
      mkdir: (path: string, options: unknown) => {
        mkdirSeen = { options, path };
        return Promise.resolve();
      },
    },
    name: "sandbox",
    snapshot: (input?: unknown) => {
      snapshotSeen = input;
      snapshotted = true;
      return Promise.resolve({ snapshotId: "snapshot-id" });
    },
    status: "running",
    stop: () => {
      stopCalled = true;
      return Promise.resolve();
    },
    update: (input: unknown) => {
      updateSeen = input;
      if (
        typeof input === "object" &&
        input !== null &&
        "currentSnapshotId" in input
      ) {
        restoreSeen = input;
      }
      return Promise.resolve();
    },
  } as unknown as VercelSandbox;

  VercelSandbox.create = ((input?: unknown) => {
    createSeen = input;
    return Promise.resolve(raw);
  }) as typeof VercelSandbox.create;

  try {
    const sandbox = await create({
      adapter: vercel({
        env: { A: "1" },
        ports: [3000],
        projectId: "project",
        resources: { vcpus: 2 },
        runtime: "node24",
        snapshotExpiration: 86_400_000,
        source: { type: "tarball", url: "https://example.com/app.tgz" },
        teamId: "team",
        timeout: 123,
        token: "token",
      }),
      cwd: "/work",
      env: { B: "2" },
      metadata: { feature: "test" },
      ports: [8080],
      snapshot: "snapshot",
      timeout: 456,
    });

    expect(sandbox.id).toBe("sandbox");
    expect(sandbox.cwd).toBe("/work");
    expect(createSeen).toMatchObject({
      env: { A: "1", B: "2" },
      ports: [8080],
      projectId: "project",
      resources: { vcpus: 2 },
      runtime: "node24",
      source: { snapshotId: "snapshot", type: "snapshot" },
      tags: { feature: "test" },
      teamId: "team",
      timeout: 456,
      token: "token",
    });
    expect(mkdirSeen).toEqual({
      options: { recursive: true },
      path: "/work",
    });

    await expect(sandbox.ports.expose(3000)).resolves.toEqual({
      port: 3000,
      url: "https://preview.example.com/3000",
    });
    expect(updateSeen).toEqual({ ports: [8080, 3000] });
    expect(domainSeen).toBe(3000);
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });

    await expect(sandbox.ports.expose(8080)).resolves.toEqual({
      port: 8080,
      url: "https://preview.example.com/8080",
    });
    expect(domainSeen).toBe(8080);

    await expect(sandbox.snapshots.create()).resolves.toEqual({
      id: "snapshot-id",
    });
    expect(snapshotted).toBe(true);
    expect(snapshotSeen).toEqual({ expiration: 86_400_000 });
    await expect(sandbox.snapshots.restore("snapshot-id")).resolves.toBe(
      undefined
    );
    expect(restoreSeen).toEqual({ currentSnapshotId: "snapshot-id" });
    expect(stopCalled).toBe(true);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel uses native file streams", async () => {
  const original = VercelSandbox.create;
  let buffered = false;
  let streamed: unknown;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    readFile: (input: unknown) => {
      streamed = input;
      return Promise.resolve(Readable.from(["native-stream"]));
    },
    readFileToBuffer: () => {
      buffered = true;
      return Promise.resolve(Buffer.from("buffered"));
    },
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;

  VercelSandbox.create = (() =>
    Promise.resolve(raw)) as typeof VercelSandbox.create;

  try {
    const sandbox = await create({
      adapter: vercel({
        projectId: "project",
        teamId: "team",
        token: "token",
      }),
      cwd: "/work",
    });
    const output = await new Response(
      await sandbox.files.stream("/work/file.txt")
    ).text();

    expect(output).toBe("native-stream");
    expect(streamed).toEqual({ cwd: "/work", path: "/work/file.txt" });
    expect(buffered).toBe(false);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel normalizes provider command errors", async () => {
  const original = VercelSandbox.create;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    runCommand: () => Promise.reject(new Error("provider failed")),
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;

  VercelSandbox.create = (() =>
    Promise.resolve(raw)) as typeof VercelSandbox.create;

  try {
    const sandbox = await create({
      adapter: vercel({
        projectId: "project",
        teamId: "team",
        token: "token",
      }),
    });

    await expect(sandbox.process.exec("echo")).rejects.toMatchObject({
      code: "process",
      provider: "vercel",
    });
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel rejects invalid command timeouts before provider calls", async () => {
  const original = VercelSandbox.create;
  let called = false;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    runCommand: () => {
      called = true;
      return Promise.reject(new Error("provider called"));
    },
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;

  VercelSandbox.create = (() =>
    Promise.resolve(raw)) as typeof VercelSandbox.create;

  try {
    const sandbox = await create({
      adapter: vercel({
        projectId: "project",
        teamId: "team",
        token: "token",
      }),
    });

    await expect(
      sandbox.process.exec("echo", [], {
        timeout: -1,
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = original;
  }
});
