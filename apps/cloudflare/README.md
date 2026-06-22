# cloudflare live validation

This Worker validates the real `@sandbox-sdk/cloudflare` adapter against a Cloudflare Sandbox Durable Object binding.

## deploy

```bash
bun install
bun run --cwd apps/cloudflare deploy
```

Wrangler builds the configured Sandbox container during deploy, so Docker must
be installed and running before this command can succeed.

Set the live test URL after deploy:

```bash
export CLOUDFLARE_SANDBOX_WORKER_URL="https://verify.sandbox-sdk.workers.dev"
bun run verify:cloudflare
```

Set the bearer token:

```bash
bunx wrangler secret put SANDBOX_SDK_TOKEN --cwd apps/cloudflare
export CLOUDFLARE_SANDBOX_TOKEN="same-value"
```

The live route requires `SANDBOX_SDK_TOKEN`. Without it, the Worker returns
`missing_token` so a deployed validation endpoint cannot run sandboxes
unauthenticated.

## routes

- `/sandbox-sdk/live` verifies normalized files, process execution, environment, and streaming behavior
- `/sandbox-sdk/ports` verifies a reachable quick tunnel through `ports.expose()`
- `/sandbox-sdk/raw` verifies raw sessions, code contexts, interpreter execution, retained change checks, and safe method presence for configured raw features
- `/sandbox-sdk/cleanup` stops sandboxes created by tunnel checks

## binding

The Worker must export the Sandbox Durable Object class and bind it in `wrangler.jsonc`.

```ts
export { Sandbox } from "@cloudflare/sandbox";
```

```jsonc
{
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile",
      "instance_type": "lite",
      "max_instances": 1,
    },
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "Sandbox",
        "name": "Sandbox",
      },
    ],
  },
}
```

## ports

The adapter uses Cloudflare's RPC transport and quick tunnels, so the live port
verification only needs the Worker URL and bearer token. No wildcard route or
custom preview hostname is required. Cloudflare accepts ports 1024-65535 and
reserves port `3000` for the Sandbox runtime.

## named tunnels

The default live verifier intentionally covers quick tunnels only. Named tunnel
mapping is covered by adapter contract tests. A provider-backed named tunnel
check requires a `CLOUDFLARE_API_TOKEN` with access to one Cloudflare account
and zone to be configured as a Worker secret. That token stays on the Worker
and must never be passed through sandbox environment configuration.
