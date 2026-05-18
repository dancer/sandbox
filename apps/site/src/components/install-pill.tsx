"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface InstallPillProps {
  command: string;
  className?: string;
}

export const InstallPill = ({ command, className }: InstallPillProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      aria-label={copied ? "Command copied" : `Copy ${command}`}
      className={cn(
        "group/install inline-flex max-w-full items-center gap-3 rounded-full border border-foreground/15 bg-foreground/[0.025] py-2 pl-4 pr-2.5 font-mono text-xs text-foreground transition-colors hover:bg-foreground/[0.05]",
        className
      )}
      onClick={handleCopy}
      type="button"
    >
      <span className="text-foreground/40 select-none">$</span>
      <span className="truncate">{command}</span>
      <span
        aria-hidden="true"
        className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.04] text-foreground/50 transition-all group-hover/install:bg-foreground/[0.08] group-hover/install:text-foreground"
      >
        {copied ? (
          <Check className="size-3" />
        ) : (
          <Copy className="size-3" />
        )}
      </span>
    </button>
  );
};
