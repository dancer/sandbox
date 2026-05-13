import { supports } from "@sandbox-sdk/core";
import type { Result, Sandbox } from "@sandbox-sdk/core";

/** json schema object accepted by AI SDK tools */
export type Schema = Readonly<{
  additionalProperties: false;
  properties: Readonly<Record<string, unknown>>;
  required?: readonly string[];
  type: "object";
}>;

/** provider-agnostic tool shape compatible with the AI SDK */
export type Tool<Input, Output> = Readonly<{
  description: string;
  inputSchema: Schema;
  strict?: boolean;
  execute(input: Input): Promise<Output>;
}>;

export type Name = "exec" | "list" | "preview" | "read" | "write";

/** context passed to policy hooks before a sandbox side effect */
export type Context<ToolName extends Name = Name> = Readonly<{
  cwd: string;
  sandbox: Sandbox;
  tool: ToolName;
}>;

/** async policy hook for checking tool input before execution */
export type Policy<Input, ToolName extends Name = Name> = (
  input: Input,
  context: Context<ToolName>
) => Promise<void> | void;

/** options for creating AI-ready sandbox tools and prompt context */
export type Options = Readonly<{
  allow?: readonly Name[];
  beforeExec?: Policy<Exec, "exec">;
  beforeList?: Policy<Partial<Path>, "list">;
  beforePreview?: Policy<Preview, "preview">;
  beforeRead?: Policy<Path, "read">;
  beforeWrite?: Policy<Write, "write">;
  cwd?: string;
  maxOutput?: number;
  timeout?: number;
}>;

/** AI tool kit with prompt context and a minimal agent sandbox shape */
export type Kit = Readonly<{
  description: string;
  sandbox: AgentSandbox;
  tools: Tools;
}>;

/** small sandbox description object for agents that support executeCommand */
export type AgentSandbox = Readonly<{
  capabilities: Sandbox["capabilities"];
  description: string;
  executeCommand(input: Command): Promise<CommandResult>;
  provider: string;
  workingDirectory: string;
}>;

interface Draft {
  exec?: Tool<Exec, ExecResult>;
  list?: Tool<Partial<Path>, ListResult>;
  preview?: Tool<Preview, PreviewResult>;
  read?: Tool<Path, TextResult>;
  write?: Tool<Write, WriteResult>;
}

export type Tools = Readonly<Draft>;

/** command input accepted by the exec tool and exec policy */
export type Exec = Readonly<{
  args?: readonly string[];
  command: string;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
}>;

/** command input used by AI SDK agent integrations */
export type Command = Readonly<{
  abortSignal?: AbortSignal;
  command: string;
  workingDirectory?: string;
}>;

/** command result returned by the agent sandbox shape */
export type CommandResult = Readonly<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;

/** path input accepted by read and shared path policies */
export type Path = Readonly<{
  path: string;
}>;

/** write input accepted by the write tool and write policy */
export type Write = Readonly<{
  path: string;
  text: string;
}>;

/** preview input accepted by the preview tool and preview policy */
export type Preview = Readonly<{
  port: number;
}>;

export type ExecResult = Readonly<{
  code: number;
  ok: boolean;
  signal?: string;
  stderr: string;
  stdout: string;
}>;

export type ListResult = Readonly<{
  entries: Awaited<ReturnType<Sandbox["files"]["list"]>>;
}>;

export type TextResult = Readonly<{
  text: string;
}>;

export type WriteResult = Readonly<{
  ok: true;
}>;

export type PreviewResult = Readonly<{
  url: string;
}>;

const names = ["read", "write", "list", "exec"] as const;

const context = <ToolName extends Name>(
  sandbox: Sandbox,
  cwd: string,
  tool: ToolName
): Context<ToolName> => ({
  cwd,
  sandbox,
  tool,
});

const trim = (value: string, limit: number): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}\n[truncated ${value.length - limit} bytes]`;
};

const result = (output: Result, limit: number): ExecResult => {
  const value: ExecResult = {
    code: output.code,
    ok: output.ok,
    stderr: trim(output.stderr, limit),
    stdout: trim(output.stdout, limit),
  };

  if (output.signal === undefined) {
    return value;
  }

  return { ...value, signal: output.signal };
};

const schema = (
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[]
): Schema => ({
  additionalProperties: false,
  properties,
  required,
  type: "object",
});

const description = (
  sandbox: Sandbox,
  allowed: readonly Name[],
  cwd: string,
  timeout: number,
  maxOutput: number
): string => {
  const unavailable = [
    supports(sandbox, "ports") ? undefined : "ports",
    supports(sandbox, "snapshotCreate") ? undefined : "snapshot creation",
    supports(sandbox, "snapshotRestore") ? undefined : "snapshot restore",
    supports(sandbox, "processSpawn") ? undefined : "background processes",
    supports(sandbox, "pty") ? undefined : "pty",
    supports(sandbox, "desktop") ? undefined : "desktop",
  ].filter((item): item is string => item !== undefined);

  return [
    `You have access to an isolated ${sandbox.provider} sandbox.`,
    `Default working directory: ${cwd}.`,
    `Allowed sandbox tools: ${allowed.join(", ")}.`,
    "Use read/list before editing when you need file context.",
    "Use write only for files that belong in the sandbox workspace.",
    `Commands run with a default timeout of ${timeout}ms.`,
    "The exec tool accepts shell command strings; use args only for explicit argv execution.",
    `Command stdout and stderr are each capped at ${maxOutput} characters.`,
    unavailable.length === 0
      ? "All advertised sandbox capabilities are available."
      : `Unavailable capabilities: ${unavailable.join(", ")}.`,
  ].join("\n");
};

const agent = (
  sandbox: Sandbox,
  details: string,
  cwd: string,
  timeout: number,
  beforeExec?: Policy<Exec, "exec">
): AgentSandbox => ({
  capabilities: sandbox.capabilities,
  description: details,
  executeCommand: async (input) => {
    await beforeExec?.(
      {
        command: input.command,
        cwd: input.workingDirectory ?? cwd,
      },
      context(sandbox, cwd, "exec")
    );
    const output = await sandbox.process.shell(input.command, {
      cwd: input.workingDirectory ?? cwd,
      ...(input.abortSignal === undefined ? {} : { signal: input.abortSignal }),
      timeout,
    });
    return {
      exitCode: output.code,
      stderr: output.stderr,
      stdout: output.stdout,
    };
  },
  provider: sandbox.provider,
  workingDirectory: cwd,
});

export const tools = (sandbox: Sandbox, options: Options = {}): Kit => {
  const cwd = options.cwd ?? sandbox.cwd;
  const timeout = options.timeout ?? 30_000;
  const maxOutput = options.maxOutput ?? 20_000;
  const allow = options.allow ?? [
    ...names,
    ...(supports(sandbox, "ports") ? (["preview"] as const) : []),
  ];
  const enabled = new Set<Name>(allow);
  const output: Draft = {};

  if (enabled.has("read")) {
    output.read = {
      description: "Read a text file from the sandbox.",
      execute: async (input: Path): Promise<TextResult> => {
        await options.beforeRead?.(input, context(sandbox, cwd, "read"));
        return {
          text: await sandbox.files.text(input.path),
        };
      },
      inputSchema: schema({ path: { type: "string" } }, ["path"]),
      strict: true,
    };
  }

  if (enabled.has("write")) {
    output.write = {
      description: "Write a text file in the sandbox.",
      execute: async (input: Write): Promise<WriteResult> => {
        await options.beforeWrite?.(input, context(sandbox, cwd, "write"));
        await sandbox.files.write(input.path, input.text);
        return { ok: true };
      },
      inputSchema: schema(
        { path: { type: "string" }, text: { type: "string" } },
        ["path", "text"]
      ),
      strict: true,
    };
  }

  if (enabled.has("list")) {
    output.list = {
      description: "List files in a sandbox directory.",
      execute: async (input: Partial<Path>): Promise<ListResult> => {
        await options.beforeList?.(input, context(sandbox, cwd, "list"));
        return {
          entries: await sandbox.files.list(input.path),
        };
      },
      inputSchema: schema({ path: { type: "string" } }, []),
      strict: true,
    };
  }

  if (enabled.has("exec")) {
    output.exec = {
      description: "Run a shell command inside the sandbox.",
      execute: async (input: Exec): Promise<ExecResult> => {
        await options.beforeExec?.(input, context(sandbox, cwd, "exec"));
        const run = {
          cwd: input.cwd ?? cwd,
          timeout,
          ...(input.env === undefined ? {} : { env: input.env }),
        };

        const executed =
          input.args === undefined
            ? await sandbox.process.shell(input.command, run)
            : await sandbox.process.exec(input.command, input.args, run);

        return result(executed, maxOutput);
      },
      inputSchema: schema(
        {
          args: { items: { type: "string" }, type: "array" },
          command: { type: "string" },
          cwd: { type: "string" },
          env: {
            additionalProperties: { type: "string" },
            type: "object",
          },
        },
        ["command"]
      ),
      strict: true,
    };
  }

  if (enabled.has("preview")) {
    output.preview = {
      description: "Expose or retrieve a preview URL for a sandbox port.",
      execute: async (input: Preview): Promise<PreviewResult> => {
        await options.beforePreview?.(input, context(sandbox, cwd, "preview"));
        const preview = await sandbox.ports.expose(input.port);
        return { url: preview.url };
      },
      inputSchema: schema({ port: { type: "number" } }, ["port"]),
      strict: true,
    };
  }

  const text = description(sandbox, allow, cwd, timeout, maxOutput);

  return {
    description: text,
    sandbox: agent(sandbox, text, cwd, timeout, options.beforeExec),
    tools: output,
  };
};
