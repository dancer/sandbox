"use client";

import { useEffect, useState } from "react";

import { Star } from "@/components/star";
import { cn } from "@/lib/utils";

interface ChildItem {
  id: string;
  label: string;
}

interface Section {
  id: string;
  label: string;
  number?: number;
  children?: ChildItem[];
}

const sections: Section[] = [
  { id: "why", label: "Why", number: 1 },
  { id: "installation", label: "Installation", number: 2 },
  { id: "quick-start", label: "Quick start", number: 3 },
  {
    children: [
      { id: "adapter-local", label: "Local" },
      { id: "adapter-blaxel", label: "Blaxel" },
      { id: "adapter-cloudflare", label: "Cloudflare" },
      { id: "adapter-codesandbox", label: "CodeSandbox" },
      { id: "adapter-daytona", label: "Daytona" },
      { id: "adapter-e2b", label: "E2B" },
      { id: "adapter-modal", label: "Modal" },
      { id: "adapter-vercel", label: "Vercel" },
    ],
    id: "adapters",
    label: "Adapters",
    number: 4,
  },
  {
    children: [
      { id: "files-read", label: "files.read" },
      { id: "files-write", label: "files.write" },
      { id: "files-list", label: "files.list" },
      { id: "files-remove", label: "files.remove" },
      { id: "process-exec", label: "process.shell" },
      { id: "process-spawn", label: "process.spawn" },
      { id: "ports-expose", label: "ports.expose" },
      { id: "snapshots", label: "snapshots" },
    ],
    id: "api-reference",
    label: "API reference",
    number: 5,
  },
  { id: "the-sandbox-type", label: "The Sandbox type", number: 6 },
  { id: "errors", label: "Errors", number: 7 },
  { id: "escape-hatch", label: "Escape hatch", number: 8 },
  {
    children: [
      { id: "ai-sdk-tools", label: "Vercel AI SDK" },
      { id: "claude-tools", label: "Claude Agent SDK" },
      { id: "openai-tools", label: "OpenAI" },
    ],
    id: "ai-tools",
    label: "AI tools",
    number: 9,
  },
  { id: "capability-matrix", label: "Capability matrix", number: 10 },
];

const rowBase =
  "group/row -mx-2 grid grid-cols-[14px_22px_1fr] items-center gap-x-2.5 rounded-md px-2 py-1 text-xs leading-relaxed transition-colors";

export const TableOfContents = () => {
  const [activeId, setActiveId] = useState<string>(sections[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );

    const ids = sections.flatMap(({ id, children }) => [
      id,
      ...(children?.map((child) => child.id) ?? []),
    ]);

    for (const id of ids) {
      const el = document.querySelector(`#${id}`);
      if (el) {
        observer.observe(el);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const activeParentId = sections.find(
    ({ id, children }) =>
      id === activeId || children?.some((child) => child.id === activeId)
  )?.id;

  return (
    <nav aria-label="On this page">
      <ul className="flex list-none flex-col gap-0 pl-0">
        {sections.map(({ id, label, number, children }) => {
          const expanded = activeParentId === id;
          const active = activeId === id || expanded;

          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className={cn(
                  rowBase,
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                )}
              >
                <span className="flex items-center justify-center">
                  <Star
                    className={cn(
                      "size-2.5 transition-colors",
                      active
                        ? "text-foreground"
                        : "text-foreground/25 group-hover/row:text-foreground/55"
                    )}
                  />
                </span>
                <span className="font-mono tabular-nums text-[0.7rem] text-foreground/40">
                  {number !== undefined ? String(number).padStart(2, "0") : ""}
                </span>
                <span className="truncate">{label}</span>
              </a>
              {children ? (
                <div
                  aria-hidden={!expanded}
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                    expanded
                      ? "grid-rows-[1fr] opacity-100"
                      : "pointer-events-none grid-rows-[0fr] opacity-0"
                  )}
                >
                  <ul className="flex min-h-0 list-none flex-col gap-0 overflow-hidden pl-0">
                    {children.map((child) => {
                      const childActive = activeId === child.id;
                      return (
                        <li key={child.id}>
                          <a
                            href={`#${child.id}`}
                            className={cn(
                              rowBase,
                              childActive
                                ? "text-foreground"
                                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                            )}
                          >
                            <span aria-hidden="true" />
                            <span className="flex items-center justify-center">
                              <span
                                className={cn(
                                  "size-1 rounded-full transition-colors",
                                  childActive
                                    ? "bg-foreground"
                                    : "bg-foreground/25 group-hover/row:bg-foreground/55"
                                )}
                              />
                            </span>
                            <span className="truncate">{child.label}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
