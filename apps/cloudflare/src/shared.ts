import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { create } from "@sandbox-sdk/core";
import type { Sandbox as CoreSandbox } from "@sandbox-sdk/core";

export type Env = Readonly<{
  Sandbox: DurableObjectNamespace<CloudflareSandbox>;
  SANDBOX_SDK_PREVIEW_HOST?: string;
  SANDBOX_SDK_TOKEN?: string;
}>;

const options = {
  containerTimeouts: {
    instanceGetTimeoutMS: 120_000,
    portReadyTimeoutMS: 120_000,
  },
  sleepAfter: "30s",
  transport: "rpc",
} as const;

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
  });

export const ignore = (): undefined => undefined;

export const instance = (
  env: Env,
  cwd: string,
  id: string,
  host?: string,
  variables?: Readonly<Record<string, string>>
): Promise<CoreSandbox> =>
  create({
    adapter: cloudflare({
      binding: env.Sandbox,
      ...(host === undefined ? {} : { hostname: host }),
      id,
      options,
    }),
    cwd,
    ...(variables === undefined ? {} : { env: variables }),
  });
