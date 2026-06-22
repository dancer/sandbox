import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";

import type { JsonSchema, Kit, Name } from "./index.js";
import { approval, entries, instructions, message } from "./shared.js";
import type { Approval } from "./shared.js";

/** generated OpenAI Agents SDK function tools keyed by sandbox tool name */
export type OpenAITools = Readonly<Partial<Record<Name, FunctionTool>>>;

/**
 * OpenAI Agents SDK configuration derived from one sandbox tool kit
 *
 * pass `instructions` to `new Agent()` and `Object.values(tools)` as its tools
 */
export type OpenAI = Readonly<{
  /** instructions ready for new Agent({ instructions }) */
  instructions: string;
  /** tools ready for new Agent({ tools: Object.values(openai.tools) }) */
  tools: OpenAITools;
}>;

/** options for adapting a sandbox tool kit to the OpenAI Agents SDK */
export type OpenAIOptions = Readonly<{
  /**
   * prefix for tool names sent to the model
   *
   * @default "sandbox"
   */
  prefix?: string;
  /**
   * approval policy for generated side-effect tools
   *
   * @default true for exec, preview, and write, false for read and list
   */
  requireApproval?: Approval;
}>;

type OpenAIParameters = Readonly<{
  additionalProperties: false;
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  type: "object";
}>;

const name = (prefix: string, value: Name): string =>
  prefix.length === 0 ? value : `${prefix}_${value}`;

const parameters = (schema: JsonSchema): OpenAIParameters => ({
  additionalProperties: false,
  properties: schema.properties as Record<string, Record<string, unknown>>,
  required: Array.isArray(schema.required) ? schema.required.map(String) : [],
  type: "object",
});

/**
 * create OpenAI Agents SDK tools from a sandbox tool kit
 *
 * @example
 * const integration = openai(tools(sandbox, { allow: ["read", "write", "exec"] }))
 * const agent = new Agent({
 *   instructions: integration.instructions,
 *   tools: Object.values(integration.tools),
 * })
 */
export const openai = (
  kit: Kit,
  { prefix = "sandbox", requireApproval }: OpenAIOptions = {}
): OpenAI => ({
  instructions: instructions(kit),
  tools: Object.fromEntries(
    entries(kit.tools).map((entry) => [
      entry.name,
      tool({
        description: entry.tool.description,
        errorFunction: (_, error) => message(error),
        execute: (input) => entry.tool.execute(input),
        name: name(prefix, entry.name),
        needsApproval: approval(entry.name, requireApproval),
        parameters: parameters(entry.tool.inputSchema.jsonSchema as JsonSchema),
        strict: true,
      }),
    ])
  ) as OpenAITools,
});
