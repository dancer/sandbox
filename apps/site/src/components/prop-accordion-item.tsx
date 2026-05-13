import type { ReactNode } from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

export type PropStatus = "required" | "optional";

interface PropAccordionItemProps {
  value: string;
  name: ReactNode;
  status?: PropStatus;
  monospace?: boolean;
  children: ReactNode;
}

export const PropAccordionItem = ({
  value,
  name,
  status,
  monospace = true,
  children,
}: PropAccordionItemProps) => (
  <AccordionItem className="border-dotted" value={value}>
    <AccordionTrigger>
      {monospace ? (
        <span className="flex-1 font-mono text-sm">{name}</span>
      ) : (
        <span className="flex-1">{name}</span>
      )}
      {status && <Badge variant="secondary">{status}</Badge>}
    </AccordionTrigger>
    <AccordionContent>{children}</AccordionContent>
  </AccordionItem>
);
