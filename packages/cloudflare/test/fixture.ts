type Command = Readonly<{
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}>;

export type Payload = Readonly<{
  capabilities: Record<string, unknown>;
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

const liveRoute = "/sandbox-sdk/live";
const portsRoute = "/sandbox-sdk/ports";
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
    return {
      body: (await response.json()) as PortPayload,
      response,
    };
  } catch (error) {
    throw new Error(
      `cloudflare port verification returned non-json response with status ${response.status}`,
      { cause: error }
    );
  }
};
