import { expect, test } from "bun:test";

import { tools } from "@sandbox-sdk/ai";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { create, withSandbox } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";
import { e2b } from "@sandbox-sdk/e2b";
import { local } from "@sandbox-sdk/local";
import { vercel, vercelSandbox } from "@sandbox-sdk/vercel";

test("packages expose stable entrypoints", () => {
  expect(typeof create).toBe("function");
  expect(typeof withSandbox).toBe("function");
  expect(typeof tools).toBe("function");
  expect(typeof cloudflare).toBe("function");
  expect(typeof daytona).toBe("function");
  expect(typeof e2b).toBe("function");
  expect(typeof local).toBe("function");
  expect(typeof vercel).toBe("function");
  expect(vercelSandbox).toBe(vercel);
});
