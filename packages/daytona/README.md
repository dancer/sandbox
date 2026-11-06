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

## Snapshots and lifecycle

`snapshots.create(name?)` captures the current filesystem through Daytona's stable sandbox snapshot API and returns the provider id and persisted name. Create a fresh sandbox with `create({ snapshot: id })`. In-place restoration stays unsupported. Snapshot deletion requires the provider's `delete:snapshots` permission.

`target` selects the creation region, including when using an injected client. Native options include `autoPauseInterval`, `ttlMinutes`, `queueTimeout`, `domainAllowList`, `outboundProxyUrl`, `secrets`, and `kvm`. Proxy routing alone is not a network authorization boundary. Linked sandboxes require a prebuilt snapshot and cannot use a declarative image build.

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

## Cleanup

`stop()` retains the sandbox by default, subject to its archive and deletion
policies. The example opts into permanent deletion with `deleteOnStop: true`.

`withSandbox()` applies this cleanup even for an existing sandbox id. Consume
streams inside its callback. See the [lifecycle guide](https://sandbox-sdk.sh/lifecycle.md).

## License

MIT
