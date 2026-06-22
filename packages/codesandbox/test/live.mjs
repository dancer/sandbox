import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { create } from "@sandbox-sdk/core";

import { codesandbox } from "../dist/index.js";

const token = process.env.CSB_API_KEY?.trim();

if (!token) {
  console.log(
    "codesandbox live verifier skipped because CSB_API_KEY is missing"
  );
  process.exit(0);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytes = (value) => encoder.encode(value);

const buffer = (value) => {
  const output = bytes(value);
  const copy = new Uint8Array(output.byteLength);
  copy.set(output);
  return copy.buffer;
};

const text = (stream) => new Response(stream).text();

const decode = (value) => decoder.decode(value);

const limit = async (promise, label, milliseconds = 300_000) => {
  const controller = new AbortController();
  const expire = async () => {
    await sleep(milliseconds, undefined, { signal: controller.signal });
    throw new Error(`${label} timed out`);
  };
  try {
    return await Promise.race([promise, expire()]);
  } finally {
    controller.abort();
  }
};

const coverage = {
  features: [
    "capabilities",
    "files.mkdir",
    "files.write",
    "files.write.bytes",
    "files.write.arrayBuffer",
    "files.write.blob",
    "files.write.readableStream",
    "files.exists",
    "files.read",
    "files.stream",
    "files.text",
    "files.list",
    "files.remove",
    "environment.create",
    "process.exec",
    "process.exec.options",
    "process.shell",
    "process.shell.options",
    "process.spawnShell",
    "process.failure",
    "ports.expose",
    "ports.expose.token",
    "snapshots.create",
    "snapshotSource",
    "sandbox.raw.delete",
    "sandbox.raw.interpreter",
    "sandbox.raw.lifecycle",
    "sandbox.raw.previews",
    "sandbox.raw.pty",
    "sandbox.raw.sessions",
    "sandbox.raw.watching",
  ],
  fixture: "workflow",
  provider: "codesandbox",
  uncovered: ["snapshots.restore"],
};

const sourceCoverage = {
  features: [
    "capabilities",
    "snapshots.create",
    "snapshotSource",
    "files.text",
    "sandbox.raw.delete",
  ],
  fixture: "source",
  provider: "codesandbox",
  uncovered: ["snapshots.restore"],
};

const path = (directory, name) => `${directory}/${name}`;

const command = (value) => {
  assert.equal(value.ok, true);
  assert.equal(value.code, 0);
  return value;
};

const failure = (value) => {
  assert.equal(value.ok, false);
  assert.equal(value.code, 7);
  assert.match(`${value.stdout}\n${value.stderr}`, /failed/u);
  return value;
};

const ignore = (error) => error;

const sanitize = (payload) => ({
  ...payload,
  failure: {
    code: payload.failure.code,
    ok: payload.failure.ok,
    stderr: "failed\n",
    stdout: "",
  },
  port: {
    ...payload.port,
    tokenUrl: "https://preview.csb.app?preview_token=token",
    url: "https://preview.csb.app",
  },
});

const sanitizeSource = (payload) => ({
  ...payload,
  snapshot: { ...payload.snapshot, id: "snapshot" },
  source: "snapshot",
});

const write = async (name, fixture) => {
  const current = import.meta.dirname;
  const file = path(`${current}/__fixtures__`, `${name}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
};

const workflow = async (sandbox) => {
  const content = "hello from codesandbox";
  const root = `/project/sandbox/sandbox-sdk-${randomUUID()}`;
  const file = path(root, "message.txt");
  const bytesFile = path(root, "bytes.txt");
  const bufferFile = path(root, "buffer.txt");
  const blobFile = path(root, "blob.txt");
  const streamFile = path(root, "stream.txt");
  const removeFile = path(root, "remove.txt");
  const createFile = path(root, "create-env.txt");
  const execFile = path(root, "exec-env.txt");
  const shellFile = path(root, "shell-env.txt");

  await sandbox.files.mkdir(root);
  await sandbox.files.write(file, content);
  await sandbox.files.write(bytesFile, bytes("bytes"));
  await sandbox.files.write(bufferFile, buffer("buffer"));
  await sandbox.files.write(blobFile, new Blob(["blob"]));
  await sandbox.files.write(streamFile, new Blob(["stream"]).stream());
  await sandbox.files.write(removeFile, "remove");

  const entries = await sandbox.files.list(root);
  await sandbox.files.remove(removeFile);

  const exec = command(await sandbox.process.exec("cat", [file]));
  const shell = command(await sandbox.process.shell(`cat ${file}`));
  command(
    await sandbox.process.exec(
      "sh",
      ["-lc", 'printf %s "$SANDBOX_SDK_CREATE" > create-env.txt'],
      { cwd: root }
    )
  );
  command(
    await sandbox.process.exec(
      "sh",
      ["-lc", 'printf %s "$SANDBOX_SDK_EXEC" > exec-env.txt'],
      { cwd: root, env: { SANDBOX_SDK_EXEC: "exec-env" } }
    )
  );
  command(
    await sandbox.process.shell(
      'printf %s "$SANDBOX_SDK_SHELL" > shell-env.txt',
      { cwd: root, env: { SANDBOX_SDK_SHELL: "shell-env" } }
    )
  );
  const commands = {
    create: await sandbox.files.text(createFile),
    exec: await sandbox.files.text(execFile),
    shell: await sandbox.files.text(shellFile),
  };
  const running = await sandbox.process.spawnShell(`cat ${file}`);
  const output = await text(running.output);
  const spawned = command(await running.result);
  const failed = failure(
    await sandbox.process.exec("sh", ["-lc", "echo failed >&2; exit 7"])
  );
  const server = await sandbox.process.spawnShell(
    "node -e \"require('http').createServer((_, response) => response.end('ok')).listen(3000)\"",
    { cwd: root }
  );

  try {
    const preview = await sandbox.ports.expose(3000);
    let tokenUrl = "";
    const previewToken = await sandbox.raw.sdk.hosts.createToken(sandbox.id, {
      expiresAt: new Date(Date.now() + 300_000),
    });
    try {
      const tokenPreview = await sandbox.ports.expose(3000, {
        token: previewToken.token,
      });
      tokenUrl = tokenPreview.url;
      assert.match(tokenUrl, /preview_token=/u);
    } finally {
      await sandbox.raw.sdk.hosts.revokeToken(sandbox.id, previewToken.tokenId);
    }

    const payload = {
      capabilities: sandbox.capabilities,
      commands,
      exec,
      failure: failed,
      file: {
        exists: await sandbox.files.exists(file),
        listed: entries.some((entry) => entry.path === file),
        read: decode(await sandbox.files.read(file)),
        stream: await text(await sandbox.files.stream(file)),
        text: await sandbox.files.text(file),
      },
      inputs: {
        blob: await sandbox.files.text(blobFile),
        buffer: decode(await sandbox.files.read(bufferFile)),
        bytes: decode(await sandbox.files.read(bytesFile)),
        stream: await text(await sandbox.files.stream(streamFile)),
      },
      ok: true,
      port: { ...preview, tokenUrl },
      provider: sandbox.provider,
      shell,
      spawn: { ...spawned, output },
    };

    assert.equal(payload.provider, "codesandbox");
    assert.equal(payload.file.text, content);
    assert.equal(payload.file.read, content);
    assert.equal(payload.file.stream, content);
    assert.equal(payload.file.exists, true);
    assert.equal(payload.file.listed, true);
    assert.equal(await sandbox.files.exists(removeFile), false);
    assert.equal(payload.inputs.blob, "blob");
    assert.equal(payload.inputs.buffer, "buffer");
    assert.equal(payload.inputs.bytes, "bytes");
    assert.equal(payload.inputs.stream, "stream");
    assert.equal(payload.commands.exec, "exec-env");
    assert.equal(payload.commands.create, "create-env");
    assert.equal(payload.commands.shell, "shell-env");
    assert.equal(payload.exec.stdout, content);
    assert.equal(payload.shell.stdout, content);
    assert.match(payload.spawn.output, /hello from codesandbox/u);
    assert.equal(payload.port.port, 3000);
    assert.match(payload.port.url, /^https:\/\//u);
    assert.match(payload.port.tokenUrl, /^https:\/\//u);
    assert.match(payload.port.tokenUrl, /preview_token=/u);

    return payload;
  } finally {
    await server.kill().catch(ignore);
  }
};

const source = async (sandbox) => {
  const root = `/project/sandbox/sandbox-sdk-source-${randomUUID()}`;
  const file = path(root, "snapshot.txt");
  let derived;

  await sandbox.files.mkdir(root);
  await sandbox.files.write(file, "ready");
  const snapshot = await sandbox.snapshots.create();

  try {
    derived = await create({
      adapter: codesandbox({
        stop: "delete",
        token,
      }),
      cwd: root,
      snapshot: snapshot.id,
    });
    const content = await derived.files.text(file);
    const payload = {
      capabilities: derived.capabilities,
      file: { text: content },
      ok: content === "ready",
      provider: derived.provider,
      snapshot,
      source: snapshot.id,
    };

    assert.equal(payload.provider, "codesandbox");
    assert.equal(payload.file.text, "ready");
    assert.equal(payload.source, snapshot.id);
    assert.equal(payload.capabilities.snapshotCreate, "memory");
    assert.equal(payload.capabilities.snapshotSource, "create-time");
    assert.equal(payload.capabilities.snapshotRestore, false);

    return payload;
  } finally {
    await derived?.stop().catch(ignore);
  }
};

const event = async (subscribe, action, label) => {
  let listener;
  const pending = Promise.withResolvers();
  try {
    listener = subscribe(pending.resolve);
    const [, value] = await limit(
      Promise.all([action(), pending.promise]),
      label,
      60_000
    );
    return value;
  } finally {
    listener?.dispose?.();
  }
};

const raw = async (sandbox) => {
  assert.equal(sandbox.raw.sandbox.id, sandbox.id);
  assert.equal(typeof sandbox.raw.sandbox.bootupType, "string");
  assert.equal(typeof sandbox.raw.sandbox.createSession, "function");
  assert.equal(typeof sandbox.raw.sandbox.updateHibernationTimeout, "function");
  assert.equal(typeof sandbox.raw.sandbox.updateTier, "function");
  assert.equal(typeof sandbox.raw.sdk.hosts?.createToken, "function");
  assert.equal(typeof sandbox.raw.client.fs.watch, "function");
  assert.equal(typeof sandbox.raw.client.interpreters.javascript, "function");
  assert.equal(typeof sandbox.raw.client.interpreters.python, "function");
  assert.equal(typeof sandbox.raw.client.terminals.create, "function");
  assert.equal(typeof sandbox.raw.client.tasks.getAll, "function");
  assert.equal(typeof sandbox.raw.client.setup.status, "string");

  await sandbox.raw.sandbox.updateHibernationTimeout(300);

  const sessionId = `sdk${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const session = await sandbox.raw.sandbox.createSession({
    env: { SANDBOX_SDK_RAW: "raw" },
    id: sessionId,
    permission: "write",
  });
  assert.equal(session.sandboxId, sandbox.id);

  const previewToken = await sandbox.raw.sdk.hosts.createToken(sandbox.id, {
    expiresAt: new Date(Date.now() + 300_000),
  });
  try {
    assert.equal(previewToken.sandboxId, sandbox.id);
    assert.ok(previewToken.tokenId);
    assert.ok(previewToken.token);
    assert.match(
      sandbox.raw.sdk.hosts.getUrl(previewToken, 3000),
      /preview_token=/u
    );
    assert.ok(
      sandbox.raw.sdk.hosts.getHeaders(previewToken)["csb-preview-token"]
    );
    assert.ok(sandbox.raw.sdk.hosts.getCookies(previewToken).csb_preview_token);
    const tokens = await sandbox.raw.sdk.hosts.listTokens(sandbox.id);
    assert.ok(
      tokens.some((current) => current.tokenId === previewToken.tokenId)
    );
  } finally {
    await sandbox.raw.sdk.hosts.revokeToken(sandbox.id, previewToken.tokenId);
  }

  const root = path(sandbox.cwd, `sandbox-sdk-raw-${randomUUID()}`);
  const watchedFile = path(root, "watched.txt");
  await sandbox.files.mkdir(root);

  const watcher = await sandbox.raw.client.fs.watch(root, { recursive: true });
  try {
    const watched = await event(
      (resolve) => watcher.onEvent(resolve),
      () => sandbox.files.write(watchedFile, "watch"),
      "codesandbox file watcher"
    );
    assert.ok(watched.paths.some((current) => current.includes("watched.txt")));
  } finally {
    watcher.dispose();
  }

  const terminal = await sandbox.raw.client.terminals.create("bash", {
    cwd: root,
  });
  let terminalOutput = "";
  const terminalEvent = await event(
    (resolve) =>
      terminal.onOutput((value) => {
        terminalOutput += value;
        if (terminalOutput.includes("raw terminal")) {
          resolve(terminalOutput);
        }
      }),
    async () => {
      await terminal.open();
      await terminal.run("printf 'raw terminal\\n'");
    },
    "codesandbox terminal output"
  );
  await terminal.kill();
  assert.match(terminalEvent, /raw terminal/u);

  const javascript =
    await sandbox.raw.client.interpreters.javascript("'raw javascript'");
  const python = await sandbox.raw.client.interpreters.python("'raw python'");
  const tasks = await sandbox.raw.client.tasks.getAll();
  const { setup } = sandbox.raw.client;

  assert.match(javascript, /raw javascript/u);
  assert.match(python, /raw python/u);
  assert.ok(Array.isArray(tasks));

  return {
    interpreter: {
      javascript: javascript.trim(),
      python: python.trim(),
    },
    setup: {
      currentStepIndex: setup.currentStepIndex,
      status: setup.status,
      steps: setup.getSteps().length,
    },
    tasks: {
      count: tasks.length,
    },
    terminal: {
      output: "raw terminal",
    },
    watching: {
      observed: true,
    },
  };
};

const sandbox = await create({
  adapter: codesandbox({
    stop: "delete",
    token,
  }),
  cwd: "/project/sandbox",
  env: { SANDBOX_SDK_CREATE: "create-env" },
});

try {
  const payload = await limit(workflow(sandbox), "codesandbox workflow");
  const rawPayload = await limit(raw(sandbox), "codesandbox raw features");
  const sourcePayload = await limit(
    source(sandbox),
    "codesandbox snapshot source"
  );
  const fixture = {
    coverage,
    payload: { ...sanitize(payload), raw: rawPayload },
  };
  const sourceFixture = {
    coverage: sourceCoverage,
    payload: sanitizeSource(sourcePayload),
  };

  if (process.env.SANDBOX_SDK_RECORD_FIXTURES === "1") {
    await write("workflow", fixture);
    await write("source", sourceFixture);
  }

  console.log("codesandbox live verifier passed");
} finally {
  await sandbox.stop();
}
