import type { Sandbox } from "@sandbox-sdk/core";

export type Schema = Readonly<{
  type: "object";
  properties: Readonly<Record<string, unknown>>;
  required?: readonly string[];
}>;

export type Tool<Input, Output> = Readonly<{
  description: string;
  inputSchema: Schema;
  execute(input: Input): Promise<Output>;
}>;

export type Tools = Readonly<{
  command: Tool<Command, CommandResult>;
  read: Tool<Path, TextResult>;
  write: Tool<Write, WriteResult>;
}>;

export type Command = Readonly<{
  command: string;
  args?: readonly string[];
  cwd?: string;
}>;

export type Path = Readonly<{
  path: string;
}>;

export type Write = Readonly<{
  path: string;
  text: string;
}>;

export type CommandResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

export type TextResult = Readonly<{
  text: string;
}>;

export type WriteResult = Readonly<{
  ok: true;
}>;

export const tools = (sandbox: Sandbox): Tools => ({
  command: {
    description: "Run a command inside the sandbox.",
    execute: (input) =>
      sandbox.process.exec(
        input.command,
        input.args,
        input.cwd ? { cwd: input.cwd } : undefined
      ),
    inputSchema: {
      properties: {
        args: { items: { type: "string" }, type: "array" },
        command: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["command"],
      type: "object",
    },
  },
  read: {
    description: "Read a text file from the sandbox.",
    execute: async (input) => ({
      text: await sandbox.files.text(input.path),
    }),
    inputSchema: {
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
      type: "object",
    },
  },
  write: {
    description: "Write a text file to the sandbox.",
    execute: async (input) => {
      await sandbox.files.write(input.path, input.text);
      return { ok: true };
    },
    inputSchema: {
      properties: {
        path: { type: "string" },
        text: { type: "string" },
      },
      required: ["path", "text"],
      type: "object",
    },
  },
});
