import type { ReactNode } from "react";

import { Star } from "./star";

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

const childrenToText = (children: ReactNode): string => {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(childrenToText).join("");
  }
  return "";
};

interface HeadingProps {
  as: "h1" | "h2" | "h3" | "h4";
  id?: string;
  className?: string;
  number?: number;
  children: ReactNode;
}

export const Heading = ({
  as: Tag,
  id,
  className,
  number,
  children,
}: HeadingProps) => {
  const slug = id ?? slugify(childrenToText(children));

  if (Tag === "h2" && number !== undefined) {
    const formatted = String(number).padStart(2, "0");
    return (
      <h2 className={className} id={slug}>
        <a
          className="group/heading flex items-center gap-3 no-underline"
          href={`#${slug}`}
        >
          <Star className="size-3 shrink-0 text-foreground/40 transition-colors group-hover/heading:text-foreground/70" />
          <span className="font-mono text-xl font-light tabular-nums text-foreground/35 transition-colors group-hover/heading:text-foreground/60">
            {formatted}
          </span>
          <span aria-hidden="true" className="text-foreground/15">
            /
          </span>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            {children}
          </span>
        </a>
      </h2>
    );
  }

  return (
    <Tag className={className} id={slug}>
      <a href={`#${slug}`}>{children}</a>
    </Tag>
  );
};
