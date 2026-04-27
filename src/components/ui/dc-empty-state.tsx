import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { type LucideIcon } from "lucide-react";

interface DCEmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  cta?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function DCEmptyState({
  icon: Icon,
  title,
  subtitle,
  cta,
  className,
}: DCEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-dc-teal/10 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-dc-teal" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      {subtitle && (
        <p className="text-sm text-gray-500 max-w-xs mb-6">{subtitle}</p>
      )}
      {cta && (
        <Button variant="dc-primary" asChild={!!cta.to} onClick={cta.onClick}>
          {cta.to ? <Link to={cta.to}>{cta.label}</Link> : cta.label}
        </Button>
      )}
    </div>
  );
}

interface DCErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function DCErrorState({
  message = "Something went wrong. Try again?",
  onRetry,
  className,
}: DCErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      {onRetry && (
        <Button variant="dc-outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
