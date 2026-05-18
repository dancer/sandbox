import { CodeTabs } from "@/components/code-tabs";
import { Heading } from "@/components/heading";

const TABS = [
  {
    code: "bun add @sandbox-sdk/core @sandbox-sdk/local",
    id: "bun",
    label: "bun",
    lang: "bash",
  },
  {
    code: "pnpm add @sandbox-sdk/core @sandbox-sdk/local",
    id: "pnpm",
    label: "pnpm",
    lang: "bash",
  },
  {
    code: "npm install @sandbox-sdk/core @sandbox-sdk/local",
    id: "npm",
    label: "npm",
    lang: "bash",
  },
  {
    code: "yarn add @sandbox-sdk/core @sandbox-sdk/local",
    id: "yarn",
    label: "yarn",
    lang: "bash",
  },
] as const;

export const Installation = () => (
  <section>
    <Heading as="h2" number={2}>Installation</Heading>
    <p>
      Install <code>@sandbox-sdk/core</code> together with the adapter you want
      to run against. Each provider ships as its own package, so apps only
      install what they use.
    </p>
    <CodeTabs tabs={TABS} />
  </section>
);
