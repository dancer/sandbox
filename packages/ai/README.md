# @sandbox-sdk/ai

Agent tool and sandbox-session helpers for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/local @sandbox-sdk/ai
```

Replace `@sandbox-sdk/local` with the adapter you run in production. Install
`ai`, `@openai/agents`, or `@anthropic-ai/claude-agent-sdk` only when you use
the corresponding integration.

## Use

```ts
import { aisdk, tools } from "@sandbox-sdk/ai";
import { withSandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

await withSandbox({ adapter: local(), cwd: "/workspace" }, async (sandbox) => {
  const kit = tools(sandbox, {
    allow: ["read", "write", "list", "exec"],
    cwd: "/workspace",
  });

  const options = aisdk(kit);
  return options;
});
```

`tools()` returns policy-aware agent tools and `aisdk()` returns AI SDK v6 and
v7 compatible prompt context, tools, and sandbox session fields.

Read the [AI tools documentation](https://sandbox-sdk.sh/ai-tools.md).

## License

MIT
