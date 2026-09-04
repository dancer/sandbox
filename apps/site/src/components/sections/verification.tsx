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
bun run verify:cloudflare:bridge
bun run verify:e2b
bun run verify:daytona:snapshot-delete`;

export const Verification = () => (
  <section>
    <Heading as="h2" number={11}>
      Verification
    </Heading>
    <p>
      Every remote adapter has a live verification suite, not just mocks.
      Sanitized fixtures give fast contract replay in <code>bun test</code>, and
      the <code>verify:*</code> scripts run the same suite against real
      sandboxes as the source of truth for provider behavior. The deterministic
      suite never loads <code>.env.local</code>, while live scripts load it
      explicitly and print readiness without leaking secret values. A fixture
      replay or skipped live test does not prove current provider compatibility.
      Confirm credentials and deployed verifier versions before relying on a
      live result.
    </p>
    <CodeBlock code={VERIFY_EXAMPLE} lang="bash" />
  </section>
);
