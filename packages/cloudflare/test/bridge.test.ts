import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { cloudflareBridge } from "../src/index";
import type {
  CloudflareBridgeFetch,
  CloudflareBridgeTunnel,
} from "../src/index";

type Seen = Readonly<{
  body?: string;
  headers: Record<string, string>;
  method: string;
  path: string;
  url: string;
}>;

type Handler = (seen: Seen) => Response | Promise<Response>;

const text = new TextEncoder();

const stream = (value: string): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(text.encode(value));
      controller.close();
    },
  });

const sse = (...events: readonly [string, string][]): Response =>
  new Response(
    events
      .map(([event, value]) =>
        event === "exit"
          ? `event: exit\ndata: {"exit_code":${value}}\n\n`
          : `event: ${event}\ndata: ${btoa(value)}\n\n`
      )
      .join(""),
    { headers: { "content-type": "text/event-stream" } }
  );

const json = (value: unknown): Response => Response.json(value);

const missing = (): Response =>
  Response.json({ error: "missing" }, { status: 404 });

const requestBody = (
  body: BodyInit | null | undefined
): Promise<string> | string | undefined => {
  if (typeof body === "string") {
    return body;
  }
  if (body === undefined || body === null) {
    return;
  }
  return new Response(body).text();
};

const bridgeFetch =
  (handler: Handler, seen: Seen[]): CloudflareBridgeFetch =>
  async (input, init = {}) => {
    const url = String(input);
    const body = await requestBody(init.body);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const request = {
      ...(body === undefined ? {} : { body }),
      headers,
      method: init.method ?? "GET",
      path: new URL(url).pathname + new URL(url).search,
      url,
    };
    seen.push(request);
    return handler(request);
  };

test("cloudflareBridge reports missing bridge url", async () => {
  const previous = process.env.SANDBOX_API_URL;
  delete process.env.SANDBOX_API_URL;

  try {
    await expect(
      create({
        adapter: cloudflareBridge({ fetch: bridgeFetch(() => json({}), []) }),
      })
    ).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
  } finally {
    if (previous !== undefined) {
      process.env.SANDBOX_API_URL = previous;
    }
  }
});

test("cloudflareBridge rejects invalid bridge urls", async () => {
  await expect(
    create({
      adapter: cloudflareBridge({
        fetch: bridgeFetch(() => json({}), []),
        url: "bridge.example.com",
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "cloudflare",
  });
});

test("cloudflareBridge distinguishes quick and named tunnel records", () => {
  const quick: CloudflareBridgeTunnel = {
    createdAt: "2026-06-22T00:00:00.000Z",
    hostname: "quick.trycloudflare.com",
    id: "quick-1",
    port: 4567,
    url: "https://quick.trycloudflare.com",
  };
  const named: CloudflareBridgeTunnel = {
    createdAt: "2026-06-22T00:00:00.000Z",
    hostname: "preview.example.com",
    id: "named-1",
    name: "preview",
    port: 4567,
    url: "https://preview.example.com",
  };
  const quickName: undefined = quick.name;
  const namedName: string = named.name;

  expect(quickName).toBeUndefined();
  expect(namedName).toBe("preview");
});

test("cloudflareBridge rejects bridge credentials in sandbox environments", async () => {
  let calls = 0;
  const fetch = bridgeFetch(() => {
    calls += 1;
    return json({ id: "box-1" });
  }, []);
  const message =
    "Cloudflare bridge credentials cannot be forwarded into sandbox env: SANDBOX_API_KEY";

  await expect(
    create({
      adapter: cloudflareBridge({
        env: { SANDBOX_API_KEY: "secret" },
        fetch,
        url: "https://bridge.example.com",
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    message,
    provider: "cloudflare",
  });
  await expect(
    create({
      adapter: cloudflareBridge({
        fetch,
        url: "https://bridge.example.com",
      }),
      env: { SANDBOX_API_KEY: "secret" },
    })
  ).rejects.toMatchObject({
    code: "configuration",
    message,
    provider: "cloudflare",
  });

  expect(calls).toBe(0);
});

test("cloudflareBridge keeps paths under workspace", async () => {
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.path === "/v1/sandbox") {
          return json({ id: "box-1" });
        }
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, []),
      url: "https://bridge.example.com",
    }),
    cwd: "/workspace",
  });

  try {
    await expect(
      sandbox.files.text("/workspace2/file.txt")
    ).rejects.toMatchObject({
      code: "path_escape",
      provider: "cloudflare",
    });
    await expect(sandbox.files.text("../escape.txt")).rejects.toMatchObject({
      code: "path_escape",
      provider: "cloudflare",
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflareBridge maps create session and cleanup", async () => {
  const seen: Seen[] = [];
  const sandbox = await create({
    adapter: cloudflareBridge({
      env: { A: "adapter", B: "adapter" },
      fetch: bridgeFetch((request) => {
        if (request.path === "/v1/sandbox" && request.method === "POST") {
          return json({ id: "box-1" });
        }
        if (request.path === "/v1/sandbox/box-1/session") {
          expect(JSON.parse(request.body ?? "{}")).toEqual({
            cwd: "/workspace/app",
            env: { A: "create", B: "adapter", C: "create" },
          });
          return json({ id: "session-1" });
        }
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, seen),
      token: "secret",
      url: "https://bridge.example.com/",
    }),
    cwd: "/workspace/app",
    env: { A: "create", C: "create" },
  });

  expect(sandbox.id).toBe("box-1");
  expect(sandbox.cwd).toBe("/workspace/app");
  expect(sandbox.capabilities.ports).toBe("dynamic");
  expect(sandbox.capabilities.raw?.sessions).toBe(true);
  expect(
    seen.every((request) => request.headers.authorization === "Bearer secret")
  ).toBe(true);

  await sandbox.stop();

  expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
    "POST /v1/sandbox",
    "POST /v1/sandbox/box-1/session",
    "DELETE /v1/sandbox/box-1/session/session-1",
    "DELETE /v1/sandbox/box-1",
  ]);
});

test("cloudflareBridge destroys sandboxes when session cleanup fails", async () => {
  const seen: Seen[] = [];
  const sandbox = await create({
    adapter: cloudflareBridge({
      env: { A: "adapter" },
      fetch: bridgeFetch((request) => {
        if (request.path === "/v1/sandbox" && request.method === "POST") {
          return json({ id: "box-1" });
        }
        if (
          request.path === "/v1/sandbox/box-1/session" &&
          request.method === "POST"
        ) {
          return json({ id: "session-1" });
        }
        if (
          request.path === "/v1/sandbox/box-1/session/session-1" &&
          request.method === "DELETE"
        ) {
          return Response.json(
            { error: "session cleanup failed" },
            { status: 500 }
          );
        }
        if (
          request.path === "/v1/sandbox/box-1" &&
          request.method === "DELETE"
        ) {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, seen),
      url: "https://bridge.example.com",
    }),
  });

  await expect(sandbox.stop()).rejects.toMatchObject({
    code: "provider",
    provider: "cloudflare",
  });
  expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
    "POST /v1/sandbox",
    "POST /v1/sandbox/box-1/session",
    "DELETE /v1/sandbox/box-1/session/session-1",
    "DELETE /v1/sandbox/box-1",
  ]);
});

test("cloudflareBridge reuses explicit sandbox ids", async () => {
  const seen: Seen[] = [];
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, seen),
      id: "stable",
      url: "https://bridge.example.com",
    }),
  });

  await sandbox.stop();

  expect(sandbox.id).toBe("stable");
  expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
    "DELETE /v1/sandbox/stable",
  ]);
});

test("cloudflareBridge maps files and command execution", async () => {
  const seen: Seen[] = [];
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.path === "/v1/sandbox") {
          return json({ id: "box-1" });
        }
        if (request.path === "/v1/sandbox/box-1/file/workspace/app/read.txt") {
          return new Response(stream("hello"));
        }
        if (request.path === "/v1/sandbox/box-1/file/workspace/app/write.txt") {
          expect(request.body).toBe("written");
          return new Response(null, { status: 204 });
        }
        if (
          request.path === "/v1/sandbox/box-1/file/workspace/app/missing.txt"
        ) {
          return missing();
        }
        if (request.path === "/v1/sandbox/box-1/exec") {
          const body = JSON.parse(request.body ?? "{}") as {
            argv: string[];
            cwd?: string;
            timeout_ms?: number;
          };
          if (body.argv[0] === "node") {
            return sse(
              [
                "stdout",
                JSON.stringify([
                  {
                    kind: "file",
                    modified: "2026-05-22T00:00:00.000Z",
                    path: "/workspace/app/read.txt",
                    size: 5,
                  },
                ]),
              ],
              ["exit", "0"]
            );
          }
          if (body.argv[0] === "mkdir" || body.argv[0] === "rm") {
            return sse(["exit", "0"]);
          }
          expect(body).toEqual({
            argv: ["env", "A=1", "sh", "-lc", "echo hello"],
            cwd: "/workspace/app/src",
            timeout_ms: 25,
          });
          return sse(
            ["stdout", "hello\n"],
            ["stderr", "warn\n"],
            ["exit", "0"]
          );
        }
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, seen),
      url: "https://bridge.example.com",
    }),
    cwd: "/workspace/app",
  });

  try {
    await expect(sandbox.files.text("read.txt")).resolves.toBe("hello");
    await sandbox.files.write("write.txt", "written");
    await expect(sandbox.files.exists("read.txt")).resolves.toBe(true);
    await expect(sandbox.files.exists("missing.txt")).resolves.toBe(false);
    await expect(sandbox.files.list()).resolves.toEqual([
      {
        kind: "file",
        modified: new Date("2026-05-22T00:00:00.000Z"),
        path: "/workspace/app/read.txt",
        size: 5,
      },
    ]);
    await sandbox.files.mkdir("dir");
    await sandbox.files.remove("dir");
    await expect(
      sandbox.process.shell("echo hello", {
        cwd: "src",
        env: { A: "1" },
        timeout: 25,
      })
    ).resolves.toEqual({
      code: 0,
      ok: true,
      stderr: "warn\n",
      stdout: "hello\n",
    });
  } finally {
    await sandbox.stop();
  }

  expect(
    seen.some((request) =>
      request.path.includes("/file/workspace/app/write.txt")
    )
  ).toBe(true);
});

test("cloudflareBridge exposes normalized and raw tunnels", async () => {
  const seen: Seen[] = [];
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.path === "/v1/sandbox") {
          return json({ id: "box-1" });
        }
        if (
          request.method === "POST" &&
          request.path === "/v1/sandbox/box-1/tunnel/3456"
        ) {
          expect(request.body).toBe('{"name":"preview"}');
          return json({
            createdAt: "2026-06-22T00:00:00.000Z",
            hostname: "preview.example.com",
            id: "named-1",
            name: "preview",
            port: 3456,
            url: "https://preview.example.com",
          });
        }
        if (
          request.method === "POST" &&
          request.path === "/v1/sandbox/box-1/tunnel/4567"
        ) {
          expect(request.body).toBeUndefined();
          return json({
            createdAt: "2026-06-22T00:00:00.000Z",
            hostname: "quick.trycloudflare.com",
            id: "quick-1",
            port: 4567,
            url: "https://quick.trycloudflare.com",
          });
        }
        if (
          request.method === "POST" &&
          request.path === "/v1/sandbox/box-1/tunnel/5678"
        ) {
          expect(request.body).toBe('{"name":"raw"}');
          return json({
            createdAt: "2026-06-22T00:00:00.000Z",
            hostname: "raw.example.com",
            id: "named-2",
            name: "raw",
            port: 5678,
            url: "https://raw.example.com",
          });
        }
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, seen),
      tunnel: "preview",
      url: "https://bridge.example.com",
    }),
  });

  try {
    await expect(sandbox.ports.expose(3456)).resolves.toMatchObject({
      port: 3456,
      url: "https://preview.example.com",
    });
    await expect(sandbox.raw.tunnels.get("box-1", 4567)).resolves.toMatchObject(
      {
        id: "quick-1",
        port: 4567,
        url: "https://quick.trycloudflare.com",
      }
    );
    await expect(
      sandbox.raw.tunnels.get("box-1", 5678, { name: "raw" })
    ).resolves.toMatchObject({
      id: "named-2",
      name: "raw",
      port: 5678,
    });
    await sandbox.raw.tunnels.destroy("box-1", 5678);
  } finally {
    await sandbox.stop();
  }

  expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
    "POST /v1/sandbox",
    "POST /v1/sandbox/box-1/tunnel/3456",
    "POST /v1/sandbox/box-1/tunnel/4567",
    "POST /v1/sandbox/box-1/tunnel/5678",
    "DELETE /v1/sandbox/box-1/tunnel/5678",
    "DELETE /v1/sandbox/box-1",
  ]);
});

test("cloudflareBridge validates tunnel configuration before bridge calls", async () => {
  let calls = 0;
  const fetch = bridgeFetch(() => {
    calls += 1;
    return new Response(null, { status: 204 });
  }, []);

  await expect(
    create({
      adapter: cloudflareBridge({
        fetch,
        id: "box-1",
        tunnel: "not_valid",
        url: "https://bridge.example.com",
      }),
    })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "cloudflare",
  });
  expect(calls).toBe(0);

  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch,
      id: "box-1",
      url: "https://bridge.example.com",
    }),
  });

  try {
    await expect(sandbox.ports.expose(80)).rejects.toMatchObject({
      code: "configuration",
      provider: "cloudflare",
    });
    await expect(sandbox.ports.expose(3000)).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
  } finally {
    await sandbox.stop();
  }

  expect(calls).toBe(1);
});

test("cloudflareBridge exposes raw bridge lifecycle methods", async () => {
  const seen: Seen[] = [];
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.path === "/v1/sandbox") {
          return json({ id: "box-1" });
        }
        if (request.path === "/v1/sandbox/box-1/running") {
          return json({ running: true });
        }
        if (
          request.path === "/v1/sandbox/box-1/persist?excludes=node_modules"
        ) {
          return new Response("tar");
        }
        if (request.path === "/v1/sandbox/box-1/session") {
          return json({ id: "raw-session" });
        }
        if (request.path === "/health") {
          return json({ ok: true });
        }
        if (request.path === "/v1/openapi.json") {
          return json({ openapi: "3.1.0" });
        }
        if (request.path === "/v1/pool/stats") {
          return json({ assigned: 0, warm: 1 });
        }
        if (request.method === "DELETE" || request.method === "POST") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, seen),
      url: "https://bridge.example.com",
    }),
  });

  try {
    await expect(sandbox.raw.running("box-1")).resolves.toBe(true);
    await expect(
      sandbox.raw.persist("box-1", { excludes: ["node_modules"] })
    ).resolves.toEqual(text.encode("tar"));
    await sandbox.raw.hydrate("box-1", "tar");
    await sandbox.raw.mount("box-1", {
      bucket: "data",
      mountPath: "/mnt/data",
    });
    await sandbox.raw.unmount("box-1", "/mnt/data");
    await expect(sandbox.raw.session.create("box-1")).resolves.toEqual({
      id: "raw-session",
    });
    await sandbox.raw.session.delete("box-1", "raw-session");
    await expect(sandbox.raw.health()).resolves.toEqual({ ok: true });
    await expect(sandbox.raw.openapi()).resolves.toEqual({ openapi: "3.1.0" });
    await expect(sandbox.raw.pool.stats()).resolves.toEqual({
      assigned: 0,
      warm: 1,
    });
    await sandbox.raw.pool.prime();
    await sandbox.raw.pool.shutdownPrewarmed();
    expect(
      sandbox.raw.pty("box-1", {
        cols: 120,
        rows: 40,
        session: "raw-session",
        shell: "/bin/bash",
      })
    ).toEqual({
      headers: {},
      url: "wss://bridge.example.com/v1/sandbox/box-1/pty?cols=120&rows=40&shell=%2Fbin%2Fbash&session=raw-session",
    });
  } finally {
    await sandbox.stop();
  }

  expect(seen.map((request) => `${request.method} ${request.path}`)).toContain(
    "POST /v1/sandbox/box-1/mount"
  );
  expect(seen.map((request) => `${request.method} ${request.path}`)).toContain(
    "POST /v1/pool/prime"
  );
});

test("cloudflareBridge preserves non-json bridge errors", async () => {
  await expect(
    create({
      adapter: cloudflareBridge({
        fetch: bridgeFetch(
          () =>
            new Response("blocked", { status: 403, statusText: "Forbidden" }),
          []
        ),
        url: "https://bridge.example.com",
      }),
    })
  ).rejects.toMatchObject({
    code: "provider",
    message: "bridge create failed: blocked",
    provider: "cloudflare",
  });
});

test("cloudflareBridge returns bearer headers for raw pty", async () => {
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, []),
      id: "box-1",
      token: "secret",
      url: "http://bridge.example.com",
    }),
  });

  try {
    expect(sandbox.raw.pty("box-1")).toEqual({
      headers: { Authorization: "Bearer secret" },
      url: "ws://bridge.example.com/v1/sandbox/box-1/pty",
    });
  } finally {
    await sandbox.stop();
  }
});

test("cloudflareBridge validates raw pty dimensions", async () => {
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, []),
      id: "box-1",
      url: "https://bridge.example.com",
    }),
  });

  try {
    expect(() => sandbox.raw.pty("box-1", { cols: 0 })).toThrow(
      "Cloudflare bridge pty cols must be a positive integer"
    );
  } finally {
    await sandbox.stop();
  }
});

test("cloudflareBridge keeps unsupported bridge features capability gated", async () => {
  const sandbox = await create({
    adapter: cloudflareBridge({
      fetch: bridgeFetch((request) => {
        if (request.path === "/v1/sandbox") {
          return json({ id: "box-1" });
        }
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return missing();
      }, []),
      url: "https://bridge.example.com",
    }),
  });

  try {
    await expect(
      sandbox.ports.expose(3456, { protocol: "http" })
    ).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
    await expect(sandbox.snapshots.create()).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
    await expect(sandbox.process.spawn("echo", ["hi"])).rejects.toMatchObject({
      code: "unsupported",
      provider: "cloudflare",
    });
  } finally {
    await sandbox.stop();
  }
});
