import { describe, expect, test } from "bun:test";

import { credentialRows, formatRows } from "./credentials";

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
  credentialRows({
    env,
    exists: () => false,
    home: "/tmp/sandbox-sdk",
    now,
  }).find((entry) => entry.provider === name);

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

  test("reports Cloudflare workflow as partial until preview host is present", () => {
    expect(
      row("cloudflare", {
        CLOUDFLARE_SANDBOX_TOKEN: "token",
        CLOUDFLARE_SANDBOX_WORKER_URL: "https://verify.example.com",
      })
    ).toMatchObject({
      details: "workflow ready, add CLOUDFLARE_SANDBOX_PREVIEW_HOST for ports",
      status: "partial",
    });
  });

  test("reports partial Cloudflare workflow before preview host validation", () => {
    expect(
      row("cloudflare", {
        CLOUDFLARE_SANDBOX_PREVIEW_HOST: "verify.sandbox-sdk.workers.dev",
        CLOUDFLARE_SANDBOX_TOKEN: "token",
      })
    ).toMatchObject({
      details: "CLOUDFLARE_SANDBOX_WORKER_URL with CLOUDFLARE_SANDBOX_TOKEN",
      status: "partial",
    });
  });

  test("rejects workers.dev as a Cloudflare preview host", () => {
    expect(
      row("cloudflare", {
        CLOUDFLARE_SANDBOX_PREVIEW_HOST: "verify.sandbox-sdk.workers.dev",
        CLOUDFLARE_SANDBOX_TOKEN: "token",
        CLOUDFLARE_SANDBOX_WORKER_URL: "https://verify.sandbox-sdk.workers.dev",
      })
    ).toMatchObject({
      details:
        "workflow ready, CLOUDFLARE_SANDBOX_PREVIEW_HOST must be a custom hostname without protocol",
      status: "partial",
    });
  });

  test("reports Cloudflare ready when workflow and port host are ready", () => {
    expect(
      row("cloudflare", {
        CLOUDFLARE_SANDBOX_PREVIEW_HOST: "preview.sandbox-sdk.sh",
        CLOUDFLARE_SANDBOX_TOKEN: "token",
        CLOUDFLARE_SANDBOX_WORKER_URL: "https://verify.sandbox-sdk.workers.dev",
      })
    ).toMatchObject({
      details: "ready",
      status: "ready",
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
