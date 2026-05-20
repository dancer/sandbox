import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { proxyToSandbox } from "@cloudflare/sandbox";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { create } from "@sandbox-sdk/core";
import type { Sandbox as CoreSandbox } from "@sandbox-sdk/core";

export { Sandbox } from "@cloudflare/sandbox";

type Env = Readonly<{
  Sandbox: DurableObjectNamespace<CloudflareSandbox>;
  SANDBOX_SDK_PREVIEW_HOST?: string;
  SANDBOX_SDK_TOKEN?: string;
}>;

const liveRoute = "/sandbox-sdk/live";
const portsRoute = "/sandbox-sdk/ports";
const message = "hello from cloudflare";
const port = 8080;
const portMessage = "hello from cloudflare port";
const ready = `import time
import urllib.request

for _ in range(10):
    try:
        urllib.request.urlopen("http://127.0.0.1:8080", timeout=1).read()
        raise SystemExit(0)
    except Exception:
        time.sleep(0.5)

raise SystemExit(1)
`;

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

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const buffer = (value: string): ArrayBuffer => {
  const output = bytes(value);
  const copy = new Uint8Array(output.byteLength);
  copy.set(output);
  return copy.buffer;
};

const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const ignore = (): undefined => undefined;

const body = async (request: Request): Promise<{ hostname?: string }> => {
  if (request.headers.get("content-type")?.includes("application/json")) {
    return (await request.json()) as { hostname?: string };
  }
  return {};
};

const custom = (value: string | undefined): string | undefined => {
  const host = value?.trim();
  if (!host || host.endsWith(".workers.dev")) {
    return;
  }
  return host;
};

const hostname = async (
  request: Request,
  env: Env,
  url: URL
): Promise<string | undefined> => {
  const input = await body(request);
  return (
    custom(input.hostname) ??
    custom(env.SANDBOX_SDK_PREVIEW_HOST) ??
    custom(url.hostname)
  );
};

const failure = (error: unknown): Response =>
  json(
    {
      error: error instanceof Error ? error.message : "unknown",
      ok: false,
    },
    500
  );

const wait = async (sandbox: CoreSandbox, cwd: string): Promise<void> => {
  const result = await sandbox.process.exec("python", ["-c", ready], { cwd });
  if (!result.ok) {
    throw new Error("port server did not become ready");
  }
};

const instance = (
  env: Env,
  cwd: string,
  id: string,
  host?: string
): Promise<CoreSandbox> =>
  create({
    adapter: cloudflare({
      binding: env.Sandbox,
      ...(host === undefined ? {} : { hostname: host }),
      id,
    }),
    cwd,
  });

const handlePorts = async (
  request: Request,
  env: Env,
  url: URL
): Promise<Response> => {
  const host = await hostname(request, env, url);
  if (host === undefined) {
    return json({ error: "missing_preview_host", ok: false }, 422);
  }

  const id = crypto.randomUUID();
  const cwd = `/workspace/${id}`;
  const file = `${cwd}/index.html`;
  const sandbox = await instance(env, cwd, id, host);
  let running:
    | Awaited<ReturnType<CoreSandbox["process"]["spawnShell"]>>
    | undefined;

  try {
    await sandbox.files.write(file, portMessage);
    running = await sandbox.process.spawnShell(
      `python -m http.server ${port} --bind 0.0.0.0`,
      { cwd }
    );
    await wait(sandbox, cwd);
    const preview = await sandbox.ports.expose(port);
    const response = await fetch(preview.url);
    const content = await response.text();
    const ok =
      response.ok &&
      content.includes(portMessage) &&
      preview.port === port &&
      preview.url.startsWith("https://");

    return json({
      capabilities: sandbox.capabilities,
      ok,
      port: preview,
      provider: sandbox.provider,
      response: {
        ok: response.ok,
        status: response.status,
        text: content,
      },
    });
  } catch (error) {
    return failure(error);
  } finally {
    await running?.kill().catch(ignore);
    await sandbox.stop();
  }
};

const handleLive = async (env: Env, url: URL): Promise<Response> => {
  const id = crypto.randomUUID();
  const cwd = `/workspace/${id}`;
  const file = `${cwd}/message.txt`;
  const bytesFile = `${cwd}/bytes.txt`;
  const bufferFile = `${cwd}/buffer.txt`;
  const blobFile = `${cwd}/blob.txt`;
  const streamFile = `${cwd}/stream.txt`;
  const removeFile = `${cwd}/remove.txt`;
  const sandbox = await create({
    adapter: cloudflare({
      binding: env.Sandbox,
      hostname: url.hostname,
      id,
    }),
    cwd,
  });

  try {
    await sandbox.files.mkdir(cwd);
    await sandbox.files.write(file, message);
    await sandbox.files.write(bytesFile, bytes("bytes"));
    await sandbox.files.write(bufferFile, buffer("buffer"));
    await sandbox.files.write(blobFile, new Blob(["blob"]));
    await sandbox.files.write(streamFile, new Blob(["stream"]).stream());
    await sandbox.files.write(removeFile, "remove");

    const exists = await sandbox.files.exists(file);
    const content = await sandbox.files.text(file);
    const read = decode(await sandbox.files.read(file));
    const stream = await text(await sandbox.files.stream(file));
    const inputs = {
      blob: await sandbox.files.text(blobFile),
      buffer: decode(await sandbox.files.read(bufferFile)),
      bytes: decode(await sandbox.files.read(bytesFile)),
      stream: await text(await sandbox.files.stream(streamFile)),
    };
    const entries = await sandbox.files.list(cwd);
    const listed = entries.some((entry) => entry.path === file);
    await sandbox.files.remove(removeFile);
    const removed = !(await sandbox.files.exists(removeFile));
    const exec = await sandbox.process.exec("cat", [file]);
    const shell = await sandbox.process.shell(`cat ${file}`);
    const failed = await sandbox.process.exec("sh", [
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
      read === message &&
      stream === message &&
      inputs.blob === "blob" &&
      inputs.buffer === "buffer" &&
      inputs.bytes === "bytes" &&
      inputs.stream === "stream" &&
      removed &&
      exec.ok &&
      exec.stdout === message &&
      shell.ok &&
      shell.stdout === message &&
      !failed.ok &&
      failed.code === 7 &&
      failed.stderr.includes("failed") &&
      spawn.ok &&
      output.includes(message);

    return json({
      capabilities: sandbox.capabilities,
      exec,
      failure: failed,
      file: { exists, listed, read, stream, text: content },
      inputs,
      ok,
      provider: sandbox.provider,
      shell,
      spawn: { ...spawn, output },
    });
  } catch (error) {
    return failure(error);
  } finally {
    await sandbox.stop();
  }
};

const guard = (request: Request, env: Env, url: URL): Response | undefined => {
  if (url.pathname !== liveRoute && url.pathname !== portsRoute) {
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
};

export default {
  async fetch(request, env): Promise<Response> {
    const proxy = await proxyToSandbox(request, env);
    if (proxy) {
      return proxy;
    }

    const url = new URL(request.url);
    const blocked = guard(request, env, url);
    if (blocked) {
      return blocked;
    }

    if (url.pathname === portsRoute) {
      return handlePorts(request, env, url);
    }

    return handleLive(env, url);
  },
} satisfies ExportedHandler<Env>;
