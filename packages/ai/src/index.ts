import {
  isSandboxError,
  sandboxError,
  supports,
  supportsRaw,
} from "@sandbox-sdk/core";
import type {
  RawCapability,
  Result,
  Running,
  Sandbox,
} from "@sandbox-sdk/core";

/** json schema payload exposed to the AI SDK */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** version-neutral standard schema accepted by AI SDK v6 and v7 */
export type Schema<Input = unknown> = Readonly<{
  /** json schema payload used by providers and other agent SDKs */
  jsonSchema: JsonSchema;
  /** standard schema contract used by supported AI SDK versions */
  "~standard": Readonly<{
    /** schema adapter used by standard schema consumers */
    jsonSchema: Readonly<{
      /** return the json schema for accepted input */
      input(): JsonSchema;
      /** return the json schema for produced output */
      output(): JsonSchema;
    }>;
    /** compile-time input and output types for standard schema consumers */
    types?: Readonly<{
      /** input type accepted by the schema */
      input: Input;
      /** output type produced by the schema */
      output: Input;
    }>;
    /** validate unknown input and return the parsed value */
    validate(value: unknown): Readonly<{
      /** validated schema value */
      value: Input;
    }>;
    /** standard schema vendor identifier */
    vendor: "sandbox-sdk";
    /** standard schema protocol version */
    version: 1;
  }>;
}>;

/** result returned when the AI SDK resolves a schema */
export type SchemaResult<Input = unknown> = Schema<Input>;

/** provider-agnostic tool shape compatible with supported AI SDK versions */
export type Tool<Input, Output> = Readonly<{
  /** prompt-facing tool description */
  description: string;
  /** AI SDK-compatible input schema */
  inputSchema: Schema<Input>;
  /** true when model output should match the schema exactly */
  strict: true;
  /** tool implementation */
  execute(input: Input, options?: unknown): Promise<Output>;
}>;

/** built-in sandbox tool name */
export type Name = "exec" | "list" | "preview" | "read" | "write";

/** context passed to a generated tool policy hook before its sandbox operation */
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

/**
 * options for creating model-facing sandbox tools and AI SDK prompt context
 *
 * the allowlist and file policies apply only to generated tools. `beforeExec`
 * also applies to session commands. custom AI SDK tools that call
 * `kit.sandbox` own their authorization boundary
 */
export type Options = Readonly<{
  /**
   * generated tools exposed to the model
   *
   * @default ["read", "list"]
   */
  allow?: readonly Name[];
  /** policy hook called before generated and session command execution */
  beforeExec?: Policy<Exec, "exec">;
  /** policy hook called before the generated directory listing tool */
  beforeList?: Policy<Partial<Path>, "list">;
  /** policy hook called before the generated preview tool */
  beforePreview?: Policy<Preview, "preview">;
  /** policy hook called before the generated file read tool */
  beforeRead?: Policy<Path, "read">;
  /** policy hook called before the generated file write tool */
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

/**
 * agent-ready sandbox tools, prompt context, and an AI SDK session
 *
 * pass this to `aisdk()` for AI SDK v6 and v7 generation calls. `tools` are
 * model-facing, while `sandbox` is for trusted custom tool callbacks
 */
export type Kit = Readonly<{
  /** agent-facing context describing the workspace, capabilities, and limits */
  description: string;
  /** sandbox session for AI SDK tool execution */
  sandbox: SandboxSession;
  /** AI SDK-compatible tools keyed by enabled tool name */
  tools: Tools;
}>;

/**
 * options ready to spread into AI SDK v6 or v7 generation calls
 *
 * AI SDK v6 uses `tools` and `system`. AI SDK v7 also passes
 * `experimental_sandbox` to custom tool execution
 */
export type AisdkOptions = Readonly<{
  /** sandbox session forwarded to AI SDK tool execution */
  experimental_sandbox: SandboxSession;
  /** ToolLoopAgent instructions describing the sandbox, available tools, and safety limits */
  instructions: string;
  /** system prompt context describing the sandbox, available tools, and safety limits */
  system: string;
  /** AI SDK-compatible tool set */
  tools: Tools;
}>;

/**
 * agent-facing sandbox session compatible with the AI SDK sandbox contract
 *
 * this restricted session omits host-only lifecycle, networking, and raw
 * provider controls from `Sandbox`. the generated tool allowlist does not
 * constrain direct session methods, so custom tools must enforce their own policy
 */
export type SandboxSession = Readonly<{
  /** normalized capabilities advertised by the underlying sandbox */
  capabilities: Sandbox["capabilities"];
  /** agent-facing sandbox context, including workspace, tools, and limits */
  description: string;
  /** adapter provider name */
  provider: string;
  /** read one file as a byte stream, returning null when it does not exist */
  readFile(input: File): PromiseLike<ReadableStream<Uint8Array> | null>;
  /** read one file as bytes, returning null when it does not exist */
  readBinaryFile(input: File): PromiseLike<Uint8Array | null>;
  /**
   * read one decoded text file, returning null when it does not exist
   *
   * line ranges are 1-based and inclusive, with `endLine` clamped at EOF
   */
  readTextFile(input: TextFile): PromiseLike<string | null>;
  /** run a shell command and return buffered stdout and stderr */
  run(input: Command): PromiseLike<CommandResult>;
  /** start a shell command and return a streaming process handle */
  spawn(input: Command): PromiseLike<SandboxProcess>;
  /** default working directory used when an input does not provide one */
  workingDirectory: string;
  /** write one file from a byte stream */
  writeFile(input: FileWrite): PromiseLike<void>;
  /** write one file from bytes */
  writeBinaryFile(input: BinaryFileWrite): PromiseLike<void>;
  /** write one text file */
  writeTextFile(input: TextFileWrite): PromiseLike<void>;
  /** compatibility alias for older integrations that expect `executeCommand` */
  executeCommand(input: Command): Promise<CommandResult>;
  /** compatibility alias for older integrations that expect `runCommand` */
  runCommand(input: Command): PromiseLike<CommandResult>;
}>;

/**
 * host-owned sandbox with infrastructure capabilities kept away from AI SDK tools
 *
 * call `restricted()` to pass only the AI SDK session contract to tool execution
 */
export type NetworkSandboxSession = Sandbox &
  Readonly<{
    /** return the restricted session safe to pass into agent tool execution */
    restricted(): SandboxSession;
  }>;

/** compatibility alias for older sandbox-sdk consumers */
export type AgentSandbox = SandboxSession;

/**
 * streaming process handle compatible with the current AI SDK sandbox contract
 *
 * consume `stdout` and `stderr` as web streams, then call `wait()` to observe
 * the exit code. `kill()` is idempotent
 */
export type SandboxProcess = Readonly<{
  /** bytes written by the process to standard error */
  stderr: ReadableStream<Uint8Array>;
  /** bytes written by the process to standard output */
  stdout: ReadableStream<Uint8Array>;
  /** terminate the process, safely allowing repeated calls */
  kill(): PromiseLike<void>;
  /** resolve after the process exits with its exit code */
  wait(): PromiseLike<
    Readonly<{
      /** process exit code */
      exitCode: number;
    }>
  >;
}>;

type Draft = Partial<{
  exec: Tool<Exec, ExecResult>;
  list: Tool<Partial<Path>, ListResult>;
  preview: Tool<Preview, PreviewResult>;
  read: Tool<Path, TextResult>;
  write: Tool<Write, WriteResult>;
}>;

/** AI SDK-compatible sandbox tools keyed by the enabled tool name */
export type Tools = Readonly<Draft>;

interface DraftTools {
  exec?: Tool<Exec, ExecResult>;
  list?: Tool<Partial<Path>, ListResult>;
  preview?: Tool<Preview, PreviewResult>;
  read?: Tool<Path, TextResult>;
  write?: Tool<Write, WriteResult>;
}

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
  /** environment variables for this command */
  env?: Readonly<Record<string, string>>;
  /** working directory inside the sandbox */
  workingDirectory?: string;
}>;

/** file read input used by the AI SDK sandbox shape */
export type File = Readonly<{
  /** abort signal checked before and after the filesystem operation */
  abortSignal?: AbortSignal;
  /** absolute or sandbox-relative file path */
  path: string;
}>;

/** text file read input used by the AI SDK sandbox shape */
export type TextFile = File &
  Readonly<{
    /** 1-based inclusive final line, clamped to EOF when it exceeds the file */
    endLine?: number;
    /** text encoding used to decode the file, defaulting to utf-8 */
    encoding?: string;
    /** 1-based inclusive first line, defaulting to the first file line */
    startLine?: number;
  }>;

/** file stream write input used by the AI SDK sandbox shape */
export type FileWrite = File &
  Readonly<{
    /** byte stream to write */
    content: ReadableStream<Uint8Array>;
  }>;

/** binary file write input used by the AI SDK sandbox shape */
export type BinaryFileWrite = File &
  Readonly<{
    /** bytes to write */
    content: Uint8Array;
  }>;

/** text file write input used by the AI SDK sandbox shape */
export type TextFileWrite = File &
  Readonly<{
    /** text to write */
    content: string;
    /** utf-8 text encoding accepted by the normalized filesystem contract */
    encoding?: string;
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
  /** preview URL; treat provider-issued signed or tokenized urls as credentials */
  url: string;
}>;

/**
 * create AI SDK v6/v7 call options from a sandbox tool kit
 *
 * @example
 * const sandbox = await create({ adapter: local() })
 * const kit = tools(sandbox, { allow: ["read", "write", "exec"] })
 * const result = await generateText({ model, ...aisdk(kit), prompt: "inspect the workspace" })
 */
export const aisdk = (kit: Kit): AisdkOptions => ({
  experimental_sandbox: kit.sandbox,
  instructions: kit.description,
  system: kit.description,
  tools: kit.tools,
});

const names = ["read", "list"] as const;

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

const assertActive = (signal: AbortSignal | undefined): void => {
  signal?.throwIfAborted();
};

const missing = <Value>(error: unknown, signal?: AbortSignal): Value | null => {
  assertActive(signal);
  if (isSandboxError(error) && error.code === "not_found") {
    return null;
  }
  throw error;
};

const parent = (path: string): string | undefined => {
  const index = path.lastIndexOf("/");
  if (index <= 0) {
    return undefined;
  }
  return path.slice(0, index);
};

const write = async (
  sandbox: Sandbox,
  input: {
    abortSignal?: AbortSignal;
    content: string | Uint8Array | ReadableStream<Uint8Array>;
    path: string;
  }
): Promise<void> => {
  assertActive(input.abortSignal);
  try {
    const directory = parent(input.path);
    if (directory !== undefined) {
      await sandbox.files.mkdir(directory);
    }
    assertActive(input.abortSignal);
    await sandbox.files.write(input.path, input.content);
  } catch (error) {
    assertActive(input.abortSignal);
    throw error;
  }
  assertActive(input.abortSignal);
};

const emptyStream = (): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

const readText = async (
  sandbox: Sandbox,
  input: TextFile
): Promise<string | null> => {
  assertActive(input.abortSignal);
  try {
    const bytes = await sandbox.files.read(input.path);
    assertActive(input.abortSignal);
    const text = new TextDecoder(input.encoding ?? "utf-8").decode(bytes);
    if (input.startLine === undefined && input.endLine === undefined) {
      return text;
    }
    let lineEnding = "\n";
    if (text.includes("\r\n")) {
      lineEnding = "\r\n";
    } else if (text.includes("\n")) {
      lineEnding = "\n";
    } else if (text.includes("\r")) {
      lineEnding = "\r";
    }
    const lines = text.split(lineEnding);
    const start = Math.max(1, input.startLine ?? 1) - 1;
    const end = Math.min(lines.length, input.endLine ?? lines.length);
    return lines.slice(start, end).join(lineEnding);
  } catch (error) {
    return missing<string>(error, input.abortSignal);
  }
};

const commandOptions = (
  input: Command,
  cwd: string,
  timeout: number
): {
  cwd: string;
  env?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeout: number;
} => ({
  cwd: input.workingDirectory ?? cwd,
  ...(input.abortSignal === undefined ? {} : { signal: input.abortSignal }),
  ...(input.env === undefined ? {} : { env: input.env }),
  timeout,
});

const process = (
  running: Running,
  signal: AbortSignal | undefined
): SandboxProcess => {
  let killed: Promise<void> | undefined;
  return {
    kill: () => {
      killed ??= running.kill();
      return killed;
    },
    stderr: running.stderr ?? emptyStream(),
    stdout: running.stdout ?? running.output,
    wait: async () => {
      try {
        const output = await running.result;
        signal?.throwIfAborted();
        return { exitCode: output.code };
      } catch (error) {
        signal?.throwIfAborted();
        throw error;
      }
    },
  };
};

const run = async (
  sandbox: Sandbox,
  input: Command,
  cwd: string,
  timeout: number,
  beforeExec?: Policy<Exec, "exec">
): Promise<CommandResult> => {
  assertActive(input.abortSignal);
  await beforeExec?.(
    {
      command: input.command,
      cwd: input.workingDirectory ?? cwd,
      ...(input.env === undefined ? {} : { env: input.env }),
    },
    context(sandbox, cwd, "exec")
  );
  try {
    const output = await sandbox.process.shell(
      input.command,
      commandOptions(input, cwd, timeout)
    );
    input.abortSignal?.throwIfAborted();
    return {
      exitCode: output.code,
      stderr: output.stderr,
      stdout: output.stdout,
    };
  } catch (error) {
    input.abortSignal?.throwIfAborted();
    throw error;
  }
};

const spawn = async (
  sandbox: Sandbox,
  input: Command,
  cwd: string,
  timeout: number,
  beforeExec?: Policy<Exec, "exec">
): Promise<SandboxProcess> => {
  assertActive(input.abortSignal);
  await beforeExec?.(
    {
      command: input.command,
      cwd: input.workingDirectory ?? cwd,
      ...(input.env === undefined ? {} : { env: input.env }),
    },
    context(sandbox, cwd, "exec")
  );
  return process(
    await sandbox.process.spawnShell(
      input.command,
      commandOptions(input, cwd, timeout)
    ),
    input.abortSignal
  );
};

const schema = <Input>(
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[]
): Schema<Input> => {
  const value: JsonSchema = {
    additionalProperties: false,
    properties,
    required: [...required],
    type: "object",
  };
  return {
    jsonSchema: value,
    "~standard": {
      jsonSchema: {
        input: () => value,
        output: () => value,
      },
      validate: (input) => ({ value: input as Input }),
      vendor: "sandbox-sdk",
      version: 1,
    },
  };
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
): SandboxSession => {
  const session = {
    capabilities: sandbox.capabilities,
    description: details,
    provider: sandbox.provider,
    readBinaryFile: async (input: File) => {
      assertActive(input.abortSignal);
      try {
        const output = await sandbox.files.read(input.path);
        assertActive(input.abortSignal);
        return output;
      } catch (error) {
        return missing<Uint8Array>(error, input.abortSignal);
      }
    },
    readFile: async (input: File) => {
      assertActive(input.abortSignal);
      try {
        const output = await sandbox.files.stream(input.path);
        assertActive(input.abortSignal);
        return output;
      } catch (error) {
        return missing<ReadableStream<Uint8Array>>(error, input.abortSignal);
      }
    },
    readTextFile: (input: TextFile) => readText(sandbox, input),
    run: (input: Command) => run(sandbox, input, cwd, timeout, beforeExec),
    spawn: (input: Command) => spawn(sandbox, input, cwd, timeout, beforeExec),
    workingDirectory: cwd,
    writeBinaryFile: (input: BinaryFileWrite) => write(sandbox, input),
    writeFile: (input: FileWrite) => write(sandbox, input),
    writeTextFile: (input: TextFileWrite) => {
      if (input.encoding !== undefined && !/^utf-?8$/iu.test(input.encoding)) {
        throw sandboxError(
          "ai",
          "Only utf-8 text writes are supported",
          "unsupported"
        );
      }
      return write(sandbox, input);
    },
  } satisfies Omit<SandboxSession, "executeCommand" | "runCommand">;

  return {
    ...session,
    executeCommand: session.run,
    runCommand: session.run,
  };
};

/**
 * create model-facing sandbox tools, prompt context, and an AI SDK session
 *
 * @example
 * const kit = tools(sandbox, {
 *   allow: ["read", "write", "exec"],
 *   beforeExec: input => {
 *     if (input.command.includes("rm -rf")) throw new Error("command blocked")
 *   },
 * })
 */
export const tools = (sandbox: Sandbox, options: Options = {}): Kit => {
  const cwd = options.cwd ?? sandbox.cwd;
  const timeout = options.timeout ?? 30_000;
  const maxOutput = options.maxOutput ?? 20_000;
  integer("timeout", timeout);
  integer("maxOutput", maxOutput);
  const requested = options.allow ?? names;
  const allow = requested.filter(
    (name) => name !== "preview" || supports(sandbox, "ports")
  );
  const enabled = new Set<Name>(allow);
  const output: DraftTools = {};

  if (enabled.has("read")) {
    output.read = {
      description: "Read a text file from the sandbox",
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
      description: "Write a text file in the sandbox",
      execute: async (input: Write): Promise<WriteResult> => {
        await options.beforeWrite?.(input, context(sandbox, cwd, "write"));
        await write(sandbox, { content: input.text, path: input.path });
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
      description: "List files in a sandbox directory",
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
      description: "Run a shell command inside the sandbox",
      execute: async (input: Exec): Promise<ExecResult> => {
        await options.beforeExec?.(input, context(sandbox, cwd, "exec"));
        const execution = {
          cwd: input.cwd ?? cwd,
          timeout,
          ...(input.env === undefined ? {} : { env: input.env }),
        };

        const executed =
          input.args === undefined
            ? await sandbox.process.shell(input.command, execution)
            : await sandbox.process.exec(input.command, input.args, execution);

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
      description:
        "Expose or retrieve a serializable preview URL for a sandbox port",
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
    tools: output as Tools,
  };
};
