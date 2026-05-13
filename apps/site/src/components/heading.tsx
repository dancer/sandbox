import type { ReactNode } from "react";

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
  children: ReactNode;
}

export const Heading = ({ as: Tag, id, className, children }: HeadingProps) => {
  const slug = id ?? slugify(childrenToText(children));

  return (
    <Tag className={className} id={slug}>
      <a href={`#${slug}`}>{children}</a>
    </Tag>
  );
};
