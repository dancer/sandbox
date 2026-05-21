import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

type Command = Readonly<{
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}>;

export type Payload = Readonly<{
  capabilities: Record<string, unknown>;
  commands: Readonly<{
    create: string;
    exec: string;
    shell: string;
  }>;
  error?: string;
  exec: Command;
  failure: Command;
  file: Readonly<{
    exists: boolean;
    listed: boolean;
    read: string;
    stream: string;
    text: string;
  }>;
  inputs: Readonly<{
    blob: string;
    buffer: string;
    bytes: string;
    stream: string;
  }>;
  ok: boolean;
  provider: string;
  shell: Command;
  spawn: Command & Readonly<{ output: string }>;
}>;

export type PortPayload = Readonly<{
  capabilities: Record<string, unknown>;
  error?: string;
  id: string;
  local: Command;
  ok: boolean;
  port: Readonly<{
    port: number;
    url: string;
  }>;
  provider: string;
  response: Readonly<{
    ok: boolean;
    status: number;
    text: string;
  }>;
}>;

export type Result = Readonly<{
  body: Payload;
  response: Response;
}>;

export type PortResult = Readonly<{
  body: PortPayload;
  response: Response;
}>;

export type Coverage = Readonly<{
  fixture: string;
  features: readonly string[];
  provider: string;
  uncovered: readonly string[];
}>;

type Fixture<Body> = Readonly<{
  body: Body;
  coverage: Coverage;
  status: number;
}>;

export const workflowCoverage: Coverage = {
  features: [
    "capabilities",
    "files.mkdir",
    "files.write",
    "files.write.bytes",
    "files.write.arrayBuffer",
    "files.write.blob",
    "files.write.readableStream",
    "files.exists",
    "files.read",
    "files.stream",
    "files.text",
    "files.list",
    "files.remove",
    "environment.create",
    "process.exec",
    "process.exec.options",
    "process.shell",
    "process.shell.options",
    "process.spawnShell",
    "process.failure",
    "sandbox.stop",
  ],
  fixture: "workflow",
  provider: "cloudflare",
  uncovered: ["ports.expose", "snapshots.create", "snapshots.restore"],
};

export const portsCoverage: Coverage = {
  features: [
    "capabilities",
    "process.spawnShell",
    "ports.expose",
    "preview.fetch",
    "process.kill",
    "sandbox.stop",
  ],
  fixture: "ports",
  provider: "cloudflare",
  uncovered: [
    "files.list",
    "process.exec",
    "snapshots.create",
    "snapshots.restore",
  ],
};

const liveRoute = "/sandbox-sdk/live";
const portsRoute = "/sandbox-sdk/ports";
const cleanupRoute = "/sandbox-sdk/cleanup";
const attempts = 2;
const timeout = 90_000;

const env = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value || undefined;
};

const required = (name: string): string => {
  const value = env(name);
  if (value === undefined) {
    throw new Error(`${name} is required for cloudflare live verification`);
  }
  return value;
};

const endpoint = (route: string): URL =>
  new URL(route, required("CLOUDFLARE_SANDBOX_WORKER_URL"));

const headers = (): HeadersInit => ({
  authorization: `Bearer ${required("CLOUDFLARE_SANDBOX_TOKEN")}`,
  "content-type": "application/json",
});

const request = async (
  route: string,
  init: RequestInit = {}
): Promise<Response> => {
  let failure: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(endpoint(route), {
        ...init,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      failure = error;
    }
  }

  throw new Error("cloudflare live verification request failed", {
    cause: failure,
  });
};

export const enabled = (): boolean =>
  env("CLOUDFLARE_SANDBOX_WORKER_URL") !== undefined &&
  env("CLOUDFLARE_SANDBOX_TOKEN") !== undefined;

export const portsEnabled = (): boolean =>
  enabled() && env("CLOUDFLARE_SANDBOX_PREVIEW_HOST") !== undefined;

export const execute = async (): Promise<Result> => {
  const response = await request(liveRoute, {
    headers: headers(),
    method: "POST",
  });

  try {
    return {
      body: (await response.json()) as Payload,
      response,
    };
  } catch (error) {
    throw new Error(
      `cloudflare live verification returned non-json response with status ${response.status}`,
      { cause: error }
    );
  }
};

export const executePorts = async (): Promise<PortResult> => {
  const response = await request(portsRoute, {
    body: JSON.stringify({
      hostname: required("CLOUDFLARE_SANDBOX_PREVIEW_HOST"),
    }),
    headers: headers(),
    method: "POST",
  });

  try {
    const body = (await response.json()) as PortPayload;
    if (!response.ok) {
      return { body, response };
    }

    try {
      const preview = await fetch(body.port.url, {
        signal: AbortSignal.timeout(timeout),
      });
      return {
        body: {
          ...body,
          response: {
            ok: preview.ok,
            status: preview.status,
            text: await preview.text(),
          },
        },
        response,
      };
    } finally {
      await request(cleanupRoute, {
        body: JSON.stringify({ id: body.id }),
        headers: headers(),
        method: "POST",
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("json")) {
      throw new Error(
        `cloudflare port verification returned non-json response with status ${response.status}`,
        { cause: error }
      );
    }

    throw error;
  }
};

export const workflowFixture = (input: Result): Fixture<Payload> => ({
  body: {
    ...input.body,
    spawn: {
      ...input.body.spawn,
      output: "hello from cloudflare",
    },
  },
  coverage: workflowCoverage,
  status: input.response.status,
});

export const portsFixture = (input: PortResult): Fixture<PortPayload> => ({
  body: {
    ...input.body,
    id: "sandbox",
    port: {
      ...input.body.port,
      url: "https://8080-sandbox-fixture-preview.example.com",
    },
  },
  coverage: portsCoverage,
  status: input.response.status,
});

export const record = async <Body>(
  name: string,
  value: Fixture<Body>
): Promise<void> => {
  if (process.env.SANDBOX_SDK_RECORD_FIXTURES !== "1") {
    return;
  }
  const file = fileURLToPath(
    new URL(`__fixtures__/${name}.json`, import.meta.url)
  );
  await mkdir(dirname(file), { recursive: true });
  await Bun.write(file, `${JSON.stringify(value, null, 2)}\n`);
};
