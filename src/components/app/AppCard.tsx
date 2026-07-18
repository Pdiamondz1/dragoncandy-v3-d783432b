import { cn } from "@/lib/utils";
const VARIANT = {
  default: "rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm",
  emphasis: "rounded-2xl border-2 border-dc-teal bg-white shadow-dc-sm",
  inset: "rounded-xl border border-dc-teal/10 bg-dc-teal/[0.04]",
} as const;
const PAD = { "5": "p-5", "6": "p-6" } as const;
/** Canonical light-app content card. NOT the shadcn ui/card (that's shared with dark surfaces). */
export function AppCard({
  children, variant = "default", pad = "5", className, ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof VARIANT; pad?: keyof typeof PAD }) {
  return <div className={cn(VARIANT[variant], PAD[pad], className)} {...props}>{children}</div>;
}
