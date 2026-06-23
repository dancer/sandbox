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

## Native Client

For Daytona service managers that are not tied to one sandbox, such as durable
snapshots and volumes, create and reuse `DaytonaClient` through the adapter:

```ts
import { create } from "@sandbox-sdk/core";
import { DaytonaClient, daytona } from "@sandbox-sdk/daytona";

const client = new DaytonaClient({ apiKey: process.env.DAYTONA_API_KEY });
const sandbox = await create({ adapter: daytona({ client }) });
const snapshots = await client.snapshot.list();
```

The injected client takes care of the adapter's provider requests too, so
advanced calls and normalized sandbox operations use the same credentials and
transport.

Read the [Daytona adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
