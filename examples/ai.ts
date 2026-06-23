import { aisdk, tools } from "@sandbox-sdk/ai";
import type {
  AisdkOptions,
  Exec,
  ExecResult,
  Preview,
  PreviewResult,
  Schema,
  Tool,
} from "@sandbox-sdk/ai";
import { claude } from "@sandbox-sdk/ai/claude";
import type { ClaudeTools } from "@sandbox-sdk/ai/claude";
import { openai } from "@sandbox-sdk/ai/openai";
import type { OpenAI } from "@sandbox-sdk/ai/openai";
import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

export const createKit = async () => {
  const sandbox = await create({
    adapter: local(),
    cwd: "/workspace",
  });
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec"],
    cwd: "/workspace",
  });
  const schema = kit.tools.exec?.inputSchema;

  return {
    ai: aisdk(kit),
    claude: claude(kit),
    kit,
    openai: openai(kit),
    sandbox,
    schema,
    stop: () => sandbox.stop(),
  };
};

export type AiTypes = Readonly<{
  ai: AisdkOptions;
  claude: ClaudeTools;
  exec: Exec;
  execResult: ExecResult;
  execTool: Tool<Exec, ExecResult>;
  openai: OpenAI;
  preview: Preview;
  previewResult: PreviewResult;
  schema: Schema<Exec>;
}>;
