import { expect } from "bun:test";

import type { Capabilities } from "@sandbox-sdk/core";

type Command = Readonly<{
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}>;

export type Coverage = Readonly<{
  features: readonly string[];
  fixture: string;
  provider: string;
  uncovered: readonly string[];
}>;

export type Workflow = Readonly<{
  capabilities: Capabilities;
  commands: Readonly<{
    create: string;
    exec: string;
    shell: string;
  }>;
  exec: Command;
  failure: Command;
  file: Readonly<{
    exists: boolean;
    listed: boolean;
    read: string;
    stream: string;
    text: string;
  }>;
  inputs: Readonly<{
    blob: string;
    buffer: string;
    bytes: string;
    stream: string;
  }>;
  ok: boolean;
  port: Readonly<{
    port: number;
    tokenUrl: string;
    url: string;
  }>;
  provider: string;
  raw: Readonly<{
    interpreter: Readonly<{
      javascript: string;
      python: string;
    }>;
    setup: Readonly<{
      currentStepIndex: number;
      status: string;
      steps: number;
    }>;
    tasks: Readonly<{
      count: number;
    }>;
    terminal: Readonly<{
      output: string;
    }>;
    watching: Readonly<{
      observed: boolean;
    }>;
  }>;
  shell: Command;
  spawn: Command & Readonly<{ output: string }>;
}>;

export type Source = Readonly<{
  capabilities: Capabilities;
  file: Readonly<{
    text: string;
  }>;
  ok: boolean;
  provider: string;
  snapshot: Readonly<{
    id: string;
    name?: string;
  }>;
  source: string;
}>;

export const expectCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("codesandbox");
  expect(payload.fixture).toBe("workflow");
  expect(payload.features).toEqual([
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
  ]);
  expect(payload.uncovered).toEqual(["snapshots.restore"]);
};

export const expectSourceCoverage = (payload: Coverage): void => {
  expect(payload.provider).toBe("codesandbox");
  expect(payload.fixture).toBe("source");
  expect(payload.features).toEqual([
    "capabilities",
    "snapshots.create",
    "snapshotSource",
    "files.text",
    "sandbox.raw.delete",
  ]);
  expect(payload.uncovered).toEqual(["snapshots.restore"]);
};

export const expectWorkflow = (payload: Workflow): void => {
  expect(payload.ok).toBe(true);
  expect(payload.provider).toBe("codesandbox");
  expect(payload.capabilities.files).toBe(true);
  expect(payload.capabilities.ports).toBe("dynamic");
  expect(payload.capabilities.processExec).toBe(true);
  expect(payload.capabilities.processSpawn).toBe(true);
  expect(payload.capabilities.snapshotCreate).toBe("memory");
  expect(payload.capabilities.snapshotRestore).toBe(false);
  expect(payload.capabilities.snapshotSource).toBe("create-time");
  expect(payload.file).toEqual({
    exists: true,
    listed: true,
    read: "hello from codesandbox",
    stream: "hello from codesandbox",
    text: "hello from codesandbox",
  });
  expect(payload.inputs).toEqual({
    blob: "blob",
    buffer: "buffer",
    bytes: "bytes",
    stream: "stream",
  });
  expect(payload.commands).toEqual({
    create: "create-env",
    exec: "exec-env",
    shell: "shell-env",
  });
  expect(payload.exec).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from codesandbox",
  });
  expect(payload.shell).toMatchObject({
    code: 0,
    ok: true,
    stdout: "hello from codesandbox",
  });
  expect(payload.failure).toMatchObject({
    code: 7,
    ok: false,
  });
  expect(payload.failure.stderr).toContain("failed");
  expect(payload.spawn).toMatchObject({
    code: 0,
    ok: true,
  });
  expect(payload.spawn.output).toContain("hello from codesandbox");
  expect(payload.port.port).toBe(3000);
  expect(payload.port.url).toMatch(/^https:\/\//u);
  expect(payload.port.tokenUrl).toMatch(/^https:\/\//u);
  expect(payload.port.tokenUrl).toContain("preview_token=");
  expect(payload.raw.interpreter.javascript).toBe("raw javascript");
  expect(payload.raw.interpreter.python).toBe("raw python");
  expect(payload.raw.setup.status).toBeTruthy();
  expect(payload.raw.setup.steps).toBeGreaterThanOrEqual(0);
  expect(payload.raw.tasks.count).toBeGreaterThanOrEqual(0);
  expect(payload.raw.terminal.output).toBe("raw terminal");
  expect(payload.raw.watching.observed).toBe(true);
};

export const expectSource = (payload: Source): void => {
  expect(payload.ok).toBe(true);
  expect(payload.provider).toBe("codesandbox");
  expect(payload.capabilities.snapshotCreate).toBe("memory");
  expect(payload.capabilities.snapshotRestore).toBe(false);
  expect(payload.capabilities.snapshotSource).toBe("create-time");
  expect(payload.snapshot.id).toBeTruthy();
  expect(payload.source).toBe(payload.snapshot.id);
  expect(payload.file.text).toBe("ready");
};
