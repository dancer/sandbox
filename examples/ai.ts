import { tools } from "@sandbox-sdk/ai";
import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

export const createKit = async () => {
  const sandbox = await create({
    adapter: local(),
    cwd: "/workspace",
  });
  return {
    kit: tools(sandbox, {
      allow: ["read", "write", "list", "exec"],
      cwd: "/workspace",
    }),
    sandbox,
    stop: () => sandbox.stop(),
  };
};
