import { Star } from "@/components/star";

const sdkLinks = [
  { href: "https://www.npmjs.com/package/@sandbox-sdk/core", label: "core" },
  { href: "https://www.npmjs.com/package/@sandbox-sdk/local", label: "local" },
  { href: "https://www.npmjs.com/package/@sandbox-sdk/ai", label: "ai" },
];

const providerLinks = [
  { href: "https://blaxel.ai", label: "blaxel" },
  { href: "https://sandbox.cloudflare.com", label: "cloudflare" },
  { href: "https://codesandbox.io/sdk", label: "codesandbox" },
  { href: "https://www.daytona.io", label: "daytona" },
  { href: "https://e2b.dev", label: "e2b" },
  { href: "https://modal.com/sandboxes", label: "modal" },
  { href: "https://vercel.com/sandbox", label: "vercel" },
];

const projectLinks = [
  { href: "https://github.com/dancer/sandbox", label: "GitHub" },
  {
    href: "https://github.com/dancer/sandbox/issues",
    label: "Issues",
  },
  {
    href: "https://github.com/dancer/sandbox/releases",
    label: "Releases",
  },
];

const Column = ({
  heading,
  links,
}: {
  heading: string;
  links: { href: string; label: string }[];
}) => (
  <div className="flex flex-col gap-2.5">
    <h4 className="font-mono! text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
      {heading}
    </h4>
    <ul className="flex list-none flex-col gap-1.5 pl-0">
      {links.map((link) => (
        <li className="text-xs" key={link.label}>
          <a
            className="text-muted-foreground transition-colors hover:text-foreground"
            href={link.href}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  </div>
);

export const Footer = () => (
  <footer className="mt-12 flex flex-col gap-10 border-t border-foreground/10 pt-10 text-xs">
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
      <Column heading="Packages" links={sdkLinks} />
      <Column heading="Providers" links={providerLinks} />
      <Column heading="Project" links={projectLinks} />
    </div>
    <div className="flex items-center justify-between gap-4 border-t border-foreground/10 pt-6 text-muted-foreground">
      <div className="flex items-center gap-2">
        <Star className="size-3 text-foreground/30" />
        <span>MIT License</span>
      </div>
      <a
        className="font-mono underline-offset-2 transition-colors hover:text-foreground hover:underline"
        href="https://sandbox-sdk.sh"
        rel="noreferrer"
      >
        sandbox-sdk.sh
      </a>
    </div>
  </footer>
);
