import { cn } from "@/lib/utils";

type SkeletonVariant = "card" | "list-row" | "avatar" | "text-block" | "button" | "stat";

interface DCSkeletonProps {
  variant: SkeletonVariant;
  className?: string;
  count?: number;
}

const variantClasses: Record<SkeletonVariant, string> = {
  card: "h-40 w-full rounded-2xl",
  "list-row": "h-16 w-full rounded-2xl",
  avatar: "h-12 w-12 rounded-full",
  "text-block": "h-4 w-3/4 rounded-md",
  button: "h-12 w-full rounded-full",
  stat: "h-24 w-full rounded-2xl",
};

export function DCSkeleton({ variant, className, count = 1 }: DCSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "animate-pulse bg-muted",
            variantClasses[variant],
            className
          )}
        />
      ))}
    </>
  );
}
