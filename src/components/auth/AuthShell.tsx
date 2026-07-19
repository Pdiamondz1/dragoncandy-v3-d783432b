import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Shared light wrapper for auth/onboarding surfaces — the landing's identity ("Human-driven.
 * AI-assisted.") softened for forms. Replaces the dark `bg-dc-dark` root + `GlowBackdrop` used by
 * the old dark-luxe auth screens: white base, Instrument Sans body, a soft grape/pink/mint glow
 * echoing the dark original but low-opacity on white. Deliberately does NOT touch `<html>`/`<body>`
 * (no `.dark`, no `useDarkHtml`) — the app default `ThemeProvider defaultTheme="light"` already
 * keeps these surfaces light.
 */
export function AuthShell({ children, className }: AuthShellProps) {
  // `isolate` makes the root its own stacking context so the `-z-10` glow paints behind the
  // content WITHOUT wrapping children in a `relative z-10` slot. That wrapper would otherwise
  // become a shrink-wrapping flex item when a caller centers via `flex items-center justify-center`
  // (invite/restore/onboarding), collapsing their `w-full max-w-*` cards to content width.
  // Rendering children directly keeps them direct flex/block children — original layout preserved.
  return (
    <div
      className={cn(
        "min-h-screen w-full overflow-x-hidden bg-white text-landing-ink font-instrument relative isolate",
        className
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-landing-pink/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-landing-mint/15 blur-3xl" />
      </div>
      {children}
    </div>
  );
}
