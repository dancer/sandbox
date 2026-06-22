import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { credentialRows, formatRows, knownProviders } from "./credentials";

const root = resolve(import.meta.dir, "..");

const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf-8")
) as Readonly<{ scripts: Readonly<Record<string, string>> }>;

const encode = (input: unknown): string =>
  btoa(JSON.stringify(input))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const jwt = (payload: unknown): string =>
  `${encode({ alg: "none" })}.${encode(payload)}.`;

const row = (
  name: string,
  env: Readonly<Record<string, string | undefined>>,
  now = 1_900_000_000_000
) =>
  credentialRows(
    {
      env,
      exists: () => false,
      home: "/tmp/sandbox-sdk",
      now,
    },
    [name]
  ).find((entry) => entry.provider === name);

describe("credentialRows", () => {
  test("reports missing credentials without printing secrets", () => {
    const rows = credentialRows({
      env: {},
      exists: () => false,
      home: "/tmp/sandbox-sdk",
      now: 1_900_000_000_000,
    });
    expect(rows.every((entry) => entry.status === "missing")).toBe(true);
    expect(formatRows(rows)).toContain("no secret values were printed");
  });

  test("filters credential rows by provider", () => {
    const rows = credentialRows(
      {
        env: {
          CSB_API_KEY: "token",
          DAYTONA_API_KEY: "token",
        },
        exists: () => false,
        home: "/tmp/sandbox-sdk",
        now: 1_900_000_000_000,
      },
      ["codesandbox", "daytona"]
    );

    expect(rows.map((entry) => entry.provider)).toEqual([
      "codesandbox",
      "daytona",
    ]);
    expect(rows.every((entry) => entry.status === "ready")).toBe(true);
  });

  test("recognizes primary and optional verification providers", () => {
    expect(knownProviders()).toEqual([
      "blaxel",
      "cloudflare",
      "codesandbox",
      "daytona",
      "e2b",
      "modal",
      "vercel",
      "cloudflare-bridge",
      "daytona-snapshot-delete",
    ]);
  });

  test("reports Cloudflare ready with worker credentials", () => {
    expect(
      row("cloudflare", {
        CLOUDFLARE_SANDBOX_TOKEN: "token",
        CLOUDFLARE_SANDBOX_WORKER_URL: "https://verify.example.com",
      })
    ).toMatchObject({
      details: "ready",
      status: "ready",
    });
  });

  test("reports partial Cloudflare credentials without a worker url", () => {
    expect(
      row("cloudflare", {
        CLOUDFLARE_SANDBOX_TOKEN: "token",
      })
    ).toMatchObject({
      details: "CLOUDFLARE_SANDBOX_WORKER_URL with CLOUDFLARE_SANDBOX_TOKEN",
      status: "partial",
    });
  });

  test("keeps Cloudflare bridge verification opt-in", () => {
    const rows = credentialRows({
      env: {},
      exists: () => false,
      home: "/tmp/sandbox-sdk",
      now: 1_900_000_000_000,
    });

    expect(rows.some((entry) => entry.provider === "cloudflare-bridge")).toBe(
      false
    );
  });

  test("keeps Daytona snapshot deletion verification opt-in", () => {
    const rows = credentialRows({
      env: {},
      exists: () => false,
      home: "/tmp/sandbox-sdk",
      now: 1_900_000_000_000,
    });

    expect(
      rows.some((entry) => entry.provider === "daytona-snapshot-delete")
    ).toBe(false);
    expect(row("daytona-snapshot-delete", {})).toMatchObject({
      details:
        "DAYTONA_SNAPSHOT_DELETE_API_KEY with sandbox access, create:snapshots, and delete:snapshots",
      status: "missing",
    });
    expect(
      row("daytona-snapshot-delete", {
        DAYTONA_SNAPSHOT_DELETE_API_KEY: "token",
      })
    ).toMatchObject({ details: "ready", status: "ready" });
  });

  test("reports Cloudflare bridge credentials without using adapter defaults", () => {
    expect(
      row("cloudflare-bridge", {
        CLOUDFLARE_BRIDGE_TOKEN: "token",
        CLOUDFLARE_BRIDGE_URL: "https://bridge.example.com",
      })
    ).toMatchObject({
      details: "ready",
      status: "ready",
    });
  });

  test("requires custom Modal config paths to exist", () => {
    expect(
      row("modal", {
        MODAL_CONFIG_PATH: "/tmp/sandbox-sdk-missing-modal.toml",
      })
    ).toMatchObject({
      details: "MODAL_TOKEN_ID with MODAL_TOKEN_SECRET or modal cli config",
      status: "missing",
    });
  });

  test("reports expired Vercel OIDC before live verification", () => {
    expect(
      row(
        "vercel",
        {
          VERCEL_OIDC_TOKEN: jwt({
            exp: 1_899_999_999,
            owner_id: "team",
            project_id: "project",
          }),
        },
        1_900_000_000_000
      )
    ).toMatchObject({
      details:
        "VERCEL_OIDC_TOKEN expired; run `vercel env pull .env.local --scope birthstone --yes`",
      status: "missing",
    });
  });

  test("reports expiring Vercel OIDC as partial", () => {
    expect(
      row(
        "vercel",
        {
          VERCEL_OIDC_TOKEN: jwt({
            exp: 1_900_001_000,
            owner_id: "team",
            project_id: "project",
          }),
        },
        1_900_000_000_000
      )
    ).toMatchObject({
      details:
        "VERCEL_OIDC_TOKEN expires soon; run `vercel env pull .env.local --scope birthstone --yes` before longer verification",
      status: "partial",
    });
  });

  test("reports Vercel OIDC ready when claims are usable", () => {
    expect(
      row("vercel", {
        VERCEL_OIDC_TOKEN: jwt({
          exp: 1_900_010_000,
          owner_id: "team",
          project_id: "project",
        }),
      })
    ).toMatchObject({
      details: "ready",
      status: "ready",
    });
  });

  test("keeps Vercel access token precedence visible", () => {
    expect(
      row("vercel", {
        VERCEL_OIDC_TOKEN: jwt({
          exp: 1_900_010_000,
          owner_id: "team",
          project_id: "project",
        }),
        VERCEL_TOKEN: "token",
      })
    ).toMatchObject({
      details: "VERCEL_TOKEN with VERCEL_TEAM_ID and VERCEL_PROJECT_ID",
      status: "partial",
    });
  });
});

test("verification commands load credentials explicitly", () => {
  expect(readFileSync(resolve(root, "bunfig.toml"), "utf-8")).toContain(
    "[env]\nfile = false"
  );

  const verification = Object.entries(manifest.scripts).filter(([name]) =>
    name.startsWith("verify:")
  );

  expect(verification.length).toBeGreaterThan(0);
  for (const [, command] of verification) {
    expect(command).toContain("--env-file=.env.local");
  }
});
