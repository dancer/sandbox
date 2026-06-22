import type { Result, Sandbox as CoreSandbox } from "@sandbox-sdk/core";

import { handleRaw } from "./raw";
import type { Env } from "./shared";
import { ignore, instance, json } from "./shared";

export { Sandbox } from "@cloudflare/sandbox";

const liveRoute = "/sandbox-sdk/live";
const portsRoute = "/sandbox-sdk/ports";
const rawRoute = "/sandbox-sdk/raw";
const cleanupRoute = "/sandbox-sdk/cleanup";
const message = "hello from cloudflare";
const port = 8080;
const portMessage = "hello from cloudflare port";
const waitMs = 500;
const serverFile = "server.js";
const server = `const http = require("http");
const fs = require("fs");

http
  .createServer((_, response) => {
    response.end(fs.readFileSync("index.html"));
  })
  .listen(8080, "0.0.0.0");
`;

const token = (env: Env): string | undefined => {
  const value = env.SANDBOX_SDK_TOKEN?.trim();
  return value || undefined;
};

const authorized = (request: Request, env: Env): boolean =>
  request.headers.get("authorization") === `Bearer ${token(env)}`;

const text = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

const sleep = (milliseconds: number): Promise<void> =>
  scheduler.wait(milliseconds);

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const buffer = (value: string): ArrayBuffer => {
  const output = bytes(value);
  const copy = new Uint8Array(output.byteLength);
  copy.set(output);
  return copy.buffer;
};

const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const failure = (error: unknown): Response =>
  json(
    {
      error: error instanceof Error ? error.message : "unknown",
      ok: false,
    },
    500
  );

const waitLocal = async (
  sandbox: CoreSandbox,
  cwd: string
): Promise<Result> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await sandbox.process.exec(
      "curl",
      ["-fsS", `http://127.0.0.1:${port}`],
      { cwd }
    );
    if (response.ok) {
      return response;
    }
    await sleep(waitMs);
  }

  throw new Error("port server did not become ready");
};

const handlePorts = async (env: Env): Promise<Response> => {
  const id = crypto.randomUUID();
  const cwd = `/workspace/${id}`;
  const file = `${cwd}/index.html`;
  const serverPath = `${cwd}/${serverFile}`;
  let sandbox: CoreSandbox | undefined;
  let preview: Awaited<ReturnType<CoreSandbox["ports"]["expose"]>> | undefined;
  let local: Result | undefined;

  try {
    sandbox = await instance(env, cwd, id);
    await sandbox.files.write(file, portMessage);
    await sandbox.files.write(serverPath, server);
    await sandbox.process.spawnShell(`node ${serverFile}`, { cwd });
    local = await waitLocal(sandbox, cwd);
    preview = await sandbox.ports.expose(port);

    return json({
      capabilities: sandbox.capabilities,
      id,
      local,
      ok:
        local.ok && preview.port === port && preview.url.startsWith("https://"),
      port: preview,
      provider: sandbox.provider,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "unknown",
        local,
        ok: false,
        port: preview,
      },
      500
    );
  }
};

const handleCleanup = async (request: Request, env: Env): Promise<Response> => {
  const input = (await request.json()) as { id?: string };
  if (!input.id) {
    return json({ error: "missing_id", ok: false }, 422);
  }

  try {
    const sandbox = await instance(env, "/workspace", input.id);
    await sandbox.stop();
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
};

const handleLive = async (env: Env): Promise<Response> => {
  const id = crypto.randomUUID();
  const cwd = `/workspace/${id}`;
  const file = `${cwd}/message.txt`;
  const bytesFile = `${cwd}/bytes.txt`;
  const bufferFile = `${cwd}/buffer.txt`;
  const blobFile = `${cwd}/blob.txt`;
  const streamFile = `${cwd}/stream.txt`;
  const removeFile = `${cwd}/remove.txt`;
  const createFile = `${cwd}/create-env.txt`;
  const execFile = `${cwd}/exec-env.txt`;
  const shellFile = `${cwd}/shell-env.txt`;
  let sandbox: CoreSandbox | undefined;

  try {
    sandbox = await instance(env, cwd, id, {
      SANDBOX_SDK_CREATE: "create-env",
    });
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
    const createOptions = await sandbox.process.exec(
      "sh",
      ["-lc", 'printf %s "$SANDBOX_SDK_CREATE" > create-env.txt'],
      { cwd }
    );
    const execOptions = await sandbox.process.exec(
      "sh",
      ["-lc", 'printf %s "$SANDBOX_SDK_EXEC" > exec-env.txt'],
      { cwd, env: { SANDBOX_SDK_EXEC: "exec-env" } }
    );
    const shellOptions = await sandbox.process.shell(
      'printf %s "$SANDBOX_SDK_SHELL" > shell-env.txt',
      { cwd, env: { SANDBOX_SDK_SHELL: "shell-env" } }
    );
    const exported = await sandbox.process.shell(
      "export SANDBOX_SDK_SESSION_MARKER=retained"
    );
    const isolated = await sandbox.process.shell(
      'test -z "$SANDBOX_SDK_SESSION_MARKER"'
    );
    const sessionless = exported.ok && isolated.ok;
    const commands = {
      create: await sandbox.files.text(createFile),
      exec: await sandbox.files.text(execFile),
      shell: await sandbox.files.text(shellFile),
    };
    const failed = await sandbox.process.exec("sh", [
      "-lc",
      "echo failed >&2; exit 7",
    ]);
    const running = await sandbox.process.spawnShell(`cat ${file}`);
    const [output, stdoutStream, stderrStream, spawn] = await Promise.all([
      text(running.output),
      running.stdout === undefined ? Promise.resolve("") : text(running.stdout),
      running.stderr === undefined ? Promise.resolve("") : text(running.stderr),
      running.result,
    ]);
    const ok = [
      exists,
      listed,
      content === message,
      read === message,
      stream === message,
      inputs.blob === "blob",
      inputs.buffer === "buffer",
      inputs.bytes === "bytes",
      inputs.stream === "stream",
      removed,
      exec.ok,
      exec.stdout === message,
      shell.ok,
      shell.stdout === message,
      createOptions.ok,
      execOptions.ok,
      shellOptions.ok,
      commands.create === "create-env",
      commands.exec === "exec-env",
      commands.shell === "shell-env",
      sessionless,
      !failed.ok,
      failed.code === 7,
      failed.stderr.includes("failed"),
      spawn.ok,
      output.includes(message),
      stdoutStream.includes(message),
      stderrStream === "",
    ].every(Boolean);

    return json({
      capabilities: sandbox.capabilities,
      commands,
      exec,
      failure: failed,
      file: { exists, listed, read, stream, text: content },
      inputs,
      ok,
      provider: sandbox.provider,
      sessionless,
      shell,
      spawn: { ...spawn, output, stderrStream, stdoutStream },
    });
  } catch (error) {
    return failure(error);
  } finally {
    await sandbox?.stop().catch(ignore);
  }
};

const guard = (request: Request, env: Env, url: URL): Response | undefined => {
  if (
    url.pathname !== liveRoute &&
    url.pathname !== portsRoute &&
    url.pathname !== rawRoute &&
    url.pathname !== cleanupRoute
  ) {
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
  fetch(request, env): Promise<Response> | Response {
    const url = new URL(request.url);
    const blocked = guard(request, env, url);
    if (blocked) {
      return blocked;
    }

    if (url.pathname === portsRoute) {
      return handlePorts(env);
    }

    if (url.pathname === rawRoute) {
      return handleRaw(env);
    }

    if (url.pathname === cleanupRoute) {
      return handleCleanup(request, env);
    }

    return handleLive(env);
  },
} satisfies ExportedHandler<Env>;
