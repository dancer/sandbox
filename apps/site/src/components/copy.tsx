"use client";

import { CheckIcon, CopyIcon, CircleAlertIcon } from "lucide-react";

import { useClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

interface CopyProps {
  className?: string;
  value: string;
}

export const Copy = ({ className, value }: CopyProps) => {
  const { copy, status } = useClipboard(value);
  const failed = status === "failed";
  const Icon = { copied: CheckIcon, failed: CircleAlertIcon, ready: CopyIcon }[
    status
  ];
  const label = {
    copied: "Copied code",
    failed: "Copy failed. Try again",
    ready: "Copy code",
  }[status];
  const message = {
    copied: "Copied to clipboard",
    failed: "Copy failed. Select and copy the text manually.",
    ready: "",
  }[status];

  return (
    <button
      aria-label={label}
      className={cn(
        "absolute top-6 right-5 z-10 inline-flex size-8 items-center justify-center rounded-sm p-1 text-foreground/55 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      onClick={copy}
      title={label}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.5", failed && "text-destructive")}
      />
      <output className="sr-only">{message}</output>
    </button>
  );
};
