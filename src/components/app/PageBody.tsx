import { cn } from "@/lib/utils";
const MAX = { "6xl": "max-w-6xl", "4xl": "max-w-4xl", full: "max-w-full" } as const;
/** Standard page body: max-width + section rhythm only. The DashboardLayout shell owns page padding. */
export function PageBody({
  children, maxWidth = "6xl", className,
}: { children: React.ReactNode; maxWidth?: keyof typeof MAX; className?: string }) {
  return <div className={cn("mx-auto w-full space-y-8", MAX[maxWidth], className)}>{children}</div>;
}
