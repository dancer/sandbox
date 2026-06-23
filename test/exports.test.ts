import { expect, test } from "bun:test";

import { aisdk, network, tools } from "@sandbox-sdk/ai";
import { claude } from "@sandbox-sdk/ai/claude";
import { openai } from "@sandbox-sdk/ai/openai";
import {
  blaxel,
  updateLifecycle,
  updateNetwork,
  updateTtl,
} from "@sandbox-sdk/blaxel";
import { cloudflare, cloudflareBridge } from "@sandbox-sdk/cloudflare";
import { CodeSandboxClient, codesandbox } from "@sandbox-sdk/codesandbox";
import {
  abort,
  bytes,
  capabilityMode,
  command,
  create,
  duration,
  fromSandboxRuntime,
  isSandboxError,
  port,
  portOptions,
  preview,
  quote,
  rawCapabilityMode,
  requireCapability,
  requireRawCapability,
  result,
  sandboxError,
  sandboxPath,
  SandboxError,
  supports,
  supportsRaw,
  text,
  timeout,
  unsupported,
  withSandbox,
} from "@sandbox-sdk/core";
import { DaytonaClient, daytona } from "@sandbox-sdk/daytona";
import { e2b } from "@sandbox-sdk/e2b";
import { local } from "@sandbox-sdk/local";
import { ModalClient, modal } from "@sandbox-sdk/modal";
import {
  defineVercelSandboxProxy,
  vercel,
  VercelAPIError,
  VercelCommand,
  VercelCommandFinished,
  VercelFileSystem,
  VercelSandbox,
  VercelSession,
  VercelSnapshot,
  VercelStreamError,
} from "@sandbox-sdk/vercel";

const entrypoints = {
  CodeSandboxClient,
  DaytonaClient,
  ModalClient,
  SandboxError,
  VercelAPIError,
  VercelCommand,
  VercelCommandFinished,
  VercelFileSystem,
  VercelSandbox,
  VercelSession,
  VercelSnapshot,
  VercelStreamError,
  abort,
  aisdk,
  blaxel,
  bytes,
  capabilityMode,
  claude,
  cloudflare,
  cloudflareBridge,
  codesandbox,
  command,
  create,
  daytona,
  defineVercelSandboxProxy,
  duration,
  e2b,
  fromSandboxRuntime,
  isSandboxError,
  local,
  modal,
  network,
  openai,
  port,
  portOptions,
  preview,
  quote,
  rawCapabilityMode,
  requireCapability,
  requireRawCapability,
  result,
  sandboxError,
  sandboxPath,
  supports,
  supportsRaw,
  text,
  timeout,
  tools,
  unsupported,
  updateLifecycle,
  updateNetwork,
  updateTtl,
  vercel,
  withSandbox,
};

test("packages expose stable entrypoints", () => {
  for (const entrypoint of Object.values(entrypoints)) {
    expect(typeof entrypoint).toBe("function");
  }
});
