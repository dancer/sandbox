import { Heading } from "@/components/heading";

import { Cloudflare } from "./cloudflare";
import { Daytona } from "./daytona";
import { E2B } from "./e2b";
import { Local } from "./local";
import { Vercel } from "./vercel";

export const Adapters = () => (
  <section>
    <Heading as="h2">Adapters</Heading>
    <p>
      Each adapter ships as its own package. Bring only what you use; the others
      stay out of your node_modules. Pass credentials and provider settings
      explicitly when you want deterministic behavior; otherwise the wrapped
      provider SDK can use its own defaults.
    </p>
    <p>
      The list below covers what ships today. More providers are planned; the
      capability matrix at the bottom of the page is the authoritative source
      for what's supported right now.
    </p>
    <Local />
    <Cloudflare />
    <Daytona />
    <E2B />
    <Vercel />
  </section>
);
