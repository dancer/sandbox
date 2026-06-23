# @sandbox-sdk/blaxel

Blaxel adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/blaxel
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { blaxel } from "@sandbox-sdk/blaxel";

await withSandbox(
  { adapter: blaxel({ image: "blaxel/base-image:latest" }), cwd: "/app" },
  async (sandbox) => sandbox.process.shell("pwd")
);
```

Pass `apiKey` and `workspace`, or use `BL_API_KEY` or `BL_CLIENT_CREDENTIALS`
with `BL_WORKSPACE`. Typed native lifecycle, network, preview, session, and
drive controls remain available through `sandbox.raw`.

Read the [Blaxel adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
