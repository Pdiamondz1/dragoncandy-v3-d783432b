import type { ReactNode } from "react";

interface EyebrowProps {
  children: ReactNode;
  /** Color the label, e.g. `text-landing-pink` — the square marker inherits via currentColor. */
  className?: string;
}

/**
 * A small pixel-font (Silkscreen) label used above section headings across the landing
 * ("HUMAN-DRIVEN · AI-ASSISTED", "FOR BUSINESS OWNERS", ...). Uppercase, wide-tracked, with a
 * leading `currentColor` square marker — mirrors `.eyebrow`/`.eyebrow::before` in the mockup.
 */
export function Eyebrow({ children, className = "" }: EyebrowProps) {
  return (
    <span
      className={`font-pixel text-[11px] tracking-[0.14em] uppercase inline-flex items-center gap-2 ${className}`}
    >
      <span className="h-2 w-2 bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}
