import { expect, test } from "bun:test";

import { aiSdk, tools } from "@sandbox-sdk/ai";
import { claude } from "@sandbox-sdk/ai/claude";
import { openai } from "@sandbox-sdk/ai/openai";
import { blaxel } from "@sandbox-sdk/blaxel";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { codesandbox } from "@sandbox-sdk/codesandbox";
import { create, withSandbox } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";
import { e2b } from "@sandbox-sdk/e2b";
import { local } from "@sandbox-sdk/local";
import { modal } from "@sandbox-sdk/modal";
import { vercel, vercelSandbox } from "@sandbox-sdk/vercel";

test("packages expose stable entrypoints", () => {
  expect(typeof create).toBe("function");
  expect(typeof withSandbox).toBe("function");
  expect(typeof aiSdk).toBe("function");
  expect(typeof tools).toBe("function");
  expect(typeof claude).toBe("function");
  expect(typeof openai).toBe("function");
  expect(typeof blaxel).toBe("function");
  expect(typeof cloudflare).toBe("function");
  expect(typeof codesandbox).toBe("function");
  expect(typeof daytona).toBe("function");
  expect(typeof e2b).toBe("function");
  expect(typeof local).toBe("function");
  expect(typeof modal).toBe("function");
  expect(typeof vercel).toBe("function");
  expect(vercelSandbox).toBe(vercel);
});
