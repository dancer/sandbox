import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { create } from "@sandbox-sdk/core";

import { record, workflowFixture } from "../../../test/fixture";
import { workflow } from "../../../test/workflow";
import { daytona } from "../src/index";

const credentialed = Boolean(
  process.env.DAYTONA_API_KEY ||
  (process.env.DAYTONA_JWT_TOKEN && process.env.DAYTONA_ORGANIZATION_ID)
);
const enabled = credentialed;
const live = enabled ? test : test.skip;

const withTimeout = async <Value>(
  promise: Promise<Value>,
  label: string,
  milliseconds = 60_000
): Promise<Value> => {
  const controller = new AbortController();
  const timeout = (async (): Promise<never> => {
    await delay(milliseconds, undefined, {
      signal: controller.signal,
    });
    throw new Error(`${label} timed out`);
  })();

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    controller.abort();
  }
};

const waitFor = async (
  predicate: () => boolean,
  label: string,
  milliseconds = 10_000
): Promise<void> => {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > milliseconds) {
      throw new Error(`${label} timed out`);
    }

    await delay(100);
  }
};

live("daytona runs a live sandbox workflow", async () => {
  const cwd = `/tmp/sandbox-sdk-${randomUUID()}`;
  const sandbox = await create({
    adapter: daytona({
      deleteOnStop: true,
      networkBlockAll: false,
      timeout: 300_000,
    }),
    cwd,
    env: { SANDBOX_SDK_CREATE: "create-env" },
  });

  try {
    const payload = await workflow(sandbox, {
      content: "hello from daytona",
      cwd,
      port: 3000,
    });
    await record(
      new URL("__fixtures__/workflow.json", import.meta.url),
      workflowFixture("daytona", payload, [
        "snapshots.create",
        "snapshotSource",
      ])
    );
  } finally {
    await sandbox.stop();
  }
});

live("daytona exposes advertised raw capabilities", async () => {
  const cwd = `/tmp/sandbox-sdk-raw-${randomUUID()}`;
  const pty = `sandbox-sdk-${randomUUID()}`;
  let output = "";
  const sandbox = await create({
    adapter: daytona({
      deleteOnStop: true,
      timeout: 300_000,
    }),
    cwd,
  });

  try {
    await sandbox.process.exec("git", ["init", "-b", "main"], { cwd });
    await sandbox.files.write(`${cwd}/raw.txt`, "raw");

    await sandbox.raw.git.add(cwd, ["raw.txt"]);
    const commit = await sandbox.raw.git.commit(
      cwd,
      "raw",
      "sandbox sdk",
      "sandbox@example.com"
    );
    expect(commit.sha).toBeTruthy();

    const git = await sandbox.raw.git.status(cwd);
    expect(git.currentBranch).toBe("main");

    const labels = await sandbox.raw.setLabels({ sandboxSdk: "raw" });
    expect(labels.sandboxSdk).toBe("raw");
    expect(sandbox.raw.networkBlockAll).toBe(false);
    expect(typeof sandbox.raw.cpu).toBe("number");
    expect(typeof sandbox.raw.memory).toBe("number");
    expect(typeof sandbox.raw.disk).toBe("number");
    expect(typeof sandbox.raw.resize).toBe("function");
    expect(typeof sandbox.raw.waitForResizeComplete).toBe("function");

    await sandbox.raw.setAutostopInterval(15);

    const ssh = await sandbox.raw.createSshAccess(1);
    expect(ssh.token).toBeTruthy();
    await sandbox.raw.revokeSshAccess(ssh.token);

    const lsp = await sandbox.raw.createLspServer("typescript", cwd);
    expect(typeof lsp.start).toBe("function");
    expect(typeof lsp.stop).toBe("function");

    const sessionId = `sandbox-sdk-session-${randomUUID()}`;
    await sandbox.raw.process.createSession(sessionId);
    try {
      const sessionCommand = await sandbox.raw.process.executeSessionCommand(
        sessionId,
        {
          command: "printf raw-session",
          suppressInputEcho: true,
        }
      );
      const sessionLogs = await sandbox.raw.process.getSessionCommandLogs(
        sessionId,
        sessionCommand.cmdId
      );
      const sessions = await sandbox.raw.process.listSessions();
      expect(
        sessions.some(
          (currentSession) => currentSession.sessionId === sessionId
        )
      ).toBe(true);
      expect(sessionLogs.stdout ?? sessionLogs.output ?? "").toContain(
        "raw-session"
      );
    } finally {
      await sandbox.raw.process.deleteSession(sessionId);
    }

    const signed = await sandbox.raw.getSignedPreviewUrl(3001, 60);
    expect(signed.url).toMatch(/^https:\/\//u);
    expect(signed.token).toBeTruthy();
    await sandbox.raw.expireSignedPreviewUrl(3001, signed.token);

    const context = await sandbox.raw.codeInterpreter.createContext(cwd);
    try {
      const interpreter = await sandbox.raw.codeInterpreter.runCode(
        'print("raw-interpreter")',
        { context }
      );
      expect(interpreter.stdout).toContain("raw-interpreter");
      expect(interpreter.error).toBeUndefined();
    } finally {
      await sandbox.raw.codeInterpreter.deleteContext(context);
    }

    const handle = await withTimeout(
      sandbox.raw.process.createPty({
        cols: 80,
        cwd,
        id: pty,
        onData: (chunk) => {
          output += new TextDecoder().decode(chunk);
        },
        rows: 24,
      }),
      "daytona pty create"
    );

    try {
      const sessions = await sandbox.raw.process.listPtySessions();
      expect(sessions.some((session) => session.id === pty)).toBe(true);
      const info = await sandbox.raw.process.getPtySessionInfo(pty);
      expect(info.id).toBe(pty);
      const resized = await sandbox.raw.process.resizePtySession(pty, 100, 30);
      expect(resized.cols).toBe(100);
      expect(resized.rows).toBe(30);

      await handle.sendInput("printf raw-pty\\n");
      await waitFor(() => output.includes("raw-pty"), "daytona pty output");
      await withTimeout(handle.kill(), "daytona pty kill");
    } finally {
      await handle.disconnect();
    }
  } finally {
    await sandbox.stop();
  }
});

live("daytona creates a linked sandbox", async () => {
  const source = await create({
    adapter: daytona({
      deleteOnStop: true,
      ephemeral: true,
      timeout: 300_000,
    }),
  });
  let linked: typeof source | undefined;

  try {
    linked = await create({
      adapter: daytona({
        deleteOnStop: true,
        ephemeral: true,
        linkedSandbox: source.id,
        timeout: 300_000,
      }),
    });
    await linked.raw.refreshData();
    expect(linked.raw.linkedSandboxId).toBe(source.id);
  } finally {
    await linked?.stop();
    await source.stop();
  }
});
