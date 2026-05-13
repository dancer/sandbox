"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface Section {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
}

const sections: Section[] = [
  { id: "why", label: "Why" },
  { id: "installation", label: "Installation" },
  { id: "quick-start", label: "Quick start" },
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
  },
  { id: "the-sandbox-type", label: "The Sandbox type" },
  { id: "errors", label: "Errors" },
  { id: "escape-hatch", label: "Escape hatch" },
  {
    children: [
      { id: "ai-sdk-tools", label: "Vercel AI SDK" },
      { id: "claude-tools", label: "Claude Agent SDK" },
      { id: "openai-tools", label: "OpenAI" },
    ],
    id: "ai-tools",
    label: "AI tools",
  },
  { id: "capability-matrix", label: "Capability matrix" },
];

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
        {sections.map(({ id, label, children }) => {
          const expanded = activeParentId === id;
          const active = activeId === id || expanded;

          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className={cn(
                  "block -ml-px border-l py-1 pl-4 text-xs leading-relaxed transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
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
                    {children.map((child) => (
                      <li key={child.id}>
                        <a
                          href={`#${child.id}`}
                          className={cn(
                            "block -ml-px border-l py-1 pl-8 text-xs leading-relaxed transition-colors",
                            activeId === child.id
                              ? "border-foreground text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {child.label}
                        </a>
                      </li>
                    ))}
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
