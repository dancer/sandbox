# @sandbox-sdk/e2b

E2B adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/e2b
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { e2b } from "@sandbox-sdk/e2b";

await withSandbox({ adapter: e2b(), cwd: "/home/user" }, async (sandbox) =>
  sandbox.process.shell("pwd")
);
```

Pass `apiKey` or set `E2B_API_KEY`. Use the shared `snapshot` create option to
start a fresh sandbox from an E2B snapshot. Native Git, PTY, metrics, MCP, and
volume APIs remain available through `sandbox.raw`.

Read the [E2B adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
