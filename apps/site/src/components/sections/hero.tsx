"use client";

import { motion } from "motion/react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import * as icons from "./icons";

const EASE = [0.16, 1, 0.3, 1] as const;

const iconMeta: Record<keyof typeof icons, { label: string; href?: string }> = {
  Cloudflare: {
    href: "https://sandbox.cloudflare.com",
    label: "Cloudflare",
  },
  Daytona: { href: "https://www.daytona.io", label: "Daytona" },
  E2B: { href: "https://e2b.dev", label: "E2B" },
  Local: { label: "Local" },
  Vercel: { href: "https://vercel.com/sandbox", label: "Vercel" },
};

const iconOrder = [
  "Local",
  "Cloudflare",
  "Daytona",
  "E2B",
  "Vercel",
] as const satisfies (keyof typeof icons)[];

const iconList = iconOrder.map((name) => [name, icons[name]] as const);

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
      A unified TypeScript SDK for agent execution environments. One small,
      honest API for files, commands, ports, and snapshots, with a typed escape
      hatch for the native client.
    </motion.p>
    <div className="flex items-center -space-x-2 sm:-space-x-1">
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
