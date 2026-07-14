import { motion, useReducedMotion } from "@/lib/motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  locationKey: string;
}

export function PageTransition({ children, locationKey }: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    // Opacity-only on purpose: any transform here (even a settled translateY) makes this
    // wrapper the containing block for every position:fixed descendant — bottom navs,
    // Donny's mobile sheet, sticky CTAs — anchoring them to the page instead of the
    // viewport (the PR #224 trap). Do not add x/y/scale to this animation.
    <motion.div
      key={locationKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="page-transition-fallback"
    >
      {children}
    </motion.div>
  );
}
