import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  label: string;
  totalCents: number;
  count: number;
  href: string;
}

export function DragonShareStatTile({ label, totalCents, count, href }: Props) {
  return (
    <Link to={href} className="block rounded-2xl border border-dc-teal/20 bg-dc-teal/5 p-4 hover:bg-dc-teal/10 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-dc-teal" />
        <span className="text-xs font-medium text-dc-teal">{label}</span>
      </div>
      {count > 0 ? (
        <>
          <p className="text-xl font-bold">${(totalCents / 100).toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">{count} boost{count !== 1 ? 's' : ''} this month</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Post about brands you love and earn when they boost your content</p>
      )}
    </Link>
  );
}
