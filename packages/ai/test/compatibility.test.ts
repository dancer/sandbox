import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";
import { generateText as generateV6 } from "ai";
import type { ToolSet as ToolsV6 } from "ai";
import { generateText as generateV7, tool as toolV7 } from "ai-v7";
import type {
  Experimental_SandboxSession as SandboxV7,
  ToolSet as ToolsV7,
} from "ai-v7";
import { MockLanguageModelV4 } from "ai-v7/test";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod/v4";

import { aisdk, tools } from "../src/index";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: {
    reasoning: undefined,
    text: 1,
    total: 1,
  },
};

test("ai sdk v6 executes sandbox tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });

  try {
    const kit = tools(sandbox, { allow: ["read", "write", "exec"] });
    const toolkit: ToolsV6 = kit.tools;

    await generateV6({
      model: new MockLanguageModelV3({
        doGenerate: {
          content: [
            {
              input: JSON.stringify({
                path: "/workspace/v6.txt",
                text: "v6",
              }),
              toolCallId: "call-v6",
              toolName: "write",
              type: "tool-call",
            },
          ],
          finishReason: { raw: undefined, unified: "tool-calls" },
          usage,
          warnings: [],
        },
      }),
      ...aisdk(kit),
      prompt: "write the v6 fixture",
      tools: toolkit,
    });

    expect(await sandbox.files.text("/workspace/v6.txt")).toBe("v6");
  } finally {
    await sandbox.stop();
  }
});

test("ai sdk v7 executes sandbox tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });

  try {
    const kit = tools(sandbox, { allow: ["read", "write", "exec"] });
    const session: SandboxV7 = kit.sandbox;
    const toolkit: ToolsV7 = kit.tools;

    await generateV7({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              input: JSON.stringify({
                path: "/workspace/v7.txt",
                text: "v7",
              }),
              toolCallId: "call-v7",
              toolName: "write",
              type: "tool-call",
            },
          ],
          finishReason: { raw: undefined, unified: "tool-calls" },
          usage,
          warnings: [],
        },
      }),
      ...aisdk(kit),
      experimental_sandbox: session,
      prompt: "write the v7 fixture",
      tools: toolkit,
    });

    expect(await sandbox.files.text("/workspace/v7.txt")).toBe("v7");
  } finally {
    await sandbox.stop();
  }
});

test("ai sdk v7 passes sandbox sessions to custom tools", async () => {
  const sandbox = await create({ adapter: local(), cwd: "/workspace" });

  try {
    const kit = tools(sandbox);
    let received: SandboxV7 | undefined;

    await generateV7({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              input: JSON.stringify({}),
              toolCallId: "call-session",
              toolName: "session",
              type: "tool-call",
            },
          ],
          finishReason: { raw: undefined, unified: "tool-calls" },
          usage,
          warnings: [],
        },
      }),
      ...aisdk(kit),
      prompt: "use the sandbox session",
      tools: {
        session: toolV7({
          description: "write a file through the sandbox session",
          execute: async (_, { experimental_sandbox: session }) => {
            received = session;
            if (session === undefined) {
              throw new Error("missing sandbox session");
            }
            await session.writeTextFile({
              content: "context",
              path: "/workspace/context.txt",
            });
            return "written";
          },
          inputSchema: z.object({}),
        }),
      },
    });

    expect(received).toBe(kit.sandbox);
    expect(await sandbox.files.text("/workspace/context.txt")).toBe("context");
  } finally {
    await sandbox.stop();
  }
});
