import { expect, test } from "bun:test";

import { Sandbox } from "@vercel/sandbox";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

import { stream } from "../../../examples/aisdk.ts";

for (const ending of ["complete", "cancel", "error"] as const) {
  test(`streaming example keeps its sandbox alive until ${ending}`, async () => {
    const original = Sandbox.create;
    const names = ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID"];
    const environment = names.map((name) => [name, process.env[name]] as const);
    let stopped = false;
    let signal: AbortSignal | undefined;
    const raw = {
      fs: { mkdir: () => Promise.resolve() },
      name: "sandbox",
      status: "running",
      stop: () => {
        stopped = true;
        return Promise.resolve();
      },
    } as unknown as Sandbox;
    Sandbox.create = (() => Promise.resolve(raw)) as typeof Sandbox.create;
    for (const name of names) {
      process.env[name] = "test";
    }
    const model = new MockLanguageModelV3({
      doStream: (options) => {
        signal = options.abortSignal;
        return Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { id: "text", type: "text-start" },
              { delta: "hello", id: "text", type: "text-delta" },
              { delta: " world", id: "text", type: "text-delta" },
              { id: "text", type: "text-end" },
              {
                finishReason: { raw: undefined, unified: "stop" },
                type: "finish",
                usage: {
                  inputTokens: {
                    cacheRead: undefined,
                    cacheWrite: undefined,
                    noCache: 1,
                    total: 1,
                  },
                  outputTokens: { reasoning: undefined, text: 2, total: 2 },
                },
              },
            ],
          }),
        });
      },
    });
    try {
      const output = await stream(model);
      const failure = new Error("consumer failed");
      const consume = async () => {
        let text = "";
        for await (const chunk of output) {
          expect(stopped).toBe(false);
          text += chunk;
          if (ending === "cancel") {
            break;
          }
          if (ending === "error") {
            throw failure;
          }
        }
        return text;
      };
      if (ending === "error") {
        await expect(consume()).rejects.toBe(failure);
      } else {
        expect(await consume()).toBe(
          ending === "complete" ? "hello world" : "hello"
        );
      }
      expect(stopped).toBe(true);
      expect(signal?.aborted).toBe(true);
    } finally {
      Sandbox.create = original;
      for (const [name, value] of environment) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, name);
        } else {
          process.env[name] = value;
        }
      }
    }
  });
}
