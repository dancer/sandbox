import { cloudflare } from "@sandbox-sdk/cloudflare";
import type { CloudflareRaw } from "@sandbox-sdk/cloudflare";
import { create } from "@sandbox-sdk/core";
import type { Sandbox as CoreSandbox } from "@sandbox-sdk/core";

import type { Native } from "./index";

export type Env = Readonly<{
  Sandbox: DurableObjectNamespace<Native>;
  SANDBOX_SDK_TOKEN?: string;
}>;

export type Context = Readonly<{
  container: Container;
  id: string;
  url: string;
  SANDBOX_SDK_TOKEN?: string;
  waitUntil(promise: Promise<unknown>): void;
}>;

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status });
export const ignore = (): undefined => undefined;

export const instance = (
  env: Context,
  cwd: string,
  id: string,
  variables?: Readonly<Record<string, string>>
): Promise<CoreSandbox<CloudflareRaw>> =>
  create({
    adapter: cloudflare({
      container: env.container,
      id,
      preview: (port) => ({
        headers: { authorization: `Bearer ${env.SANDBOX_SDK_TOKEN}` },
        port,
        url: `${env.url}/preview/${id}/${port}/`,
      }),
      startup: { enableInternet: false, entrypoint: ["sleep", "infinity"] },
    }),
    cwd,
    timeout: 300_000,
    ...(variables === undefined ? {} : { env: variables }),
  });
