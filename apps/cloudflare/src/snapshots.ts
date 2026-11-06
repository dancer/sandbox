import type { CloudflareRaw } from "@sandbox-sdk/cloudflare";
import type { Sandbox } from "@sandbox-sdk/core";

import type { Context } from "./shared";
import { ignore, instance, json } from "./shared";

export const snapshots = async (env: Context): Promise<Response> => {
  let sandbox: Sandbox<CloudflareRaw> | undefined;
  try {
    sandbox = await instance(env, "/workspace", env.id);
    await sandbox.files.write("checkpoint.txt", "checkpoint");
    const snapshot = await sandbox.snapshots.create(`verification-${env.id}`);
    await sandbox.files.write("checkpoint.txt", "changed");
    await sandbox.snapshots.restore(snapshot.id);
    const restored = await sandbox.files.text("checkpoint.txt");
    await sandbox.stop();
    sandbox = await instance(env, "/workspace", env.id, undefined, snapshot.id);
    const source = await sandbox.files.text("checkpoint.txt");
    return json({
      ok: restored === "checkpoint" && source === "checkpoint",
      restored,
      source,
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
