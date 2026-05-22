import { sandboxError, supports, supportsRaw } from "@sandbox-sdk/core";
import type { RawCapability, Result, Sandbox } from "@sandbox-sdk/core";

const schemaKey = Symbol.for("vercel.ai.schema");

/** json schema payload exposed to the AI SDK */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** result returned when the AI SDK resolves a lazy schema */
export type SchemaResult<Input = unknown> = Readonly<{
  /** json schema passed to the model provider */
  jsonSchema: JsonSchema;
  /** type-only input marker for editor inference */
  _type: Input;
  /** optional runtime validator understood by the AI SDK */
  validate?: (
    value: unknown
  ) =>
    | { error: Error; success: false }
    | { success: true; value: Input }
    | PromiseLike<
        { error: Error; success: false } | { success: true; value: Input }
      >;
}>;

/** lazy AI SDK schema created from json schema */
export type Schema<Input = unknown> = (() => SchemaResult<Input>) &
  SchemaResult<Input>;

/** provider-agnostic tool shape compatible with the AI SDK */
export type Tool<Input, Output> = Readonly<{
  /** prompt-facing tool description */
  description: string;
  /** AI SDK-compatible lazy input schema */
  inputSchema: Schema<Input>;
  /** true when model output should match the schema exactly */
  strict?: boolean;
  /** tool implementation */
  execute(input: Input, options?: unknown): Promise<Output>;
}>;

/** built-in sandbox tool name */
export type Name = "exec" | "list" | "preview" | "read" | "write";

/** context passed to policy hooks before a sandbox side effect */
export type Context<ToolName extends Name = Name> = Readonly<{
  /** default sandbox working directory */
  cwd: string;
  /** sandbox the tool will operate on */
  sandbox: Sandbox;
  /** tool currently being checked */
  tool: ToolName;
}>;

/** async policy hook for checking tool input before execution */
export type Policy<Input, ToolName extends Name = Name> = (
  input: Input,
  context: Context<ToolName>
) => Promise<void> | void;

/** options for creating agent-ready sandbox tools and prompt context */
export type Options = Readonly<{
  /**
   * tools exposed to the model
   *
   * @default ["read", "write", "list", "exec"] plus "preview" when ports are supported
   */
  allow?: readonly Name[];
  /** policy hook called before command execution */
  beforeExec?: Policy<Exec, "exec">;
  /** policy hook called before directory listing */
  beforeList?: Policy<Partial<Path>, "list">;
  /** policy hook called before preview URL exposure */
  beforePreview?: Policy<Preview, "preview">;
  /** policy hook called before file reads */
  beforeRead?: Policy<Path, "read">;
  /** policy hook called before file writes */
  beforeWrite?: Policy<Write, "write">;
  /** working directory described to the agent and used by commands */
  cwd?: string;
  /**
   * maximum stdout and stderr characters returned by the exec tool
   *
   * @default 20000
   */
  maxOutput?: number;
  /**
   * default command timeout in milliseconds for agent executions
   *
   * @default 30000
   */
  timeout?: number;
}>;

/** AI toolkit with prompt context and a minimal agent sandbox shape */
export type Kit = Readonly<{
  /** prompt context describing the sandbox, capabilities, and limits */
  description: string;
  /** minimal sandbox object for agent integrations that accept an executeCommand shape */
  sandbox: AgentSandbox;
  /** aisdk compatible tools keyed by enabled tool name */
  tools: Tools;
}>;

/** options ready to spread into aisdk v6/v7 generateText, streamText, or ToolLoopAgent */
export type AisdkOptions = Readonly<{
  /** aisdk sandbox object forwarded to tool execution */
  experimental_sandbox: AgentSandbox;
  /** prompt context describing the sandbox, available tools, and safety limits */
  system: string;
  /** aisdk compatible tool set */
  tools: Tools;
}>;

/** small sandbox description object for agents that support executeCommand */
export type AgentSandbox = Readonly<{
  /** advertised sandbox capabilities */
  capabilities: Sandbox["capabilities"];
  /** prompt context describing the sandbox */
  description: string;
  /** run a shell command using the normalized sandbox process API */
  executeCommand(input: Command): Promise<CommandResult>;
  /** provider name */
  provider: string;
  /** default working directory */
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
  /** argv arguments when running an executable directly */
  args?: readonly string[];
  /** shell command or executable name */
  command: string;
  /** working directory inside the sandbox */
  cwd?: string;
  /** command environment variables */
  env?: Readonly<Record<string, string>>;
}>;

/** command input used by AI SDK agent integrations */
export type Command = Readonly<{
  /** abort signal forwarded to sandbox command execution */
  abortSignal?: AbortSignal;
  /** shell command to run */
  command: string;
  /** working directory inside the sandbox */
  workingDirectory?: string;
}>;

/** command result returned by the agent sandbox shape */
export type CommandResult = Readonly<{
  /** command exit code */
  exitCode: number;
  /** buffered stderr */
  stderr: string;
  /** buffered stdout */
  stdout: string;
}>;

/** path input accepted by read and shared path policies */
export type Path = Readonly<{
  /** file or directory path inside the sandbox */
  path: string;
}>;

/** write input accepted by the write tool and write policy */
export type Write = Readonly<{
  /** file path inside the sandbox */
  path: string;
  /** utf-8 text to write */
  text: string;
}>;

/** preview input accepted by the preview tool and preview policy */
export type Preview = Readonly<{
  /** sandbox port to expose */
  port: number;
}>;

/** result returned by the exec tool */
export type ExecResult = Readonly<{
  /** command exit code */
  code: number;
  /** true when the command exited successfully */
  ok: boolean;
  /** termination signal when reported by the provider */
  signal?: string;
  /** buffered and capped stderr */
  stderr: string;
  /** buffered and capped stdout */
  stdout: string;
}>;

/** result returned by the list tool */
export type ListResult = Readonly<{
  /** directory entries returned by the sandbox files API */
  entries: Awaited<ReturnType<Sandbox["files"]["list"]>>;
}>;

/** result returned by the read tool */
export type TextResult = Readonly<{
  /** file text */
  text: string;
}>;

/** result returned by the write tool */
export type WriteResult = Readonly<{
  /** always true when the write succeeded */
  ok: true;
}>;

/** result returned by the preview tool */
export type PreviewResult = Readonly<{
  /** exposed preview URL */
  url: string;
}>;

/** create aisdk v6/v7 call options from a sandbox tool kit */
export const aisdk = (kit: Kit): AisdkOptions => ({
  experimental_sandbox: kit.sandbox,
  system: kit.description,
  tools: kit.tools,
});

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

const integer = (name: string, value: number): void => {
  if (Number.isInteger(value) && value >= 0) {
    return;
  }
  throw sandboxError(
    "ai",
    `${name} must be a non-negative integer`,
    "configuration"
  );
};

const port = (value: number): void => {
  if (Number.isInteger(value) && value >= 1 && value <= 65_535) {
    return;
  }
  throw sandboxError(
    "ai",
    "port must be an integer from 1 to 65535",
    "configuration"
  );
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

const schema = <Input>(
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[]
): Schema<Input> => {
  const jsonSchema = {
    additionalProperties: false,
    properties,
    required,
    type: "object",
  } satisfies JsonSchema;
  const value = {
    _type: undefined as Input,
    [schemaKey]: true,
    jsonSchema,
    validate: undefined,
  };
  return Object.assign(() => value, {
    _type: undefined as Input,
    jsonSchema,
    validate: undefined,
  }) as unknown as Schema<Input>;
};

const description = (
  sandbox: Sandbox,
  allowed: readonly Name[],
  cwd: string,
  timeout: number,
  maxOutput: number
): string => {
  const labels = allowed.length === 0 ? "none" : allowed.join(", ");
  const raw = (
    [
      "backup",
      "buckets",
      "codegen",
      "desktop",
      "drives",
      "git",
      "gpu",
      "interpreter",
      "lifecycle",
      "lsp",
      "mcp",
      "metrics",
      "network",
      "previews",
      "pty",
      "resources",
      "secrets",
      "sessions",
      "ssh",
      "system",
      "tunnels",
      "volumes",
      "watching",
    ] as const
  ).filter((capability: RawCapability) => supportsRaw(sandbox, capability));
  const unavailable = [
    supports(sandbox, "ports") ? undefined : "ports",
    supports(sandbox, "snapshotCreate") ? undefined : "snapshot creation",
    supports(sandbox, "snapshotRestore") ? undefined : "snapshot restore",
    supports(sandbox, "processSpawn") ? undefined : "background processes",
  ].filter((item): item is string => item !== undefined);

  return [
    `You have access to an isolated ${sandbox.provider} sandbox.`,
    `Default working directory: ${cwd}.`,
    `Allowed sandbox tools: ${labels}.`,
    "Use read/list before editing when you need file context.",
    "Use write only for files that belong in the sandbox workspace.",
    `Commands run with a default timeout of ${timeout}ms.`,
    "The exec tool accepts shell command strings; use args only for explicit argv execution.",
    `Command stdout and stderr are each capped at ${maxOutput} characters.`,
    unavailable.length === 0
      ? "All normalized sandbox capabilities are available."
      : `Unavailable normalized capabilities: ${unavailable.join(", ")}.`,
    raw.length === 0
      ? "No provider-specific raw capabilities are advertised."
      : `Provider-specific raw capabilities: ${raw.join(", ")}. Host code can use sandbox.raw for these; the agent tools only expose the normalized tools above.`,
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

/** create aisdk compatible tools and prompt context for a sandbox */
export const tools = (sandbox: Sandbox, options: Options = {}): Kit => {
  const cwd = options.cwd ?? sandbox.cwd;
  const timeout = options.timeout ?? 30_000;
  const maxOutput = options.maxOutput ?? 20_000;
  integer("timeout", timeout);
  integer("maxOutput", maxOutput);
  const requested = options.allow ?? [
    ...names,
    ...(supports(sandbox, "ports") ? (["preview"] as const) : []),
  ];
  const allow = requested.filter(
    (name) => name !== "preview" || supports(sandbox, "ports")
  );
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
      inputSchema: schema<Path>({ path: { type: "string" } }, ["path"]),
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
      inputSchema: schema<Write>(
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
      inputSchema: schema<Partial<Path>>({ path: { type: "string" } }, []),
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
      inputSchema: schema<Exec>(
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
        port(input.port);
        await options.beforePreview?.(input, context(sandbox, cwd, "preview"));
        const preview = await sandbox.ports.expose(input.port);
        return { url: preview.url };
      },
      inputSchema: schema<Preview>(
        { port: { maximum: 65_535, minimum: 1, type: "integer" } },
        ["port"]
      ),
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
