import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  label: string;
  totalCents: number;
  count: number;
  href: string;
}

export function DragonShareStatTile({ label, totalCents, count, href }: Props) {
  if (count === 0) return null;

  return (
    <Link to={href} className="block rounded-2xl border border-teal-200 bg-teal-50/50 p-4 hover:bg-teal-50 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-teal-500" />
        <span className="text-xs font-medium text-teal-700">{label}</span>
      </div>
      <p className="text-xl font-bold">${(totalCents / 100).toFixed(0)}</p>
      <p className="text-xs text-muted-foreground">{count} boost{count !== 1 ? 's' : ''} this month</p>
    </Link>
  );
}
