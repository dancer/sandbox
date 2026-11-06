"use client";

import { Check, Copy, CircleAlert } from "lucide-react";

import { useClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

interface InstallPillProps {
  command: string;
  className?: string;
}

export const InstallPill = ({ command, className }: InstallPillProps) => {
  const { copy, status } = useClipboard(command);
  const failed = status === "failed";
  const Icon = { copied: Check, failed: CircleAlert, ready: Copy }[status];
  const label = {
    copied: "Command copied",
    failed: "Copy failed. Try again",
    ready: `Copy ${command}`,
  }[status];
  const message = {
    copied: "Command copied",
    failed: "Copy failed. Select and copy the command manually.",
    ready: "",
  }[status];

  return (
    <button
      aria-label={label}
      className={cn(
        "group/install inline-flex max-w-full items-center gap-3 rounded-full border border-foreground/15 bg-foreground/[0.025] py-2 pl-4 pr-2.5 font-mono text-xs text-foreground transition-colors hover:bg-foreground/[0.05]",
        className
      )}
      onClick={copy}
      type="button"
    >
      <span className="text-foreground/40 select-none">$</span>
      <span className="truncate">{command}</span>
      <span
        aria-hidden="true"
        className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.04] text-foreground/50 transition-all group-hover/install:bg-foreground/[0.08] group-hover/install:text-foreground"
      >
        <Icon
          aria-hidden="true"
          className={cn("size-3", failed && "text-destructive")}
        />
      </span>
      <output className="sr-only">{message}</output>
    </button>
  );
};
