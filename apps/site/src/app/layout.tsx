import type { Metadata, Viewport } from "next";
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

const baseUrl = "https://sandbox-sdk.sh";

const title =
  "Sandbox SDK: one API for Cloudflare, Daytona, E2B & Vercel sandboxes";
const description =
  "A unified TypeScript SDK for agent execution environments. One small, honest API for files, commands, ports, and snapshots, with a typed escape hatch for the native client.";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description,
  icons: {
    apple: "/apple-icon.png",
    icon: "/icon.svg",
  },
  metadataBase: new URL(baseUrl),
  openGraph: {
    description,
    images: [{ alt: "Sandbox SDK", height: 630, url: "/og.png", width: 1200 }],
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
    images: ["/og.png"],
    title,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
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
