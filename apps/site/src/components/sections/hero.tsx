"use client";

import { motion } from "motion/react";

import { InstallPill } from "@/components/install-pill";
import { Star } from "@/components/star";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import * as icons from "./icons";

const EASE = [0.16, 1, 0.3, 1] as const;

const iconMeta: Record<keyof typeof icons, { label: string; href?: string }> = {
  Blaxel: { href: "https://blaxel.ai", label: "Blaxel" },
  Cloudflare: { href: "https://sandbox.cloudflare.com", label: "Cloudflare" },
  CodeSandbox: { href: "https://codesandbox.io/sdk", label: "CodeSandbox" },
  Daytona: { href: "https://www.daytona.io", label: "Daytona" },
  E2B: { href: "https://e2b.dev", label: "E2B" },
  Local: { label: "Local" },
  Modal: { href: "https://modal.com/sandboxes", label: "Modal" },
  Vercel: { href: "https://vercel.com/sandbox", label: "Vercel" },
};

const iconOrder = [
  "Local",
  "Blaxel",
  "Cloudflare",
  "CodeSandbox",
  "Daytona",
  "E2B",
  "Modal",
  "Vercel",
] as const satisfies (keyof typeof icons)[];

const iconList = iconOrder.map((name) => [name, icons[name]] as const);

const stats = [
  { label: "providers", value: "8" },
  { label: "capabilities", value: "18" },
  { label: "license", value: "MIT" },
] as const;

export const Hero = () => (
  <section className="hero mt-16">
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
        Sandbox SDK
      </h1>
    </motion.div>
    <motion.p
      className="text-muted-foreground text-balance leading-relaxed"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.6, ease: EASE }}
    >
      One TypeScript API for agent sandboxes. Files, commands, ports, snapshots,
      and a typed escape hatch, across every major provider.
    </motion.p>

    <motion.dl
      className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.6, ease: EASE }}
    >
      {stats.map((stat, index) => (
        <div className="flex items-center gap-2" key={stat.label}>
          {index > 0 && (
            <Star aria-hidden="true" className="size-2 text-foreground/25" />
          )}
          <div className="flex items-baseline gap-1.5">
            <dt className="text-foreground tabular-nums">{stat.value}</dt>
            <dd className="text-muted-foreground">{stat.label}</dd>
          </div>
        </div>
      ))}
    </motion.dl>

    <motion.div
      className="mt-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.24, duration: 0.55, ease: EASE }}
    >
      <InstallPill command="bun add @sandbox-sdk/core @sandbox-sdk/local" />
    </motion.div>

    <div className="mt-2 flex items-center -space-x-2 sm:-space-x-1">
      {iconList.map(([name, Icon], index) => {
        const restRotate = index % 2 === 0 ? 3 : -3;
        const { label, href } = iconMeta[name];
        const mark = (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              delay: 0.05 * index,
              duration: 0.5,
              ease: EASE,
            }}
          >
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: restRotate }}
              transition={{ duration: 0.3, ease: EASE }}
              whileHover={{ rotate: restRotate, scale: 1.05, y: -4 }}
            >
              <Icon
                className={cn("size-6 rounded-sm ring-2 ring-background block")}
              />
            </motion.div>
          </motion.div>
        );
        return (
          <Tooltip key={name}>
            <TooltipTrigger asChild>
              {href ? (
                <a
                  aria-label={label}
                  href={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {mark}
                </a>
              ) : (
                <span aria-label={label}>{mark}</span>
              )}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  </section>
);
