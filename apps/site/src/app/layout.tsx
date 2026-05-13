import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import type { ReactNode } from "react";

import { MotionProvider } from "@/components/motion-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "localhost:3000";
const baseUrl = `${protocol}://${origin}`;

const title =
  "Sandbox SDK: one API for E2B, Daytona, Vercel & Cloudflare sandboxes";
const description =
  "A unified TypeScript SDK for agent execution environments. One small, honest API for files, commands, ports, and snapshots, with a typed escape hatch for the native client.";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description,
  metadataBase: new URL(baseUrl),
  openGraph: {
    description,
    locale: "en_US",
    siteName: "Sandbox SDK",
    title,
    type: "website",
    url: "/",
  },
  title,
  twitter: {
    card: "summary_large_image",
    description,
    title,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  codeRepository: "https://github.com/dancer/sandbox",
  description,
  license: "https://opensource.org/licenses/MIT",
  name: "Sandbox SDK",
  programmingLanguage: "TypeScript",
  url: baseUrl,
};

interface RootLayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => (
  <html
    lang="en"
    className={cn(
      "scroll-smooth touch-manipulation font-sans antialiased",
      geistSans.variable,
      geistMono.variable
    )}
  >
    <body className="flex min-h-full flex-col" suppressHydrationWarning>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TooltipProvider>
        <MotionProvider>{children}</MotionProvider>
      </TooltipProvider>
    </body>
  </html>
);

export default RootLayout;
