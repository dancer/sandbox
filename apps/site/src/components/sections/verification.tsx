import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const VERIFY_EXAMPLE = `# check which provider credentials are present
bun run verify:env

bun run test

# run the full live suite across every provider
bun run verify:providers

# verify a single provider end to end
bun run verify:vercel
bun run verify:cloudflare
bun run verify:e2b`;

export const Verification = () => (
  <section>
    <Heading as="h2" number={11}>
      Verification
    </Heading>
    <p>
      Every adapter is verified against the live provider, not just mocked.
      Sanitized fixtures give fast contract replay in <code>bun test</code>, and
      the <code>verify:*</code> scripts run the same suite against real
      sandboxes as the source of truth for provider behavior. The deterministic
      suite never loads <code>.env.local</code>, while live scripts load it
      explicitly and print readiness without leaking secret values.
    </p>
    <CodeBlock code={VERIFY_EXAMPLE} lang="bash" />
  </section>
);
