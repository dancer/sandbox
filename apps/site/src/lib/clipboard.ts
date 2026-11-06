"use client";

import { useEffect, useState } from "react";

type Status = "ready" | "copied" | "failed";

const fallback = (value: string): boolean => {
  const active = document.activeElement;
  const element = document.createElement("textarea");
  element.value = value;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.append(element);
  element.select();
  try {
    return document.execCommand("copy");
  } finally {
    element.remove();
    if (active instanceof HTMLElement) {
      active.focus();
    }
  }
};

export const useClipboard = (value: string) => {
  const [state, setState] = useState<{ status: Status; value: string }>({
    status: "ready",
    value,
  });
  const status = state.value === value ? state.status : "ready";
  useEffect(() => {
    if (status !== "copied") {
      return;
    }
    const timer = window.setTimeout(
      () => setState({ status: "ready", value }),
      1600
    );
    return () => window.clearTimeout(timer);
  }, [status, value]);
  const copy = async (): Promise<void> => {
    try {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        if (!fallback(value)) {
          throw new Error("copy failed");
        }
      }
      setState({ status: "copied", value });
    } catch {
      setState({ status: "failed", value });
    }
  };
  return { copy, status };
};
