import { type ReactNode } from "react";
import { motion as m, useReducedMotion } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger offset in seconds for sequential reveals. */
  delay?: number;
}

/**
 * The single scroll-reveal primitive for the landing page. Fades + lifts content
 * into view once, when ~20% visible. Collapses to a static wrapper under
 * prefers-reduced-motion so the page is fully usable without animation.
 * Uses `m.*` (not `motion.*`) because LazyMotion runs in `strict` mode (App.tsx).
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
    >
      {children}
    </m.div>
  );
}
