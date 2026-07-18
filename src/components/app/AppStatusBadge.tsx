import { cn } from "@/lib/utils";
const TONE = {
  teal: "bg-dc-teal/10 text-dc-teal-btn",
  pink: "bg-dc-pink-accent/10 text-dc-pink-accent",
  amber: "bg-amber-50 text-amber-700",
  neutral: "bg-dc-teal/5 text-dc-text-muted",
} as const;
/** Brand-tinted status badge — never gray. */
export function AppStatusBadge({
  children, tone = "neutral", className,
}: { children: React.ReactNode; tone?: keyof typeof TONE; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone], className)}>{children}</span>
  );
}
