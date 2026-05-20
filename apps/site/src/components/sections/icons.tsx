import Image from "next/image";
import type { ComponentProps } from "react";

type Props = Omit<
  ComponentProps<typeof Image>,
  "src" | "alt" | "width" | "height"
>;

const make = (slug: string, name: string) => {
  const Icon = (props: Props) => (
    <Image
      alt={name}
      height={48}
      src={`/providers/${slug}.svg`}
      unoptimized
      width={48}
      {...props}
    />
  );
  Icon.displayName = name;
  return Icon;
};

export const Local = make("local", "Local");
export const Blaxel = make("blaxel", "Blaxel");
export const Cloudflare = make("cloudflare", "Cloudflare");
export const CodeSandbox = make("codesandbox", "CodeSandbox");
export const Daytona = make("daytona", "Daytona");
export const E2B = make("e2b", "E2B");
export const Modal = make("modal", "Modal");
export const Vercel = make("vercel", "Vercel");
