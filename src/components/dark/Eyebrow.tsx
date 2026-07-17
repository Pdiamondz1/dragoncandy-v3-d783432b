import { cn } from "@/lib/utils";

/** Section eyebrow: teal dot + uppercase micro-label, dark-luxe. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-dc-teal", className)}>
      <span className="h-2 w-2 rounded-full bg-dc-teal" />
      {children}
    </span>
  );
}
