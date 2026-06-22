import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

import { create } from "@sandbox-sdk/core";
import {
  Sandbox as VercelSandbox,
  Snapshot as VercelSnapshot,
} from "@vercel/sandbox";

import { vercel } from "../src/index";
import type { VercelFetch } from "../src/index";

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

const separateLogs = async function* separateLogs(): AsyncIterable<{
  data: string;
  stream: string;
}> {
  yield { data: "out", stream: "stdout" };
  yield { data: "err", stream: "stderr" };
};

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");

const jwt = (payload: Record<string, unknown>): string =>
  `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;

const customFetch: VercelFetch = () => Promise.resolve(new Response());

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

test("vercel rejects provider credentials in sandbox env before provider calls", async () => {
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
          env: { VERCEL_OIDC_TOKEN: "oidc" },
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
        env: { VERCEL_TOKEN: "token" },
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message:
        "Vercel provider credentials cannot be forwarded into sandbox env: VERCEL_OIDC_TOKEN, VERCEL_TOKEN",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = original;
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

test("vercel ignores empty explicit access credentials when env credentials exist", async () => {
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
    const sandbox = await create({
      adapter: vercel({
        projectId: "",
        teamId: "",
        token: "",
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
    await expect(sandbox.ports.expose(3000)).resolves.toMatchObject({
      port: 3000,
      url: "https://preview.example.com/3000",
    });
    expect(updateSeen).toEqual({ ports: [4567, 3000] });
  } finally {
    VercelSandbox.get = original;
  }
});

test("vercel forks named sandboxes with normalized create options", async () => {
  const original = VercelSandbox.fork;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "fork",
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;
  let seen: unknown;

  VercelSandbox.fork = ((input: unknown) => {
    seen = input;
    return Promise.resolve(raw);
  }) as typeof VercelSandbox.fork;

  try {
    const sandbox = await create({
      adapter: vercel({
        fork: { sourceSandbox: "source" },
        name: "fork",
        projectId: "project",
        resources: { vcpus: 2 },
        teamId: "team",
        token: "token",
      }),
      env: { SOURCE: "create" },
      metadata: { purpose: "test" },
      ports: [3000],
    });

    expect(sandbox.id).toBe("fork");
    expect(seen).toMatchObject({
      env: { SOURCE: "create" },
      name: "fork",
      ports: [3000],
      projectId: "project",
      resources: { vcpus: 2 },
      sourceSandbox: "source",
      tags: { purpose: "test" },
      teamId: "team",
      token: "token",
    });
  } finally {
    VercelSandbox.fork = original;
  }
});

test("vercel rejects conflicting fork configuration before provider calls", async () => {
  const nativeCreate = VercelSandbox.create;
  const nativeFork = VercelSandbox.fork;
  const nativeGet = VercelSandbox.get;
  let called = false;
  const fail = () => {
    called = true;
    return Promise.reject(new Error("provider called"));
  };

  VercelSandbox.create = fail as typeof VercelSandbox.create;
  VercelSandbox.fork = fail as typeof VercelSandbox.fork;
  VercelSandbox.get = fail as typeof VercelSandbox.get;

  try {
    await expect(
      create({
        adapter: vercel({
          fork: "source",
          getOrCreate: true,
          projectId: "project",
          runtime: "node26",
          source: { type: "git", url: "https://github.com/acme/example.git" },
          teamId: "team",
          token: "token",
        }),
        id: "existing",
        snapshot: "snapshot",
        template: "template",
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message:
        "Vercel fork cannot be combined with getOrCreate, source, runtime, id, snapshot, template",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = nativeCreate;
    VercelSandbox.fork = nativeFork;
    VercelSandbox.get = nativeGet;
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
        kill: (next?: unknown) => {
          signal = next;
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

test("vercel kills spawned processes on abort", async () => {
  const original = VercelSandbox.create;
  let signal: unknown;
  const wait = async () => {
    for (;;) {
      if (signal !== undefined) {
        return {
          exitCode: 130,
          stderr: () => Promise.resolve(""),
          stdout: () => Promise.resolve(""),
        };
      }
      await Bun.sleep(1);
    }
  };
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    runCommand: () =>
      Promise.resolve({
        cmdId: "command",
        kill: (next?: unknown) => {
          signal = next;
          return Promise.resolve();
        },
        logs,
        wait,
      }),
    stop: () => Promise.resolve(),
  } as unknown as VercelSandbox;
  const controller = new AbortController();

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
    const process = await sandbox.process.spawn("sleep", ["10"], {
      signal: controller.signal,
    });

    controller.abort("stopped");

    await expect(process.result).rejects.toMatchObject({
      code: "aborted",
      provider: "vercel",
    });
    expect(signal).toBe("SIGTERM");
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel kills spawned processes on timeout", async () => {
  const original = VercelSandbox.create;
  let command: unknown;
  let signal: unknown;
  const wait = async () => {
    for (;;) {
      if (signal !== undefined) {
        return {
          exitCode: 124,
          stderr: () => Promise.resolve(""),
          stdout: () => Promise.resolve(""),
        };
      }
      await Bun.sleep(1);
    }
  };
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    runCommand: (input: unknown) => {
      command = input;
      return Promise.resolve({
        cmdId: "command",
        kill: (next?: unknown) => {
          signal = next;
          return Promise.resolve();
        },
        logs,
        wait,
      });
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
    const process = await sandbox.process.spawn("sleep", ["10"], {
      timeout: 1,
    });

    await expect(process.result).rejects.toMatchObject({
      code: "timeout",
      provider: "vercel",
    });
    expect(command).toMatchObject({ timeoutMs: 1 });
    expect(signal).toBe("SIGTERM");
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel forwards execution timeouts to the provider", async () => {
  const original = VercelSandbox.create;
  let command: unknown;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    runCommand: (input: unknown) => {
      command = input;
      return Promise.resolve({
        exitCode: 0,
        stderr: () => Promise.resolve(""),
        stdout: () => Promise.resolve("done"),
      });
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
      sandbox.process.exec("sleep", ["1"], { timeout: 2500 })
    ).resolves.toMatchObject({
      code: 0,
      stdout: "done",
    });
    expect(command).toMatchObject({ timeoutMs: 2500 });
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel exposes separate process streams", async () => {
  const original = VercelSandbox.create;
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    runCommand: () =>
      Promise.resolve({
        cmdId: "command",
        kill: () => Promise.resolve(),
        logs: separateLogs,
        wait: () =>
          Promise.resolve({
            exitCode: 0,
            stderr: () => Promise.resolve("err"),
            stdout: () => Promise.resolve("out"),
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
    const process = await sandbox.process.spawn("echo", ["hello"]);
    const [output, stdout, stderr, result] = await Promise.all([
      new Response(process.output).text(),
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.result,
    ]);

    expect(output).toBe("outerr");
    expect(stdout).toBe("out");
    expect(stderr).toBe("err");
    expect(result).toMatchObject({
      code: 0,
      ok: true,
      stderr: "err",
      stdout: "out",
    });
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
    await expect(
      create({
        adapter: vercel({
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
        ports: [3000, 3001, 3002, 3003, 3004],
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message: "Vercel sandboxes can expose up to 4 ports",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel rejects too many merged tags before provider calls", async () => {
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
          tags: {
            fifth: "5",
            first: "1",
            fourth: "4",
            second: "2",
            third: "3",
          },
          teamId: "team",
          token: "token",
        }),
        metadata: { sixth: "6" },
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message: "Vercel sandboxes support up to 5 tags",
      provider: "vercel",
    });
    expect(called).toBe(false);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel rejects invalid resource counts before provider calls", async () => {
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
          resources: { vcpus: 0 },
          teamId: "team",
          token: "token",
        }),
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message: "resources.vcpus must be a positive integer",
      provider: "vercel",
    });
    await expect(
      create({
        adapter: vercel({
          projectId: "project",
          resources: { vcpus: 1.5 },
          teamId: "team",
          token: "token",
        }),
      })
    ).rejects.toMatchObject({
      code: "configuration",
      message: "resources.vcpus must be a positive integer",
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

test("vercel rejects invalid snapshot retention before provider calls", async () => {
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
          keepLastSnapshots: { count: 0 },
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    await expect(
      create({
        adapter: vercel({
          projectId: "project",
          snapshotExpiration: -1,
          teamId: "team",
          token: "token",
        }),
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

test("vercel deletes a created sandbox when workspace setup fails", async () => {
  const original = VercelSandbox.create;
  let deleted = false;
  const raw = {
    delete: () => {
      deleted = true;
      return Promise.reject(new Error("cleanup failed"));
    },
    fs: {
      mkdir: () => Promise.reject(new Error("mkdir failed")),
    },
    name: "sandbox",
  } as unknown as VercelSandbox;

  VercelSandbox.create = (() =>
    Promise.resolve(raw)) as typeof VercelSandbox.create;

  try {
    await expect(
      create({
        adapter: vercel({
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
      })
    ).rejects.toThrow("mkdir failed");
    expect(deleted).toBe(true);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel preserves existing get-or-create sandboxes when setup fails", async () => {
  const original = VercelSandbox.getOrCreate;
  let deleted = false;
  const raw = {
    delete: () => {
      deleted = true;
      return Promise.resolve();
    },
    fs: {
      mkdir: () => Promise.reject(new Error("mkdir failed")),
    },
    name: "shared",
  } as unknown as VercelSandbox;

  VercelSandbox.getOrCreate = (() =>
    Promise.resolve(raw)) as typeof VercelSandbox.getOrCreate;

  try {
    await expect(
      create({
        adapter: vercel({
          getOrCreate: true,
          name: "shared",
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
      })
    ).rejects.toThrow("mkdir failed");
    expect(deleted).toBe(false);
  } finally {
    VercelSandbox.getOrCreate = original;
  }
});

test("vercel deletes new get-or-create sandboxes when setup fails", async () => {
  const original = VercelSandbox.getOrCreate;
  let deleted = false;
  const raw = {
    delete: () => {
      deleted = true;
      return Promise.resolve();
    },
    fs: {
      mkdir: () => Promise.reject(new Error("mkdir failed")),
    },
    name: "shared",
  } as unknown as VercelSandbox;

  VercelSandbox.getOrCreate = ((input?: {
    onCreate?: (sandbox: VercelSandbox) => Promise<void>;
  }) =>
    input?.onCreate === undefined
      ? Promise.resolve(raw)
      : input
          .onCreate(raw)
          .then(() => raw)) as typeof VercelSandbox.getOrCreate;

  try {
    await expect(
      create({
        adapter: vercel({
          getOrCreate: true,
          name: "shared",
          projectId: "project",
          teamId: "team",
          token: "token",
        }),
      })
    ).rejects.toThrow("mkdir failed");
    expect(deleted).toBe(true);
  } finally {
    VercelSandbox.getOrCreate = original;
  }
});

test("vercel maps create options and updates dynamic ports", async () => {
  const original = VercelSandbox.create;
  const originalGet = VercelSnapshot.get;
  let createSeen: unknown;
  let deleted = false;
  let domainSeen: unknown;
  let mkdirSeen: unknown;
  let snapshotSeen: unknown;
  let restoreSeen: unknown;
  let stopCalled = false;
  let updateSeen: unknown;
  let snapshotCalls = 0;
  let snapshotGetSeen: unknown;
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
      snapshotCalls += 1;
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
  VercelSnapshot.get = ((input: unknown) => {
    snapshotGetSeen = input;
    return Promise.resolve({
      delete: () => {
        deleted = true;
        return Promise.resolve();
      },
    });
  }) as typeof VercelSnapshot.get;

  try {
    const sandbox = await create({
      adapter: vercel({
        env: { A: "1" },
        fetch: customFetch,
        keepLastSnapshots: {
          count: 3,
          deleteEvicted: false,
          expiration: 43_200_000,
        },
        persistent: false,
        ports: [3000],
        projectId: "project",
        resources: { vcpus: 2 },
        runtime: "node24",
        snapshotExpiration: 86_400_000,
        source: { type: "tarball", url: "https://example.com/app.tgz" },
        tags: { default: "true" },
        teamId: "team",
        timeout: 123,
        token: "token",
      }),
      cwd: "/work",
      env: { B: "2" },
      metadata: { feature: "test" },
      ports: [8080, 8080],
      snapshot: "snapshot",
      timeout: 456,
    });

    expect(sandbox.id).toBe("sandbox");
    expect(sandbox.cwd).toBe("/work");
    expect(createSeen).toMatchObject({
      env: { A: "1", B: "2" },
      fetch: customFetch,
      keepLastSnapshots: {
        count: 3,
        deleteEvicted: false,
        expiration: 43_200_000,
      },
      persistent: false,
      ports: [8080],
      projectId: "project",
      resources: { vcpus: 2 },
      runtime: "node24",
      source: { snapshotId: "snapshot", type: "snapshot" },
      tags: { default: "true", feature: "test" },
      teamId: "team",
      timeout: 456,
      token: "token",
    });
    expect(mkdirSeen).toEqual({
      options: { recursive: true },
      path: "/work",
    });

    await expect(sandbox.ports.expose(3000)).resolves.toMatchObject({
      port: 3000,
      url: "https://preview.example.com/3000",
    });
    expect(updateSeen).toEqual({ ports: [8080, 3000] });
    expect(domainSeen).toBe(3000);
    await expect(sandbox.ports.expose(0)).rejects.toMatchObject({
      code: "configuration",
      provider: "vercel",
    });
    await expect(
      sandbox.ports.expose(4567, { token: "private" })
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "vercel",
    });
    expect(updateSeen).toEqual({ ports: [8080, 3000] });

    await expect(sandbox.ports.expose(8080)).resolves.toMatchObject({
      port: 8080,
      url: "https://preview.example.com/8080",
    });
    expect(domainSeen).toBe(8080);

    await expect(sandbox.snapshots.create()).resolves.toEqual({
      id: "snapshot-id",
    });
    expect(snapshotCalls).toBe(1);
    expect(snapshotSeen).toEqual({ expiration: 86_400_000 });
    await expect(sandbox.snapshots.delete("snapshot-id")).resolves.toBe(
      undefined
    );
    expect(snapshotGetSeen).toEqual({
      projectId: "project",
      snapshotId: "snapshot-id",
      teamId: "team",
      token: "token",
    });
    expect(deleted).toBe(true);
    await expect(sandbox.snapshots.create("ready")).rejects.toMatchObject({
      code: "unsupported",
      provider: "vercel",
    });
    expect(snapshotCalls).toBe(1);
    await expect(sandbox.snapshots.restore("snapshot-id")).resolves.toBe(
      undefined
    );
    expect(restoreSeen).toEqual({ currentSnapshotId: "snapshot-id" });
    expect(stopCalled).toBe(true);
  } finally {
    VercelSandbox.create = original;
    VercelSnapshot.get = originalGet;
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

test("vercel keeps native file streams bounded before consumption", async () => {
  const original = VercelSandbox.create;
  let pushed = 0;
  const source = new Readable({
    highWaterMark: 1,
    read() {
      while (pushed < 100) {
        pushed += 1;
        if (!this.push(Buffer.from("x"))) {
          return;
        }
      }
      this.push(null);
    },
  });
  const raw = {
    fs: {
      mkdir: () => Promise.resolve(),
    },
    name: "sandbox",
    readFile: () => Promise.resolve(source),
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
    const stream = await sandbox.files.stream("file.txt");

    await Bun.sleep(0);

    expect(pushed).toBeLessThan(10);
    await stream.cancel();
    expect(source.destroyed).toBe(true);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel creates parent directories before file writes", async () => {
  const original = VercelSandbox.create;
  let mkdirSeen: unknown;
  let writeSeen: unknown;
  const raw = {
    fs: {
      mkdir: (path: string, options: unknown) => {
        mkdirSeen = { options, path };
        return Promise.resolve();
      },
    },
    name: "sandbox",
    stop: () => Promise.resolve(),
    writeFiles: (input: unknown) => {
      writeSeen = input;
      return Promise.resolve();
    },
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

    await sandbox.files.write("/work/src/index.ts", "content");

    expect(mkdirSeen).toEqual({
      options: { recursive: true },
      path: "/work/src",
    });
    expect(writeSeen).toEqual([
      {
        content: "content",
        path: "/work/src/index.ts",
      },
    ]);
  } finally {
    VercelSandbox.create = original;
  }
});

test("vercel resolves relative file paths against cwd", async () => {
  const original = VercelSandbox.create;
  const seen: unknown[] = [];
  const raw = {
    fs: {
      exists: (path: string) => {
        seen.push(["exists", path]);
        return Promise.resolve(true);
      },
      mkdir: (path: string, options: unknown) => {
        seen.push(["mkdir", path, options]);
        return Promise.resolve();
      },
      readdir: (path: string, options: unknown) => {
        seen.push(["readdir", path, options]);
        return Promise.resolve([]);
      },
      rm: (path: string, options: unknown) => {
        seen.push(["rm", path, options]);
        return Promise.resolve();
      },
    },
    name: "sandbox",
    stop: () => Promise.resolve(),
    writeFiles: (input: unknown) => {
      seen.push(["writeFiles", input]);
      return Promise.resolve();
    },
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

    await sandbox.files.exists("src/index.ts");
    await sandbox.files.list("src");
    await sandbox.files.mkdir("cache");
    await sandbox.files.remove("old.txt");
    await sandbox.files.write("src/index.ts", "content");

    expect(seen).toEqual([
      ["mkdir", "/work", { recursive: true }],
      ["exists", "/work/src/index.ts"],
      ["readdir", "/work/src", { withFileTypes: true }],
      ["mkdir", "/work/cache", { recursive: true }],
      ["rm", "/work/old.txt", { force: true, recursive: true }],
      ["mkdir", "/work/src", { recursive: true }],
      ["writeFiles", [{ content: "content", path: "/work/src/index.ts" }]],
    ]);
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
