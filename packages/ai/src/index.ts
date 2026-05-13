import { supports } from "@sandbox-sdk/core";
import type { Result, Sandbox } from "@sandbox-sdk/core";

export type Schema = Readonly<{
  properties: Readonly<Record<string, unknown>>;
  required?: readonly string[];
  type: "object";
}>;

export type Tool<Input, Output> = Readonly<{
  description: string;
  inputSchema: Schema;
  strict?: boolean;
  execute(input: Input): Promise<Output>;
}>;

export type Name = "exec" | "list" | "preview" | "read" | "write";

export type Options = Readonly<{
  allow?: readonly Name[];
  cwd?: string;
  maxOutput?: number;
  timeout?: number;
}>;

export type Kit = Readonly<{
  description: string;
  tools: Tools;
}>;

interface Draft {
  exec?: Tool<Exec, ExecResult>;
  list?: Tool<Partial<Path>, ListResult>;
  preview?: Tool<Preview, PreviewResult>;
  read?: Tool<Path, TextResult>;
  write?: Tool<Write, WriteResult>;
}

export type Tools = Readonly<Draft>;

export type Exec = Readonly<{
  args?: readonly string[];
  command: string;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
}>;

export type Path = Readonly<{
  path: string;
}>;

export type Write = Readonly<{
  path: string;
  text: string;
}>;

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
    supports(sandbox, "snapshots") ? undefined : "snapshots",
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
      execute: async (input: Path): Promise<TextResult> => ({
        text: await sandbox.files.text(input.path),
      }),
      inputSchema: schema({ path: { type: "string" } }, ["path"]),
      strict: true,
    };
  }

  if (enabled.has("write")) {
    output.write = {
      description: "Write a text file in the sandbox.",
      execute: async (input: Write): Promise<WriteResult> => {
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
      execute: async (input: Partial<Path>): Promise<ListResult> => ({
        entries: await sandbox.files.list(input.path),
      }),
      inputSchema: schema({ path: { type: "string" } }, []),
      strict: true,
    };
  }

  if (enabled.has("exec")) {
    output.exec = {
      description: "Run a shell command inside the sandbox.",
      execute: async (input: Exec): Promise<ExecResult> => {
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
        const preview = await sandbox.ports.expose(input.port);
        return { url: preview.url };
      },
      inputSchema: schema({ port: { type: "number" } }, ["port"]),
      strict: true,
    };
  }

  return {
    description: description(sandbox, allow, cwd, timeout, maxOutput),
    tools: output,
  };
};
