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

const logs = async function* logs(): AsyncIterable<{
  data: string;
  stream: string;
}> {};

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

test("vercel forwards process kill signals", async () => {
  const original = VercelSandbox.create;
  let signal: unknown;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
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
    sandboxId: "sandbox",
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

test("vercel maps create options and gates undeclared ports", async () => {
  const original = VercelSandbox.create;
  let createSeen: unknown;
  let domainSeen: unknown;
  let mkdirSeen: unknown;
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
    sandboxId: "sandbox",
    snapshot: () => {
      snapshotted = true;
      return Promise.resolve({ snapshotId: "snapshot-id" });
    },
    stop: () => Promise.resolve(),
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
        source: { type: "tarball", url: "https://example.com/app.tgz" },
        teamId: "team",
        timeout: 123,
        token: "token",
      }),
      cwd: "/work",
      env: { B: "2" },
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
      teamId: "team",
      timeout: 456,
      token: "token",
    });
    expect(mkdirSeen).toEqual({
      options: { recursive: true },
      path: "/work",
    });

    await expect(sandbox.ports.expose(3000)).rejects.toMatchObject({
      code: "unsupported",
      provider: "vercel",
    });
    expect(domainSeen).toBeUndefined();
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    expect(domainSeen).toBeUndefined();

    await expect(sandbox.ports.expose(8080)).resolves.toEqual({
      port: 8080,
      url: "https://preview.example.com/8080",
    });
    expect(domainSeen).toBe(8080);

    await expect(sandbox.snapshots.create()).resolves.toEqual({
      id: "snapshot-id",
    });
    expect(snapshotted).toBe(true);
    await expect(
      sandbox.snapshots.restore("snapshot-id")
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "vercel",
    });
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
    runCommand: () => Promise.reject(new Error("provider failed")),
    sandboxId: "sandbox",
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
    runCommand: () => {
      called = true;
      return Promise.reject(new Error("provider called"));
    },
    sandboxId: "sandbox",
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
