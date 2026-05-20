import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { create } from "@sandbox-sdk/core";

export { Sandbox } from "@cloudflare/sandbox";

type Env = Readonly<{
  Sandbox: DurableObjectNamespace<CloudflareSandbox>;
  SANDBOX_SDK_TOKEN?: string;
}>;

const route = "/sandbox-sdk/live";
const message = "hello from cloudflare";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
  });

const token = (env: Env): string | undefined => {
  const value = env.SANDBOX_SDK_TOKEN?.trim();
  return value || undefined;
};

const authorized = (request: Request, env: Env): boolean =>
  request.headers.get("authorization") === `Bearer ${token(env)}`;

const text = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== route) {
      return json({ error: "not_found", ok: false }, 404);
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed", ok: false }, 405);
    }
    if (token(env) === undefined) {
      return json({ error: "missing_token", ok: false }, 503);
    }
    if (!authorized(request, env)) {
      return json({ error: "unauthorized", ok: false }, 401);
    }

    const id = crypto.randomUUID();
    const cwd = `/workspace/${id}`;
    const file = `${cwd}/message.txt`;
    const sandbox = await create({
      adapter: cloudflare({
        binding: env.Sandbox,
        hostname: url.hostname,
        id,
      }),
      cwd,
    });

    try {
      await sandbox.files.write(file, message);

      const exists = await sandbox.files.exists(file);
      const content = await sandbox.files.text(file);
      const entries = await sandbox.files.list(cwd);
      const listed = entries.some((entry) => entry.path === file);
      const exec = await sandbox.process.exec("cat", [file]);
      const shell = await sandbox.process.shell(`cat ${file}`);
      const failure = await sandbox.process.exec("sh", [
        "-lc",
        "echo failed >&2; exit 7",
      ]);
      const running = await sandbox.process.spawnShell(`cat ${file}`);
      const output = await text(running.output);
      const spawn = await running.result;
      const ok =
        exists &&
        listed &&
        content === message &&
        exec.ok &&
        exec.stdout === message &&
        shell.ok &&
        shell.stdout === message &&
        !failure.ok &&
        failure.code === 7 &&
        failure.stderr.includes("failed") &&
        spawn.ok &&
        output.includes(message);

      return json({
        capabilities: sandbox.capabilities,
        exec,
        failure,
        file: { exists, listed, text: content },
        ok,
        provider: sandbox.provider,
        shell,
        spawn: { ...spawn, output },
      });
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "unknown",
          ok: false,
        },
        500
      );
    } finally {
      await sandbox.stop();
    }
  },
} satisfies ExportedHandler<Env>;
