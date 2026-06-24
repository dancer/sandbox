import type { CloudflareRaw } from "@sandbox-sdk/cloudflare";
import type { Sandbox as CoreSandbox } from "@sandbox-sdk/core";

import type { Env } from "./shared";
import { ignore, instance, json } from "./shared";

export const handleRaw = async (env: Env): Promise<Response> => {
  const id = crypto.randomUUID();
  const cwd = `/workspace/${id}`;
  const rawFile = `${cwd}/raw.txt`;
  let sandbox: CoreSandbox<CloudflareRaw> | undefined;
  let sessionDeleted = false;
  let contextDeleted = false;

  try {
    sandbox = await instance(env, cwd, id);
    await sandbox.files.mkdir(cwd);
    const { raw } = sandbox;
    const session = await raw.createSession({
      cwd,
      env: { SANDBOX_SDK_RAW: "raw-session" },
    });
    const sessionResult = await session.exec('printf %s "$SANDBOX_SDK_RAW"');
    const sessionDelete = await raw.deleteSession(session.id);
    sessionDeleted = sessionDelete.success;
    const before = await raw.checkChanges(cwd);
    await raw.writeFile(rawFile, "changed");
    const after = await raw.checkChanges(cwd, { since: before.version });
    const context = await raw.createCodeContext({
      cwd,
      language: "javascript",
    });
    const codeResult = await raw.runCode("1 + 2", {
      context,
      language: "javascript",
    });
    const contexts = await raw.listCodeContexts();
    const contextListed = contexts.some((entry) => entry.id === context.id);
    await raw.deleteCodeContext(context.id);
    const remaining = await raw.listCodeContexts();
    contextDeleted = !remaining.some((entry) => entry.id === context.id);
    const result = codeResult.results.at(0)?.text ?? "";
    const rawMethods = {
      backup: typeof raw.createBackup === "function",
      buckets: typeof raw.mountBucket === "function",
      git: typeof raw.gitCheckout === "function",
      pty: typeof session.terminal === "function",
      websocket: typeof raw.wsConnect === "function",
    };
    const ok = [
      sessionResult.success,
      sessionResult.stdout === "raw-session",
      sessionDeleted,
      before.success,
      after.success,
      after.status === "changed",
      contextListed,
      contextDeleted,
      result === "3",
      rawMethods.backup,
      rawMethods.buckets,
      rawMethods.git,
      rawMethods.pty,
      rawMethods.websocket,
    ].every(Boolean);

    return json({
      capabilities: sandbox.capabilities,
      code: {
        contextDeleted,
        contextListed,
        result,
      },
      id,
      ok,
      provider: sandbox.provider,
      raw: rawMethods,
      session: {
        deleted: sessionDeleted,
        output: sessionResult.stdout,
      },
      watch: {
        after: after.version,
        before: before.version,
        changed: after.status === "changed",
      },
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "unknown",
        ok: false,
        raw: {
          contextDeleted,
          sessionDeleted,
        },
      },
      500
    );
  } finally {
    await sandbox?.stop().catch(ignore);
  }
};
