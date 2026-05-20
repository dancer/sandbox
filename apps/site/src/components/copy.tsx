"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface CopyProps {
  className?: string;
  value: string;
}

export const Copy = ({ className, value }: CopyProps) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const fallback = () => {
    const element = document.createElement("textarea");
    element.value = value;
    element.setAttribute("readonly", "");
    element.style.position = "fixed";
    element.style.opacity = "0";
    document.body.append(element);
    element.select();
    document.execCommand("copy");
    element.remove();
  };

  const write = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      fallback();
    }
    setCopied(true);
  };

  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <button
      aria-label={copied ? "Copied code" : "Copy code"}
      className={cn(
        "absolute top-6 right-5 z-10 inline-flex items-center justify-center rounded-sm p-1 text-foreground/35 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      onClick={write}
      title={copied ? "Copied" : "Copy"}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
};
