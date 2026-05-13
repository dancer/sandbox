"use client";

import { Check, TriangleAlert, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Heading } from "@/components/heading";
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
  { key: "e2b", label: "E2B", parent: "E2B" },
  { key: "daytona", label: "Daytona", parent: "Daytona" },
  { key: "vercel", label: "Vercel", parent: "Vercel" },
  { key: "cloudflare", label: "Cloudflare", parent: "Cloudflare" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const ROWS: { capability: string; cells: Record<ColumnKey, Cell> }[] = [
  {
    capability: "files",
    cells: {
      cloudflare: ok,
      daytona: ok,
      e2b: ok,
      local: ok,
      vercel: ok,
    },
  },
  {
    capability: "process",
    cells: {
      cloudflare: ok,
      daytona: ok,
      e2b: ok,
      local: ok,
      vercel: ok,
    },
  },
  {
    capability: "streaming",
    cells: {
      cloudflare: ok,
      daytona: ok,
      e2b: ok,
      local: ok,
      vercel: warn(
        "Vercel Sandbox streams stdout/stderr in chunks but doesn't flush on every write; for tight log feedback use exec() and read the buffered stdout afterwards."
      ),
    },
  },
  {
    capability: "ports",
    cells: {
      cloudflare: ok,
      daytona: ok,
      e2b: ok,
      local: no(
        "Local processes don't tunnel. There's nothing to expose. Use the host's own network for dev, or branch on sandbox.capabilities.ports."
      ),
      vercel: ok,
    },
  },
  {
    capability: "snapshots",
    cells: {
      cloudflare: warn(
        "Cloudflare Sandbox exposes Durable Object hibernation, not filesystem snapshots. The adapter maps snapshots.create() to a checkpoint of the DO state. Useful for resume, not for forking."
      ),
      daytona: ok,
      e2b: ok,
      local: no(
        "No snapshot primitive on the local filesystem. Mirror the root yourself with cp/rsync, or use a cloud adapter."
      ),
      vercel: no(
        "Vercel Sandbox is ephemeral by design. There is no snapshot or resume API. Persist any state you care about outside the sandbox."
      ),
    },
  },
  {
    capability: "environment",
    cells: {
      cloudflare: ok,
      daytona: ok,
      e2b: ok,
      local: ok,
      vercel: ok,
    },
  },
  {
    capability: "secrets",
    cells: {
      cloudflare: ok,
      daytona: ok,
      e2b: warn(
        "E2B supports env injection at sandbox-create time, but has no dedicated secret store. Secrets are env vars under the hood. Rotate at the provider, not at the adapter."
      ),
      local: no(
        "No secret store. Local sandboxes inherit the host environment. Manage secrets at the OS level."
      ),
      vercel: ok,
    },
  },
];

const ICON_BY_STATUS: Record<
  Status,
  { Icon: ComponentType<{ className?: string }>; cls: string; label: string }
> = {
  no: { Icon: X, cls: "text-red-500", label: "Not supported" },
  ok: { Icon: Check, cls: "text-emerald-500", label: "Supported" },
  warn: { Icon: TriangleAlert, cls: "text-amber-500", label: "Caveat" },
};

const StatusIcon = ({ cell }: { cell: Cell }) => {
  const { Icon, cls, label } = ICON_BY_STATUS[cell.status];
  const icon = (
    <Icon className={cn("size-4 shrink-0", cls)} aria-label={label} />
  );
  if (!cell.note) {
    return <span className="inline-flex">{icon}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help focus-visible:outline-1 focus-visible:outline-ring rounded-sm"
          aria-label={`${label}: ${cell.note}`}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent>{cell.note}</TooltipContent>
    </Tooltip>
  );
};

const Legend = ({
  icon: Icon,
  cls,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  cls: string;
  children: ReactNode;
}) => (
  <span className="inline-flex items-center gap-1.5">
    <Icon className={cn("size-3.5", cls)} />
    <span>{children}</span>
  </span>
);

export const CapabilityMatrix = () => (
  <section>
    <Heading as="h2">Capability matrix</Heading>
    <p>
      Every adapter implements the same seven-capability surface, but providers
      differ on what they natively support. Branch on{" "}
      <code>sandbox.capabilities</code> at runtime, or read this table at design
      time. Hover the warning and error icons for the why behind each one.
    </p>
    <TooltipProvider delayDuration={150}>
      <div className="overflow-x-auto rounded-md border border-dotted">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-dotted">
              <th className="sticky left-0 bg-background px-3 py-2 text-left font-medium text-muted-foreground">
                Capability
              </th>
              {COLUMNS.map((col, i) => (
                <th
                  className={cn(
                    "px-2 py-2 text-center font-medium text-foreground whitespace-nowrap",
                    i < COLUMNS.length - 1 && "border-r border-dotted"
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
                className="border-b border-dotted last:border-b-0"
                key={row.capability}
              >
                <th className="sticky left-0 bg-background px-3 py-2 text-left font-mono font-normal whitespace-nowrap">
                  {row.capability}
                </th>
                {COLUMNS.map((col, i) => (
                  <td
                    className={cn(
                      "px-2 py-2 text-center",
                      i < COLUMNS.length - 1 && "border-r border-dotted"
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
      <Legend cls="text-emerald-500" icon={Check}>
        Supported
      </Legend>
      <Legend cls="text-amber-500" icon={TriangleAlert}>
        Supported with caveat
      </Legend>
      <Legend cls="text-red-500" icon={X}>
        Not supported
      </Legend>
    </p>
  </section>
);
