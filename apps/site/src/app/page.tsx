import { FadeIn } from "@/components/fade-in";
import { MobileTableOfContents } from "@/components/mobile-table-of-contents";
import { SectionDivider } from "@/components/section-divider";
import { Adapters } from "@/components/sections/adapters";
import { AiTools } from "@/components/sections/ai-tools";
import { ApiReference } from "@/components/sections/api-reference";
import { CapabilityMatrix } from "@/components/sections/capability-matrix";
import { Demo } from "@/components/sections/demo";
import { Errors } from "@/components/sections/errors";
import { EscapeHatch } from "@/components/sections/escape-hatch";
import { Footer } from "@/components/sections/footer";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";
import { Installation } from "@/components/sections/installation";
import { QuickStart } from "@/components/sections/quick-start";
import { SandboxType } from "@/components/sections/sandbox-type";
import { Verification } from "@/components/sections/verification";
import { Why } from "@/components/sections/why";
import { TableOfContents } from "@/components/table-of-contents";

export default function Home() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-background">
      <div className="mx-auto w-full max-w-7xl flex-1 lg:grid lg:grid-cols-[1fr_52rem_1fr]">
        <div aria-hidden className="hidden lg:block" />
        <main className="mx-auto w-full max-w-3xl border-x border-dotted px-4 sm:px-10 pt-8 pb-8">
          <Header />
          <Hero />
          <FadeIn className="lg:hidden">
            <MobileTableOfContents />
          </FadeIn>
          <FadeIn>
            <Demo />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <Why />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <Installation />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <QuickStart />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <Adapters />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <ApiReference />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <SandboxType />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <Errors />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <EscapeHatch />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <AiTools />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <CapabilityMatrix />
          </FadeIn>
          <SectionDivider />
          <FadeIn>
            <Verification />
          </FadeIn>
          <FadeIn>
            <Footer />
          </FadeIn>
        </main>
        <aside className="hidden lg:block pr-8 pt-44">
          <div className="sticky top-8">
            <TableOfContents />
          </div>
        </aside>
      </div>
    </div>
  );
}
