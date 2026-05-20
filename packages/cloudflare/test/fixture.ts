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
    text: string;
  }>;
  ok: boolean;
  provider: string;
  shell: Command;
  spawn: Command & Readonly<{ output: string }>;
}>;

export type Result = Readonly<{
  body: Payload;
  response: Response;
}>;

export type Coverage = Readonly<{
  fixture: string;
  features: readonly string[];
  provider: string;
  uncovered: readonly string[];
}>;

const route = "/sandbox-sdk/live";

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

const endpoint = (): URL =>
  new URL(route, required("CLOUDFLARE_SANDBOX_WORKER_URL"));

const headers = (): HeadersInit => ({
  authorization: `Bearer ${required("CLOUDFLARE_SANDBOX_TOKEN")}`,
});

export const enabled = (): boolean =>
  env("CLOUDFLARE_SANDBOX_WORKER_URL") !== undefined &&
  env("CLOUDFLARE_SANDBOX_TOKEN") !== undefined;

export const execute = async (): Promise<Result> => {
  const response = await fetch(endpoint(), {
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
