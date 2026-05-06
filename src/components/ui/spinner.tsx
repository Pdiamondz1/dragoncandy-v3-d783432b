import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label = "Loading..." }: SpinnerProps) {
  return (
    <div role="status" aria-live="polite">
      <div
        className={cn(
          "animate-spin rounded-full border-b-2 border-dc-teal h-8 w-8",
          className
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
