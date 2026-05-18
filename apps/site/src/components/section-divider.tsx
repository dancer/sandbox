import { Star } from "./star";

export const SectionDivider = () => (
  <div
    aria-hidden="true"
    className="my-6 flex items-center gap-4 text-foreground/15"
  >
    <span className="h-px flex-1 bg-foreground/10" />
    <Star className="size-2.5" />
    <span className="size-1 rounded-full bg-foreground/15" />
    <Star className="size-2.5" />
    <span className="h-px flex-1 bg-foreground/10" />
  </div>
);
