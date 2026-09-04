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

## Security

Create client-side session tokens on a trusted backend and treat them as bearer
credentials. Blaxel Agent Drive is currently a workspace-wide preview feature:
`drivePath` and `readOnly` mounts are not authorization boundaries for
untrusted sandbox code. Restrict access to the drive identity token and `blfs`
when an agent must not change drive access.

## Cleanup

`stop()` deletes the sandbox rather than placing it in standby. Manage native
lifecycle controls yourself when you want to retain a perpetual sandbox.

`withSandbox()` applies this cleanup even for an existing sandbox id. Consume
streams inside its callback. See the [lifecycle guide](https://sandbox-sdk.sh/lifecycle.md).

## License

MIT
