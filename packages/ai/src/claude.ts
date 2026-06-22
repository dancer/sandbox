import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  McpSdkServerConfigWithInstance,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";

import type { Kit, Name } from "./index.js";
import { approval, entries, instructions, json, message } from "./shared.js";
import type { Approval } from "./shared.js";

/** annotations accepted by Claude Agent SDK MCP tool definitions */
export type ToolAnnotations = NonNullable<SdkMcpToolDefinition["annotations"]>;

/** MCP tool result returned by generated Claude sandbox handlers */
export type ClaudeResult = Readonly<{
  content: readonly Readonly<{ text: string; type: "text" }>[];
  isError?: true;
  structuredContent?: Record<string, unknown>;
}>;

/** generated Claude MCP tool exposed for advanced composition and inspection */
export type ClaudeTool = Readonly<{
  annotations?: ToolAnnotations;
  description: string;
  handler(input: unknown, extra: unknown): Promise<ClaudeResult>;
  inputSchema: unknown;
  name: string;
}>;

/**
 * generated Claude Agent SDK integration for one sandbox tool kit
 *
 * pass `mcpServers`, `allowedTools`, `canUseTool`, and `instructions` to a
 * Claude Agent SDK query configuration
 */
export type ClaudeTools = Readonly<{
  /** all MCP tool names exposed by the sandbox server */
  availableTools: readonly string[];
  /** tool names that run without an approval prompt */
  allowedTools: readonly string[];
  /** permission callback ready for query({ options: { canUseTool } }) */
  canUseTool: CanUseTool;
  /** prompt context for query({ options: { systemPrompt } }) */
  instructions: string;
  /** MCP server map ready for query({ options: { mcpServers } }) */
  mcpServers: Readonly<Record<string, McpSdkServerConfigWithInstance>>;
  /** true when the named tool should require approval */
  needsApproval(toolName: string): boolean;
  /** raw in-process MCP server config */
  server: McpSdkServerConfigWithInstance;
  /** MCP server name used in mcp__<server>__<tool> names */
  serverName: string;
  /** raw MCP tool definitions for advanced composition and tests */
  tools: readonly ClaudeTool[];
}>;

/** options for adapting a sandbox tool kit to the Claude Agent SDK */
export type ClaudeOptions = Readonly<{
  /**
   * per-tool annotations merged onto the generated MCP tools
   *
   * use this when your app wants to tune read-only, destructive, or idempotent hints
   */
  annotations?: Readonly<Partial<Record<Name, ToolAnnotations>>>;
  /**
   * approval policy for generated side-effect tools
   *
   * @default true for exec, preview, and write, false for read and list
   */
  requireApproval?: Approval;
  /**
   * in-process MCP server name
   *
   * @default "sandbox"
   */
  serverName?: string;
  /**
   * MCP server version metadata
   *
   * @default "1.0.0"
   */
  serverVersion?: string;
}>;

const read: ToolAnnotations = { readOnlyHint: true };
const write: ToolAnnotations = {
  destructiveHint: true,
  readOnlyHint: false,
};
const effect: ToolAnnotations = {
  destructiveHint: false,
  idempotentHint: false,
  readOnlyHint: false,
};

const schema = (name: Name) => {
  if (name === "read") {
    return { path: z.string() };
  }
  if (name === "write") {
    return { path: z.string(), text: z.string() };
  }
  if (name === "list") {
    return { path: z.string().optional() };
  }
  if (name === "exec") {
    return {
      args: z.array(z.string()).optional(),
      command: z.string(),
      cwd: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
    };
  }
  return { port: z.number().int().min(1).max(65_535) };
};

const defaults = (name: Name): ToolAnnotations => {
  if (name === "read" || name === "list") {
    return read;
  }
  if (name === "write") {
    return write;
  }
  return effect;
};

const success = (output: unknown) => ({
  content: [
    {
      text: json(output),
      type: "text" as const,
    },
  ],
  structuredContent:
    output !== null && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : { value: output },
});

const failure = (error: unknown) => ({
  content: [
    {
      text: message(error),
      type: "text" as const,
    },
  ],
  isError: true as const,
});

const prefixed = (server: string, value: Name): string =>
  `mcp__${server}__${value}`;

/**
 * create Claude Agent SDK in-process MCP tools from a sandbox tool kit
 *
 * @example
 * const integration = claude(tools(sandbox, { allow: ["read", "write", "exec"] }))
 * const stream = query({
 *   prompt: "inspect the workspace",
 *   options: {
 *     allowedTools: integration.allowedTools,
 *     canUseTool: integration.canUseTool,
 *     mcpServers: integration.mcpServers,
 *   },
 * })
 */
export const claude = (
  kit: Kit,
  {
    annotations,
    requireApproval,
    serverName = "sandbox",
    serverVersion = "1.0.0",
  }: ClaudeOptions = {}
): ClaudeTools => {
  const items = entries(kit.tools);
  const included = new Set(items.map((entry) => entry.name));
  const removePrefix = (value: string): string =>
    value.startsWith(`mcp__${serverName}__`)
      ? value.slice(`mcp__${serverName}__`.length)
      : value;
  const needsApproval = (toolName: string): boolean => {
    const bare = removePrefix(toolName);
    if (!included.has(bare as Name)) {
      return false;
    }
    return approval(bare as Name, requireApproval);
  };
  const mcpTools = items.map((entry) =>
    tool(
      entry.name,
      entry.tool.description,
      schema(entry.name),
      async (input) => {
        try {
          return success(await entry.tool.execute(input));
        } catch (error) {
          return failure(error);
        }
      },
      {
        annotations: annotations?.[entry.name] ?? defaults(entry.name),
      }
    )
  );
  const server = createSdkMcpServer({
    name: serverName,
    tools: mcpTools as SdkMcpToolDefinition<ReturnType<typeof schema>>[],
    version: serverVersion,
  });
  const availableTools = items.map((entry) => prefixed(serverName, entry.name));
  return {
    allowedTools: items
      .filter((entry) => !needsApproval(entry.name))
      .map((entry) => prefixed(serverName, entry.name)),
    availableTools,
    canUseTool: (toolName, input) =>
      Promise.resolve(
        needsApproval(toolName)
          ? {
              behavior: "deny",
              message: `tool "${toolName}" requires approval`,
            }
          : { behavior: "allow", updatedInput: input }
      ),
    instructions: instructions(kit),
    mcpServers: { [serverName]: server },
    needsApproval,
    server,
    serverName,
    tools: mcpTools as readonly ClaudeTool[],
  };
};
