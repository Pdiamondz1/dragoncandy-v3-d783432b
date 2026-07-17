import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface HeroPrimaryActionProps {
  label: string;
  to: string;
  secondary?: { label: string; to: string };
}

/**
 * The ONE loud teal element on a calm dashboard. The secondary action is a
 * quiet pink text link so it never competes with the primary CTA.
 */
export function HeroPrimaryAction({ label, to, secondary }: HeroPrimaryActionProps) {
  return (
    <div className="flex flex-col items-stretch lg:items-end gap-3">
      <Button
        asChild
        variant="dc-teal-pill"
        className="h-12 lg:h-14 px-8 rounded-full text-base shadow-glow-teal w-full lg:w-auto"
      >
        <Link to={to}>{label}</Link>
      </Button>
      {secondary && (
        <Link
          to={secondary.to}
          className="text-sm font-semibold text-dc-pink-accent hover:underline text-center lg:text-right"
        >
          {secondary.label} →
        </Link>
      )}
    </div>
  );
}
