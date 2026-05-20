import { test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { workflow } from "../../../test/workflow";
import { codesandbox } from "../src/index";

const enabled = Boolean(process.env.CSB_API_KEY);
const live = enabled ? test : test.skip;

live("codesandbox runs a live sandbox workflow", async () => {
  const cwd = "/project/sandbox";
  const sandbox = await create({
    adapter: codesandbox({
      stop: "delete",
    }),
    cwd,
  });

  try {
    await workflow(sandbox, {
      content: "hello from codesandbox",
      cwd,
      port: 3000,
      protocol: "https",
      serve:
        "node -e \"require('http').createServer((_, response) => response.end('ok')).listen(3000)\"",
    });
  } finally {
    await sandbox.stop();
  }
});
