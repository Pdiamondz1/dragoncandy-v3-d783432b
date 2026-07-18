import { cn } from "@/lib/utils";
/** De-grayed filter/segment chip. off = white + teal-tint border; on = teal fill. */
export function AppChip({
  children, active = false, className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button"
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors",
        active ? "bg-dc-teal/10 border-dc-teal text-dc-teal-btn" : "bg-white border-dc-teal/20 text-dc-text-muted hover:bg-dc-teal/5",
        className,
      )}
      {...props}
    >{children}</button>
  );
}
