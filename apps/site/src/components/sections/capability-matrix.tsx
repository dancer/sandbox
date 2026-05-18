"use client";

import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Star } from "@/components/star";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Status = "ok" | "warn" | "no";

interface Cell {
  status: Status;
  note?: string;
}

const ok: Cell = { status: "ok" };
const warn = (note: string): Cell => ({ note, status: "warn" });
const no = (note: string): Cell => ({ note, status: "no" });

const COLUMNS = [
  { key: "local", label: "Local", parent: "Local" },
  { key: "blaxel", label: "Blaxel", parent: "Blaxel" },
  { key: "cloudflare", label: "Cloudflare", parent: "Cloudflare" },
  { key: "codesandbox", label: "CodeSandbox", parent: "CodeSandbox" },
  { key: "daytona", label: "Daytona", parent: "Daytona" },
  { key: "e2b", label: "E2B", parent: "E2B" },
  { key: "modal", label: "Modal", parent: "Modal" },
  { key: "vercel", label: "Vercel", parent: "Vercel" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const ROWS: { capability: string; cells: Record<ColumnKey, Cell> }[] = [
  {
    capability: "files",
    cells: {
      blaxel: ok,
      cloudflare: ok,
      codesandbox: ok,
      daytona: ok,
      e2b: ok,
      local: ok,
      modal: ok,
      vercel: ok,
    },
  },
  {
    capability: "process exec",
    cells: {
      blaxel: ok,
      cloudflare: ok,
      codesandbox: ok,
      daytona: ok,
      e2b: ok,
      local: ok,
      modal: ok,
      vercel: ok,
    },
  },
  {
    capability: "process spawn",
    cells: {
      blaxel: ok,
      cloudflare: ok,
      codesandbox: ok,
      daytona: no(
        "Daytona exposes buffered exec and shell commands in this adapter. Background process spawn stays behind raw until the provider surface is stable."
      ),
      e2b: ok,
      local: ok,
      modal: no(
        "Modal exposes one-shot command execution in this adapter. Background process handles are not normalized because the current SDK process object has no stable kill handle."
      ),
      vercel: ok,
    },
  },
  {
    capability: "ports",
    cells: {
      blaxel: ok,
      cloudflare: ok,
      codesandbox: ok,
      daytona: ok,
      e2b: ok,
      local: warn(
        "Local previews are derived localhost URLs. There is no tunnel because the process already runs on the host."
      ),
      modal: warn(
        "Modal ports must be declared when the sandbox is created, then exposed through Modal tunnels."
      ),
      vercel: ok,
    },
  },
  {
    capability: "snapshot create",
    cells: {
      blaxel: no(
        "Blaxel snapshot behavior is provider-specific today and stays behind raw until the normalized contract is right."
      ),
      cloudflare: no(
        "Cloudflare Sandbox backups and hibernation are provider-specific today. The adapter keeps them behind raw until the normalized snapshot contract is right."
      ),
      codesandbox: no(
        "CodeSandbox hibernation is provider-specific today and stays behind raw until the normalized snapshot contract is right."
      ),
      daytona: no(
        "Daytona snapshot and fork APIs are still experimental in the current adapter surface. Use raw for provider-specific snapshot workflows."
      ),
      e2b: warn(
        "E2B supports snapshot creation. Restore is tracked separately because in-place restore is not normalized yet."
      ),
      local: warn(
        "Local snapshots copy the sandbox filesystem to a temporary host directory."
      ),
      modal: warn(
        "Modal supports filesystem snapshot creation. Restore is tracked separately because in-place restore is not normalized yet."
      ),
      vercel: warn(
        "Vercel supports snapshot creation. Creating a snapshot stops the running sandbox."
      ),
    },
  },
  {
    capability: "snapshot restore",
    cells: {
      blaxel: no(
        "Blaxel restore and fork flows are provider-specific in this adapter today."
      ),
      cloudflare: no(
        "Cloudflare backup and restore is provider-specific today and stays behind raw until the normalized contract is right."
      ),
      codesandbox: no(
        "CodeSandbox resume and hibernation are provider-specific in this adapter today."
      ),
      daytona: no(
        "Daytona restore and fork flows are provider-specific in this adapter today."
      ),
      e2b: no(
        "E2B restore is not exposed as an in-place restore operation in this adapter."
      ),
      local: warn(
        "Local restore works for snapshots created by the same sandbox instance."
      ),
      modal: no(
        "Modal can create filesystem snapshots, but in-place restore is not exposed by the normalized adapter."
      ),
      vercel: no(
        "Vercel can create a new sandbox from a snapshot through the snapshot create option, but in-place restore is not supported."
      ),
    },
  },
  {
    capability: "snapshot source",
    cells: {
      blaxel: no(
        "Blaxel snapshot source flows stay behind raw until the normalized create-from-snapshot contract is right."
      ),
      cloudflare: no(
        "Cloudflare backup and hibernation flows stay behind raw until the normalized create-from-snapshot contract is right."
      ),
      codesandbox: no(
        "CodeSandbox templates use the shared template option, not the snapshot source option."
      ),
      daytona: warn(
        "Daytona can create a new sandbox from a snapshot id at create time."
      ),
      e2b: warn(
        "E2B can create a new sandbox from a snapshot id or template id at create time."
      ),
      local: no(
        "Local snapshots are in-process filesystem checkpoints, not portable snapshot sources."
      ),
      modal: warn(
        "Modal can create a sandbox from a Modal image id through the shared snapshot create option."
      ),
      vercel: warn(
        "Vercel can create a new sandbox from a snapshot id at create time."
      ),
    },
  },
  {
    capability: "environment",
    cells: {
      blaxel: ok,
      cloudflare: ok,
      codesandbox: ok,
      daytona: ok,
      e2b: ok,
      local: ok,
      modal: ok,
      vercel: ok,
    },
  },
  {
    capability: "secrets",
    cells: {
      blaxel: no(
        "Secrets are not normalized in this adapter. Pass environment values explicitly or use Blaxel-native features through raw."
      ),
      cloudflare: no(
        "Secrets are not normalized in this adapter. Pass environment values explicitly or use Cloudflare-native bindings outside the shared SDK surface."
      ),
      codesandbox: no(
        "Secrets are not normalized in this adapter. Pass environment values explicitly or use CodeSandbox-native session configuration."
      ),
      daytona: no(
        "Secrets are not normalized in this adapter. Pass environment values explicitly or use Daytona-native features through raw."
      ),
      e2b: no(
        "Secrets are not normalized in this adapter. Pass environment values explicitly or use E2B-native features through raw."
      ),
      local: no(
        "No secret store. Local sandboxes inherit the host environment. Manage secrets at the OS level."
      ),
      modal: no(
        "Secrets are not normalized in this adapter. Pass environment values explicitly or use Modal-native secrets through raw."
      ),
      vercel: no(
        "Secrets are not normalized in this adapter. Pass environment values explicitly or use Vercel-native project configuration outside the shared SDK surface."
      ),
    },
  },
];

const LABEL_BY_STATUS: Record<Status, string> = {
  no: "Not supported",
  ok: "Supported",
  warn: "Supported with caveat",
};

const StarBullet = ({
  status,
  size = "default",
}: {
  status: Status;
  size?: "default" | "sm";
}) => {
  const px = size === "sm" ? "size-3" : "size-3.5";
  if (status === "ok") {
    return <Star className={cn(px, "text-foreground")} />;
  }
  if (status === "warn") {
    return <Star className={cn(px, "text-foreground/40")} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        px,
        "inline-block rounded-full border border-foreground/15"
      )}
    />
  );
};

const StatusIcon = ({ cell }: { cell: Cell }) => {
  const label = LABEL_BY_STATUS[cell.status];
  const bullet = <StarBullet status={cell.status} />;
  if (!cell.note) {
    return (
      <span aria-label={label} className="inline-flex">
        {bullet}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help focus-visible:outline-1 focus-visible:outline-ring rounded-sm"
          aria-label={`${label}: ${cell.note}`}
        >
          {bullet}
        </button>
      </TooltipTrigger>
      <TooltipContent>{cell.note}</TooltipContent>
    </Tooltip>
  );
};

const Legend = ({
  status,
  children,
}: {
  status: Status;
  children: ReactNode;
}) => (
  <span className="inline-flex items-center gap-1.5">
    <StarBullet size="sm" status={status} />
    <span>{children}</span>
  </span>
);

export const CapabilityMatrix = () => (
  <section>
    <Heading as="h2" number={10}>Capability matrix</Heading>
    <p>
      Every adapter implements the same core capability surface, but providers
      differ on what they natively support. Branch on{" "}
      <code>sandbox.capabilities</code> at runtime, or read this table at design
      time. Hover the warning and error icons for the why behind each one.
    </p>
    <TooltipProvider delayDuration={150}>
      <div className="overflow-x-auto rounded-md border border-border/40">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/40">
              <th className="sticky left-0 bg-background px-3 py-2 text-left font-medium text-muted-foreground">
                Capability
              </th>
              {COLUMNS.map((col, i) => (
                <th
                  className={cn(
                    "px-2 py-2 text-center font-medium text-foreground whitespace-nowrap",
                    i < COLUMNS.length - 1 && "border-r border-border/40"
                  )}
                  key={col.key}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                className="border-b border-border/40 last:border-b-0"
                key={row.capability}
              >
                <th className="sticky left-0 bg-background px-3 py-2 text-left font-mono font-normal whitespace-nowrap">
                  {row.capability}
                </th>
                {COLUMNS.map((col, i) => (
                  <td
                    className={cn(
                      "px-2 py-2 text-center",
                      i < COLUMNS.length - 1 && "border-r border-border/40"
                    )}
                    key={col.key}
                  >
                    <StatusIcon cell={row.cells[col.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
    <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
      <Legend status="ok">Supported</Legend>
      <Legend status="warn">Supported with caveat</Legend>
      <Legend status="no">Not supported</Legend>
    </p>
  </section>
);
