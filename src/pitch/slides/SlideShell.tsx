import type { ReactNode } from "react";

export interface SlideProps {
  index: number;
  total: number;
}

type Variant = "light" | "dark" | "gradient";

interface SlideShellProps extends SlideProps {
  variant?: Variant;
  eyebrow?: string;
  children: ReactNode;
  /** Hide the footer (used on the cover). */
  bare?: boolean;
  className?: string;
}

const surface: Record<Variant, string> = {
  light: "bg-white text-dc-text",
  dark: "bg-dc-dark text-white",
  gradient: "bg-dc-dark text-white",
};

/**
 * Fixed 1280x720 brand canvas shared by every slide. Provides the surface,
 * decorative brand accents, an optional eyebrow, the logo, and a footer with
 * the confidential mark + page number.
 */
export function SlideShell({
  index,
  total,
  variant = "light",
  eyebrow,
  children,
  bare = false,
  className = "",
}: SlideShellProps) {
  const isDark = variant !== "light";

  return (
    <div
      className={`flex h-full w-full flex-col font-sans ${surface[variant]} ${className}`}
      style={{ width: 1280, height: 720 }}
    >
      {/* Decorative brand accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* top gradient rail */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-dc-teal via-dc-teal-dark to-dc-pink-accent" />
        {variant === "gradient" && (
          <>
            <div className="absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-dc-teal/20 blur-3xl" />
            <div className="absolute -bottom-44 -left-40 h-[26rem] w-[26rem] rounded-full bg-dc-pink-accent/20 blur-3xl" />
          </>
        )}
        {variant === "dark" && (
          <div className="absolute -right-32 top-24 h-80 w-80 rounded-full bg-dc-teal/10 blur-3xl" />
        )}
      </div>

      {/* Body */}
      <div className={`relative flex flex-1 flex-col ${bare ? "" : "px-20 pt-16 pb-14"}`}>
        {eyebrow && (
          <div className="mb-5 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-teal" />
            <span className="text-sm font-bold uppercase tracking-[0.32em] text-dc-teal">
              {eyebrow}
            </span>
          </div>
        )}
        {children}
      </div>

      {/* Footer */}
      {!bare && (
        <div
          className={`relative flex items-center justify-between px-20 pb-7 text-[13px] ${
            isDark ? "text-white/55" : "text-dc-text-muted"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <img src="/logo.webp" alt="DragonCandy" className="h-5 w-auto" />
            <span className="font-semibold tracking-wide">Confidential</span>
          </div>
          <span className="font-semibold tabular-nums">
            {String(index + 1).padStart(2, "0")}
            <span className={isDark ? "text-white/30" : "text-dc-text-muted/50"}>
              {" "}
              / {String(total).padStart(2, "0")}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Big section/stat number in the brand teal→pink gradient. */
export function GradientText({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`bg-gradient-to-r from-dc-teal-btn via-dc-teal-dark to-dc-pink-accent bg-clip-text text-transparent ${className}`}
    >
      {children}
    </span>
  );
}
