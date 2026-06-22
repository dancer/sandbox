import { Resolver } from "node:dns/promises";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname } from "node:path";
import { connect } from "node:tls";
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
  sessionless: boolean;
  shell: Command;
  spawn: Command &
    Readonly<{ output: string; stderrStream: string; stdoutStream: string }>;
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

export type RawPayload = Readonly<{
  capabilities: Record<string, unknown>;
  code: Readonly<{
    contextDeleted: boolean;
    contextListed: boolean;
    result: string;
  }>;
  error?: string;
  id: string;
  ok: boolean;
  provider: string;
  raw: Readonly<{
    backup: boolean;
    buckets: boolean;
    git: boolean;
    pty: boolean;
  }>;
  session: Readonly<{
    deleted: boolean;
    output: string;
  }>;
  watch: Readonly<{
    after: string;
    before: string;
    changed: boolean;
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

export type RawResult = Readonly<{
  body: RawPayload;
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
    "process.shell.isolation",
    "process.spawnShell",
    "process.spawnShell.stderr",
    "process.spawnShell.stdout",
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

export const rawCoverage: Coverage = {
  features: [
    "capabilities",
    "raw.createSession",
    "raw.session.exec",
    "raw.deleteSession",
    "raw.createCodeContext",
    "raw.runCode",
    "raw.listCodeContexts",
    "raw.deleteCodeContext",
    "raw.checkChanges",
    "raw.git.method",
    "raw.session.terminal.method",
    "raw.createBackup.method",
    "raw.mountBucket.method",
    "sandbox.stop",
  ],
  fixture: "raw",
  provider: "cloudflare",
  uncovered: [
    "raw.createBackup",
    "raw.restoreBackup",
    "raw.mountBucket",
    "raw.unmountBucket",
    "raw.terminal.websocket",
    "raw.gitCheckout",
  ],
};

const liveRoute = "/sandbox-sdk/live";
const portsRoute = "/sandbox-sdk/ports";
const rawRoute = "/sandbox-sdk/raw";
const cleanupRoute = "/sandbox-sdk/cleanup";
const attempts = 2;
const timeout = 90_000;
const previewTimeout = 10_000;
const previews = 30;
const tunnels = 3;

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

const previewRequest = async (
  url: URL,
  address: string
): Promise<PortPayload["response"]> => {
  const client = httpsRequest({
    createConnection: () =>
      connect({
        host: address,
        port: 443,
        servername: url.hostname,
      }),
    headers: { host: url.hostname },
    hostname: url.hostname,
    method: "GET",
    path: `${url.pathname}${url.search}`,
    port: 443,
  });
  client.setTimeout(previewTimeout, () => {
    client.destroy(new Error("cloudflare preview request timed out"));
  });
  client.end();

  const [response] = (await once(client, "response")) as [IncomingMessage];
  const chunks: Buffer[] = [];
  for await (const chunk of response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const status = response.statusCode ?? 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: Buffer.concat(chunks).toString(),
  };
};

export const requestPreview = async (
  value: string
): Promise<PortPayload["response"]> => {
  const url = new URL(value);
  const resolver = new Resolver();
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);
  let failure: unknown;

  for (let attempt = 0; attempt < previews; attempt += 1) {
    try {
      const addresses = await resolver.resolve4(url.hostname);
      for (const address of addresses) {
        const response = await previewRequest(url, address);
        if (response.ok) {
          return response;
        }
        failure = new Error(`preview returned status ${response.status}`);
      }
    } catch (error) {
      failure = error;
    }
    await Bun.sleep(1500);
  }

  throw new Error("cloudflare preview fetch failed", {
    cause: failure,
  });
};

export const enabled = (): boolean =>
  env("CLOUDFLARE_SANDBOX_WORKER_URL") !== undefined &&
  env("CLOUDFLARE_SANDBOX_TOKEN") !== undefined;

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
  let failure: unknown;

  for (let attempt = 0; attempt < tunnels; attempt += 1) {
    const response = await request(portsRoute, {
      headers: headers(),
      method: "POST",
    });

    try {
      const body = (await response.json()) as PortPayload;
      if (!response.ok) {
        return { body, response };
      }

      try {
        return {
          body: {
            ...body,
            response: await requestPreview(body.port.url),
          },
          response,
        };
      } catch (error) {
        failure = error;
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
  }

  throw new Error("cloudflare tunnel verification exhausted fresh tunnels", {
    cause: failure,
  });
};

export const executeRaw = async (): Promise<RawResult> => {
  const response = await request(rawRoute, {
    headers: headers(),
    method: "POST",
  });

  try {
    return {
      body: (await response.json()) as RawPayload,
      response,
    };
  } catch (error) {
    throw new Error(
      `cloudflare raw verification returned non-json response with status ${response.status}`,
      { cause: error }
    );
  }
};

export const workflowFixture = (input: Result): Fixture<Payload> => ({
  body: {
    ...input.body,
    spawn: {
      ...input.body.spawn,
      output: "hello from cloudflare",
      stderrStream: "",
      stdoutStream: "hello from cloudflare",
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
      url: "https://sandbox-fixture.trycloudflare.com",
    },
  },
  coverage: portsCoverage,
  status: input.response.status,
});

export const rawFixture = (input: RawResult): Fixture<RawPayload> => ({
  body: {
    ...input.body,
    id: "sandbox",
    watch: {
      ...input.body.watch,
      after: "version-after",
      before: "version-before",
    },
  },
  coverage: rawCoverage,
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
