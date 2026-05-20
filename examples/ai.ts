import { aiSdk, tools } from "@sandbox-sdk/ai";
import type {
  AiSdk,
  Exec,
  ExecResult,
  Preview,
  PreviewResult,
  Schema,
  SchemaResult,
  Tool,
} from "@sandbox-sdk/ai";
import { claude } from "@sandbox-sdk/ai/claude";
import type { ClaudeTools } from "@sandbox-sdk/ai/claude";
import { openai } from "@sandbox-sdk/ai/openai";
import type { OpenAi } from "@sandbox-sdk/ai/openai";
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
  const schema = kit.tools.exec?.inputSchema();

  return {
    ai: aiSdk(kit),
    claude: claude(kit, { requireApproval: false }),
    kit,
    openai: openai(kit, { requireApproval: false }),
    sandbox,
    schema,
    stop: () => sandbox.stop(),
  };
};

export type AiTypes = Readonly<{
  ai: AiSdk;
  claude: ClaudeTools;
  exec: Exec;
  execResult: ExecResult;
  execTool: Tool<Exec, ExecResult>;
  openai: OpenAi;
  preview: Preview;
  previewResult: PreviewResult;
  schema: Schema<Exec>;
  schemaResult: SchemaResult<Exec>;
}>;
