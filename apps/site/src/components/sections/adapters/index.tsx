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
      stay out of your node_modules. Adapters auto-load credentials from the
      standard environment variables for that provider; pass options explicitly
      to override. If an adapter is constructed without enough info to
      authenticate, it throws at construction time naming the missing variable.
    </p>
    <p>
      The list below covers what ships today. More providers are planned; the
      capability matrix at the bottom of the page is the authoritative source
      for what's supported right now.
    </p>
    <Local />
    <E2B />
    <Daytona />
    <Vercel />
    <Cloudflare />
  </section>
);
