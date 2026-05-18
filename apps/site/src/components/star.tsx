import type { SVGProps } from "react";

export const Star = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    fill="none"
    aria-hidden="true"
    shapeRendering="geometricPrecision"
    {...props}
  >
    <path
      d="M24 4 L26 22 L44 24 L26 26 L24 44 L22 26 L4 24 L22 22 Z"
      fill="currentColor"
    />
  </svg>
);
