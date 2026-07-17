
const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  published: 'bg-emerald-500/15 text-emerald-300',
  'in progress': 'bg-emerald-500/15 text-emerald-300',
  accepted: 'bg-emerald-500/15 text-emerald-300',
  pending: 'bg-amber-500/15 text-amber-300',
  review: 'bg-amber-500/15 text-amber-300',
  reviewing: 'bg-amber-500/15 text-amber-300',
  completed: 'bg-dc-teal/10 text-dc-teal',
  draft: 'bg-blue-500/15 text-blue-300',
  cancelled: 'bg-red-500/15 text-red-300',
  rejected: 'bg-red-500/15 text-red-300',
};

interface ActivityFeedCardProps {
  title: string;
  subtitle: string;
  status: string;
  onClick?: () => void;
}

/** Borderless list row for the calm dashboard activity sections. */
export function ActivityFeedCard({ title, subtitle, status, onClick }: ActivityFeedCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  const statusClass = statusStyles[status.toLowerCase()] ?? 'bg-dc-teal/10 text-dc-teal';

  return (
    <Wrapper
      onClick={onClick}
      className={`w-full py-3 text-left border-b border-dc-teal/10 last:border-b-0 ${
        onClick ? 'hover:bg-dc-teal/[0.04] transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{title}</div>
          <div className="text-xs text-white/60 mt-0.5">{subtitle}</div>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${statusClass}`}
        >
          {status}
        </span>
      </div>
    </Wrapper>
  );
}
