# @sandbox-sdk/daytona

Daytona adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/daytona
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";

await withSandbox(
  { adapter: daytona({ deleteOnStop: true }), cwd: "/tmp/workspace" },
  async (sandbox) => sandbox.process.shell("pwd")
);
```

Pass `apiKey` or set `DAYTONA_API_KEY`. Typed native controls such as SSH, PTY,
LSP, and network settings remain available through `sandbox.raw`.

Read the [Daytona adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
