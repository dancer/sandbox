import { tools } from "@sandbox-sdk/ai";
import type {
  Exec,
  ExecResult,
  Preview,
  PreviewResult,
  Schema,
  SchemaResult,
  Tool,
} from "@sandbox-sdk/ai";
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
    kit,
    sandbox,
    schema,
    stop: () => sandbox.stop(),
  };
};

export type AiTypes = Readonly<{
  exec: Exec;
  execResult: ExecResult;
  execTool: Tool<Exec, ExecResult>;
  preview: Preview;
  previewResult: PreviewResult;
  schema: Schema<Exec>;
  schemaResult: SchemaResult<Exec>;
}>;
