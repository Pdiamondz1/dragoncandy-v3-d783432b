import { motion, useReducedMotion, AnimatePresence } from "@/lib/motion";
import type { ReactNode } from "react";

interface OrgSwitcherDropdownProps {
  isOpen: boolean;
  children: ReactNode;
}

export function OrgSwitcherDropdown({ isOpen, children }: OrgSwitcherDropdownProps) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SwitcherPillTransitionProps {
  label: string;
  className?: string;
}

export function SwitcherPillTransition({ label, className }: SwitcherPillTransitionProps) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={label}
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={className}
      >
        {label}
      </motion.span>
    </AnimatePresence>
  );
}
