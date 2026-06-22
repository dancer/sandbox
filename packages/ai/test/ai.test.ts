import { expect, test } from "bun:test";

import { RunContext } from "@openai/agents";
import { create, isSandboxError } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

import { claude } from "../src/claude";
import type { SandboxSession } from "../src/index";
import { aisdk, tools } from "../src/index";
import { openai } from "../src/openai";

interface OpenAiTool {
  name: string;
  needsApproval: (...args: unknown[]) => Promise<boolean>;
  parameters: unknown;
  strict: boolean;
  type: "function";
  invoke(context: RunContext, input: string): Promise<unknown>;
}

interface ClaudeCall {
  content: { text: string; type: "text" }[];
  isError?: true;
  structuredContent?: unknown;
}

interface ClaudeTool {
  annotations?: Record<string, unknown>;
  handler(input: unknown, extra: unknown): Promise<ClaudeCall>;
  inputSchema: unknown;
  name: string;
}

const asOpenAiTool = (value: unknown): OpenAiTool => value as OpenAiTool;

const invokeOpenAi = (value: unknown, input: unknown): Promise<unknown> =>
  asOpenAiTool(value).invoke(new RunContext(), JSON.stringify(input));

const approvalOpenAi = (value: unknown): Promise<boolean> =>
  asOpenAiTool(value).needsApproval(new RunContext(), {}, "test-call");

const asClaudeTool = (value: unknown): ClaudeTool => value as ClaudeTool;

const collect = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(stream).text();

test("tools returns prompt context and selected tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec", "preview"],
    cwd: "/workspace",
    maxOutput: 5,
  });

  expect(kit.description).toContain("isolated local sandbox");
  expect(kit.description).toContain("/workspace");
  expect(kit.description).not.toContain("snapshot creation");
  expect(kit.description).not.toContain("snapshot restore");
  expect(kit.description).toContain(
    "No provider-specific raw capabilities are advertised."
  );
  expect(Object.keys(kit.tools).toSorted()).toEqual([
    "exec",
    "list",
    "preview",
    "read",
    "write",
  ]);
  expect(kit.sandbox.capabilities.files).toBe(true);
  expect(kit.sandbox.description).toBe(kit.description);
  expect(kit.sandbox.provider).toBe("local");
  expect(kit.sandbox.workingDirectory).toBe("/workspace");
  expect(kit.tools.exec?.inputSchema.jsonSchema).toMatchObject({
    additionalProperties: false,
  });
  const schema = kit.tools.exec?.inputSchema;
  if (!schema) {
    throw new Error("missing exec tool");
  }
  expect(schema).toMatchObject({
    jsonSchema: {
      additionalProperties: false,
    },
    "~standard": {
      vendor: "sandbox-sdk",
      version: 1,
    },
  });
  expect(kit.tools.exec?.strict).toBe(true);

  await sandbox.stop();
});

test("tools can read, write, list, and execute", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, { allow: ["read", "write", "list", "exec"] });

  await kit.tools.write?.execute({
    path: "/workspace/nested/file.txt",
    text: "hello",
  });

  const read = await kit.tools.read?.execute({
    path: "/workspace/nested/file.txt",
  });
  const list = await kit.tools.list?.execute({ path: "/workspace/nested" });
  const exec = await kit.tools.exec?.execute({
    args: ["hello"],
    command: "echo",
  });
  const shell = await kit.tools.exec?.execute({
    command: "printf shell",
  });
  const env = await kit.tools.exec?.execute({
    args: ["SANDBOX_VALUE"],
    command: "printenv",
    env: { SANDBOX_VALUE: "ok" },
  });

  expect(read?.text).toBe("hello");
  expect(
    list?.entries.some((entry) => entry.path === "/workspace/nested/file.txt")
  ).toBe(true);
  expect(exec?.stdout.trim()).toBe("hello");
  expect(shell?.stdout).toBe("shell");
  expect(env?.stdout.trim()).toBe("ok");

  await sandbox.stop();
});

test("tools default to read-only model-facing tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox);

  expect(Object.keys(kit.tools).toSorted()).toEqual(["list", "read"]);
  expect(kit.description).toContain("Allowed sandbox tools: read, list");

  await sandbox.stop();
});

test("tools expose an ai sdk sandbox shape", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec"],
    timeout: 10_000,
  });
  const agent: SandboxSession = kit.sandbox;
  const ai = aisdk(kit);

  const output = await agent.run({
    command: "printf ai",
    env: { SANDBOX_VALUE: "ai" },
    workingDirectory: "/workspace",
  });
  const command = await kit.sandbox.runCommand({
    command: "printf run",
    workingDirectory: "/workspace",
  });
  const compatibility = await kit.sandbox.executeCommand({
    command: "printf compat",
    workingDirectory: "/workspace",
  });

  expect(output).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: "ai",
  });
  expect(command).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: "run",
  });
  expect(compatibility).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: "compat",
  });
  expect(ai).toEqual({
    experimental_sandbox: kit.sandbox,
    instructions: kit.description,
    system: kit.description,
    tools: kit.tools,
  });

  await sandbox.stop();
});

test("ai sdk sandbox shape spawns streaming processes", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const agent: SandboxSession = tools(sandbox, {
    allow: ["read", "write", "list", "exec"],
  }).sandbox;

  const process = await agent.spawn({
    command: "printf $SANDBOX_VALUE && printf err >&2",
    env: { SANDBOX_VALUE: "stream" },
    workingDirectory: "/workspace",
  });
  const [stdout, stderr, result] = await Promise.all([
    collect(process.stdout),
    collect(process.stderr),
    process.wait(),
  ]);

  expect(stdout).toBe("stream");
  expect(stderr).toBe("err");
  expect(result).toEqual({ exitCode: 0 });

  await sandbox.stop();
});

test("ai sdk sandbox shape preserves abort reasons", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const agent: SandboxSession = tools(sandbox, {
    allow: ["exec"],
  }).sandbox;
  const controller = new AbortController();
  const process = await agent.spawn({
    abortSignal: controller.signal,
    command: "sleep 10",
  });
  const reason = new Error("cancelled");

  controller.abort(reason);

  await expect(process.wait()).rejects.toBe(reason);

  await sandbox.stop();
});

test("ai sdk filesystem reads preserve abort reasons over provider errors", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const controller = new AbortController();
  const reason = new Error("cancelled");
  const agent = tools({
    ...sandbox,
    files: {
      ...sandbox.files,
      read: () => {
        controller.abort(reason);
        return Promise.reject(new Error("provider failed"));
      },
    },
  }).sandbox;

  try {
    await expect(
      agent.readBinaryFile({
        abortSignal: controller.signal,
        path: "/workspace/file.txt",
      })
    ).rejects.toBe(reason);
  } finally {
    await sandbox.stop();
  }
});

test("ai sdk filesystem writes preserve abort reasons over provider errors", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const controller = new AbortController();
  const reason = new Error("cancelled");
  const agent = tools({
    ...sandbox,
    files: {
      ...sandbox.files,
      write: () => {
        controller.abort(reason);
        return Promise.reject(new Error("provider failed"));
      },
    },
  }).sandbox;

  try {
    await expect(
      agent.writeTextFile({
        abortSignal: controller.signal,
        content: "value",
        path: "/workspace/file.txt",
      })
    ).rejects.toBe(reason);
  } finally {
    await sandbox.stop();
  }
});

test("ai sdk sandbox process kill is idempotent", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const agent: SandboxSession = tools(sandbox, {
    allow: ["exec"],
  }).sandbox;
  const process = await agent.spawn({ command: "sleep 10" });

  await Promise.all([process.kill(), process.kill()]);

  await sandbox.stop();
});

test("ai sdk sandbox shape reads and writes files", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const agent: SandboxSession = tools(sandbox, {
    allow: ["read", "write", "list", "exec"],
  }).sandbox;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("stream"));
      controller.close();
    },
  });

  await agent.writeTextFile({
    content: "one\ntwo\nthree",
    path: "/workspace/text.txt",
  });
  await agent.writeBinaryFile({
    content: new TextEncoder().encode("bytes"),
    path: "/workspace/binary.txt",
  });
  await agent.writeFile({
    content: stream,
    path: "/workspace/nested/stream.txt",
  });

  const text = await agent.readTextFile({
    endLine: 2,
    path: "/workspace/text.txt",
    startLine: 2,
  });
  const binary = await agent.readBinaryFile({ path: "/workspace/binary.txt" });
  const file = await agent.readFile({ path: "/workspace/nested/stream.txt" });
  const missing = await agent.readTextFile({ path: "/workspace/missing.txt" });

  expect(text).toBe("two");
  expect(new TextDecoder().decode(binary ?? new Uint8Array())).toBe("bytes");
  expect(file).toBeInstanceOf(ReadableStream);
  expect(new TextDecoder().decode(await new Response(file).arrayBuffer())).toBe(
    "stream"
  );
  expect(missing).toBeNull();

  await sandbox.stop();
});

test("ai sdk sandbox text ranges preserve file line endings", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });

  try {
    const agent: SandboxSession = tools(sandbox, {
      allow: ["read", "write"],
    }).sandbox;

    await agent.writeTextFile({
      content: "one\r\ntwo\r\nthree\r\nfour",
      path: "/workspace/windows.txt",
    });
    await agent.writeTextFile({
      content: "one\rtwo\rthree\rfour",
      path: "/workspace/carriage.txt",
    });

    const windows = await agent.readTextFile({
      endLine: 3,
      path: "/workspace/windows.txt",
      startLine: 2,
    });
    const carriage = await agent.readTextFile({
      endLine: 99,
      path: "/workspace/carriage.txt",
      startLine: 3,
    });

    expect(windows).toBe("two\r\nthree");
    expect(carriage).toBe("three\rfour");
  } finally {
    await sandbox.stop();
  }
});

test("openai creates real agents sdk tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec", "preview"],
    cwd: "/workspace",
  });
  const agent = openai(kit);

  expect(agent.instructions).toBe(kit.description);
  expect(Object.keys(agent.tools).toSorted()).toEqual([
    "exec",
    "list",
    "preview",
    "read",
    "write",
  ]);

  const read = asOpenAiTool(agent.tools.read);
  const write = asOpenAiTool(agent.tools.write);
  const exec = asOpenAiTool(agent.tools.exec);
  const list = asOpenAiTool(agent.tools.list);

  expect(read.type).toBe("function");
  expect(read.name).toBe("sandbox_read");
  expect(write.name).toBe("sandbox_write");
  expect(exec.strict).toBe(true);
  expect(exec.parameters).toMatchObject({ type: "object" });
  expect(await approvalOpenAi(read)).toBe(false);
  expect(await approvalOpenAi(list)).toBe(false);
  expect(await approvalOpenAi(write)).toBe(true);
  expect(await approvalOpenAi(exec)).toBe(true);

  await invokeOpenAi(write, {
    path: "/workspace/openai.txt",
    text: "openai",
  });
  const readResult = (await invokeOpenAi(read, {
    path: "/workspace/openai.txt",
  })) as { text: string };
  const execResult = (await invokeOpenAi(exec, {
    command: "printf agents",
  })) as { stdout: string };

  expect(readResult.text).toBe("openai");
  expect(execResult.stdout).toBe("agents");

  await sandbox.stop();
});

test("openai supports custom approval and prefixes", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, { allow: ["read", "write", "exec"] });
  const agent = openai(kit, {
    prefix: "workspace",
    requireApproval: { exec: false, read: true },
  });

  expect(asOpenAiTool(agent.tools.read).name).toBe("workspace_read");
  expect(await approvalOpenAi(agent.tools.read)).toBe(true);
  expect(await approvalOpenAi(agent.tools.write)).toBe(true);
  expect(await approvalOpenAi(agent.tools.exec)).toBe(false);

  await sandbox.stop();
});

test("claude creates in-process mcp tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec", "preview"],
    cwd: "/workspace",
  });
  const agent = claude(kit);

  expect(agent.instructions).toBe(kit.description);
  expect(agent.server.type).toBe("sdk");
  expect(agent.server.name).toBe("sandbox");
  expect(agent.mcpServers.sandbox).toBe(agent.server);
  expect(agent.availableTools.toSorted()).toEqual(
    [
      "mcp__sandbox__exec",
      "mcp__sandbox__list",
      "mcp__sandbox__preview",
      "mcp__sandbox__read",
      "mcp__sandbox__write",
    ].toSorted()
  );
  expect(agent.allowedTools.toSorted()).toEqual(
    ["mcp__sandbox__list", "mcp__sandbox__read"].toSorted()
  );
  expect(agent.needsApproval("mcp__sandbox__write")).toBe(true);
  expect(agent.needsApproval("mcp__sandbox__exec")).toBe(true);
  expect(agent.needsApproval("mcp__sandbox__read")).toBe(false);

  const writeTool = asClaudeTool(
    agent.tools.find((item) => item.name === "write")
  );
  const readTool = asClaudeTool(
    agent.tools.find((item) => item.name === "read")
  );
  const execTool = asClaudeTool(
    agent.tools.find((item) => item.name === "exec")
  );

  expect(readTool.annotations?.readOnlyHint).toBe(true);
  expect(writeTool.annotations?.destructiveHint).toBe(true);

  const written = await writeTool.handler(
    {
      path: "/workspace/claude.txt",
      text: "claude",
    },
    {}
  );
  const readResult = await readTool.handler(
    { path: "/workspace/claude.txt" },
    {}
  );
  const execResult = await execTool.handler({ command: "printf sdk" }, {});

  expect(written.structuredContent).toEqual({ ok: true });
  expect(readResult.structuredContent).toEqual({ text: "claude" });
  expect(execResult.structuredContent).toMatchObject({ stdout: "sdk" });

  await sandbox.stop();
});

test("claude supports approval and server overrides", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, { allow: ["read", "write", "exec"] });
  const agent = claude(kit, {
    annotations: { exec: { destructiveHint: false, readOnlyHint: false } },
    requireApproval: { exec: false, read: true, write: false },
    serverName: "workspace",
    serverVersion: "2.0.0",
  });

  expect(agent.serverName).toBe("workspace");
  expect(agent.mcpServers.workspace).toBe(agent.server);
  expect(agent.availableTools).toContain("mcp__workspace__exec");
  expect(agent.allowedTools.toSorted()).toEqual(
    ["mcp__workspace__exec", "mcp__workspace__write"].toSorted()
  );
  expect(agent.needsApproval("mcp__workspace__read")).toBe(true);
  expect(agent.needsApproval("mcp__workspace__exec")).toBe(false);
  expect(agent.needsApproval("mcp__workspace__missing")).toBe(false);

  const allowed = await agent.canUseTool(
    "mcp__workspace__exec",
    { command: "printf ok" },
    {
      signal: new AbortController().signal,
      toolUseID: "allowed",
    }
  );
  const denied = await agent.canUseTool(
    "mcp__workspace__read",
    { path: "/workspace/file.txt" },
    {
      signal: new AbortController().signal,
      toolUseID: "denied",
    }
  );

  expect(allowed.behavior).toBe("allow");
  expect(denied.behavior).toBe("deny");

  await sandbox.stop();
});

test("tools can expose local previews", async () => {
  const sandbox = await create({ adapter: local() });
  const kit = tools(sandbox, { allow: ["preview"] });
  const preview = await kit.tools.preview?.execute({ port: 3000 });

  expect(preview?.url).toBe("http://localhost:3000");
  expect(kit.tools.preview?.inputSchema.jsonSchema).toMatchObject({
    properties: {
      port: {
        maximum: 65_535,
        minimum: 1,
        type: "integer",
      },
    },
  });

  await sandbox.stop();
});

test("tools validate preview ports", async () => {
  const sandbox = await create({ adapter: local() });
  const kit = tools(sandbox, { allow: ["preview"] });

  try {
    await kit.tools.preview?.execute({ port: 0 });
    throw new Error("expected validation to fail");
  } catch (error) {
    expect(isSandboxError(error)).toBe(true);
    expect(error).toMatchObject({
      code: "configuration",
      message: "port must be an integer from 1 to 65535",
      provider: "ai",
    });
  } finally {
    await sandbox.stop();
  }
});

test("tools omit preview when ports are unsupported", async () => {
  const sandbox = await create({ adapter: local() });
  const kit = tools(
    {
      ...sandbox,
      capabilities: {
        ...sandbox.capabilities,
        ports: false,
      },
    },
    {
      allow: ["preview"],
    }
  );

  expect(kit.tools.preview).toBeUndefined();
  expect(kit.description).toContain("Allowed sandbox tools: none");
  expect(kit.description).toContain(
    "Unavailable normalized capabilities: ports"
  );

  await sandbox.stop();
});

test("tools describe provider raw capabilities", async () => {
  const sandbox = await create({ adapter: local() });
  const kit = tools({
    ...sandbox,
    capabilities: {
      ...sandbox.capabilities,
      raw: {
        tunnels: "dynamic",
      },
    },
    provider: "cloudflare",
  });

  expect(kit.description).toContain(
    "Provider-specific raw capabilities: tunnels"
  );

  await sandbox.stop();
});

test("tools trim command output for agent payloads", async () => {
  const sandbox = await create({ adapter: local() });
  const kit = tools(sandbox, {
    allow: ["exec"],
    maxOutput: 4,
  });

  const output = await kit.tools.exec?.execute({
    args: ["hello"],
    command: "printf",
  });

  expect(output?.stdout).toBe("hell\n[truncated 1 bytes]");

  await sandbox.stop();
});

test("tools validate numeric configuration", async () => {
  const sandbox = await create({ adapter: local() });

  try {
    try {
      tools(sandbox, { maxOutput: -1 });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(isSandboxError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "configuration",
        message: "maxOutput must be a non-negative integer",
        provider: "ai",
      });
    }

    try {
      tools(sandbox, { timeout: Number.POSITIVE_INFINITY });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(isSandboxError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "configuration",
        message: "timeout must be a non-negative integer",
        provider: "ai",
      });
    }
  } finally {
    await sandbox.stop();
  }
});

test("tools run write policy before file writes", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const seen: string[] = [];
  const kit = tools(sandbox, {
    allow: ["write"],
    beforeWrite(input, context) {
      seen.push(`${context.tool}:${context.cwd}:${context.sandbox.provider}`);
      if (!input.path.startsWith("/workspace/")) {
        throw new Error("write blocked");
      }
    },
  });

  await expect(
    kit.tools.write?.execute({
      path: "/tmp/file.txt",
      text: "no",
    })
  ).rejects.toThrow("write blocked");

  await kit.tools.write?.execute({
    path: "/workspace/file.txt",
    text: "yes",
  });

  expect(await sandbox.files.exists("/tmp/file.txt")).toBe(false);
  expect(await sandbox.files.text("/workspace/file.txt")).toBe("yes");
  expect(seen).toEqual(["write:/workspace:local", "write:/workspace:local"]);

  await sandbox.stop();
});

test("tools run exec policy before commands", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const commands: string[] = [];
  const kit = tools(sandbox, {
    allow: ["exec"],
    beforeExec(input) {
      commands.push(input.command);
      if (input.command === "rm") {
        throw new Error("exec blocked");
      }
    },
  });

  await expect(
    kit.tools.exec?.execute({
      args: ["-rf", "/workspace"],
      command: "rm",
    })
  ).rejects.toThrow("exec blocked");

  const output = await kit.tools.exec?.execute({
    args: ["ok"],
    command: "printf",
  });

  expect(output?.stdout).toBe("ok");
  expect(commands).toEqual(["rm", "printf"]);

  await sandbox.stop();
});

test("agent command execution uses exec policy", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });
  const kit = tools(sandbox, {
    allow: ["exec"],
    beforeExec(input) {
      if (input.command.includes("blocked")) {
        throw new Error("agent blocked");
      }
    },
  });

  await expect(
    kit.sandbox.executeCommand({
      command: "printf blocked",
      workingDirectory: "/workspace",
    })
  ).rejects.toThrow("agent blocked");

  const output = await kit.sandbox.executeCommand({
    command: "printf allowed",
    workingDirectory: "/workspace",
  });

  expect(output.stdout).toBe("allowed");

  await sandbox.stop();
});
