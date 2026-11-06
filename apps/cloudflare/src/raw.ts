import type { CloudflareRaw } from "@sandbox-sdk/cloudflare";
import type { Sandbox as CoreSandbox } from "@sandbox-sdk/core";

import type { Context } from "./shared";
import { ignore, instance, json } from "./shared";

export const handleRaw = async (env: Context): Promise<Response> => {
  let sandbox: CoreSandbox<CloudflareRaw> | undefined;
  try {
    sandbox = await instance(env, "/workspace", env.id);
    const process = await sandbox.raw.exec([
      "node",
      "-e",
      "process.stdout.write(String(1 + 2))",
    ]);
    const output = await process.output();
    const result = new TextDecoder().decode(output.stdout);
    const inspection = await sandbox.raw.inspect();
    const raw = {
      exec: typeof sandbox.raw.exec === "function",
      network: typeof sandbox.raw.interceptOutboundHttp === "function",
      ports: typeof sandbox.raw.getTcpPort === "function",
      snapshots: typeof sandbox.raw.snapshotContainer === "function",
    };
    return json({
      capabilities: sandbox.capabilities,
      id: env.id,
      ok:
        output.exitCode === 0 &&
        result === "3" &&
        inspection !== null &&
        Object.values(raw).every(Boolean),
      provider: sandbox.provider,
      raw,
      result,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "unknown", ok: false },
      500
    );
  } finally {
    await sandbox?.stop().catch(ignore);
  }
};
