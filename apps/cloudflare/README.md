# cloudflare live validation

This Worker validates `@sandbox-sdk/cloudflare` against Cloudflare 1.0 native containers inside an application-owned Durable Object

## deploy

Use the repository Bun version, log into Wrangler, and start Docker Desktop before deployment

```bash
bun install --frozen-lockfile
bunx wrangler login
bun run build:packages
bun run --cwd apps/cloudflare deploy
bunx wrangler secret put SANDBOX_SDK_TOKEN --cwd apps/cloudflare
```

The Dockerfile copies the 1.0.3 sandbox-shim into a Node.js image. Keep it aligned with `@cloudflare/sandbox`. Wrangler builds and uploads the image during deployment. This deploys the verification Worker only

The `Native` Durable Object owns its container. `wrangler.jsonc` uses `durable_object` scheduling and a named `sandbox` image. The historical `Sandbox` export is retained for the previous migration

## verify

Set these values in the repository's ignored `.env.local` file

```bash
CLOUDFLARE_SANDBOX_WORKER_URL=https://verify.sandbox-sdk.workers.dev
CLOUDFLARE_SANDBOX_TOKEN=the-worker-secret
```

```bash
bun run verify:cloudflare
```

- `/sandbox-sdk/live` verifies files, process execution, environment and streaming
- `/sandbox-sdk/ports` starts a server and returns an authenticated application preview
- `/sandbox-sdk/raw` verifies native execution and the available raw methods
- `/sandbox-sdk/snapshots` verifies snapshot creation, in-place restoration and create-from-snapshot
- `/sandbox-sdk/cleanup` destroys the container retained by preview verification

These routes require a bearer token and accept `POST`. Cleanup validates the Durable Object id before accessing its binding

`/preview/{id}/{port}/` requires the same bearer token and routes through `getTcpPort`. The verifier strips authorization before forwarding to the application over HTTP. The external preview URL uses HTTPS

Native snapshots are in public beta. The live snapshot check writes a checkpoint, restores it in place, then starts a stopped container from the same snapshot. Every instance is destroyed after verification. The provider snapshot remains available until Cloudflare expires it. The client allows five minutes for this check and does not retry creation automatically

## legacy bridge

`apps/cloudflare-bridge` is a separate verifier for the existing HTTP bridge transport. Cloudflare 1.0 removed that bridge, so this optional verifier uses the maintained 0.12.14 SDK and matching image

```bash
bun run verify:cloudflare:bridge
```

It requires `CLOUDFLARE_BRIDGE_URL` and `CLOUDFLARE_BRIDGE_TOKEN`. Quick tunnels depend on the legacy provider service. New applications should use native containers with application-owned preview routing
