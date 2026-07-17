import { cn } from "@/lib/utils";

/** Ambient teal/pink glow blobs for dark-luxe surfaces. Non-interactive. */
export function GlowBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-dc-teal/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-dc-pink-accent/15 blur-3xl" />
    </div>
  );
}
