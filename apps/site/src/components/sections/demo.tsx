import { CodeTabs } from "@/components/code-tabs";

const ADAPTERS = [
  {
    config: `local()`,
    id: "local",
    import: `import { local } from "@sandbox-sdk/local";`,
    label: "Local",
  },
  {
    config: `cloudflare({ binding: env.SANDBOX })`,
    id: "cloudflare",
    import: `import { cloudflare } from "@sandbox-sdk/cloudflare";`,
    label: "Cloudflare",
  },
  {
    config: `daytona({ image: "ubuntu:22.04" })`,
    id: "daytona",
    import: `import { daytona } from "@sandbox-sdk/daytona";`,
    label: "Daytona",
  },
  {
    config: `e2b({ template: "base" })`,
    id: "e2b",
    import: `import { e2b } from "@sandbox-sdk/e2b";`,
    label: "E2B",
  },
  {
    config: `vercel({ runtime: "node22" })`,
    id: "vercel",
    import: `import { vercel } from "@sandbox-sdk/vercel";`,
    label: "Vercel",
  },
] as const;

const buildCode = (adapter: (typeof ADAPTERS)[number]) =>
  `import { create } from "@sandbox-sdk/core";
${adapter.import}

const sandbox = await create({
  adapter: ${adapter.config},
});

await sandbox.files.write("main.ts", "console.log('hello')");
const result = await sandbox.process.exec("bun", ["main.ts"]);

await sandbox.stop();`;

const TABS = ADAPTERS.map((adapter) => ({
  code: buildCode(adapter),
  id: adapter.id,
  label: adapter.label,
  lang: "tsx" as const,
}));

export const Demo = () => <CodeTabs tabs={TABS} />;
