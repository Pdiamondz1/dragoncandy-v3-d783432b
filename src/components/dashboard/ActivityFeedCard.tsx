
const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  published: 'bg-emerald-100 text-emerald-700',
  'in progress': 'bg-emerald-100 text-emerald-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  review: 'bg-amber-100 text-amber-800',
  reviewing: 'bg-amber-100 text-amber-800',
  completed: 'bg-gray-100 text-gray-600',
  draft: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
  rejected: 'bg-red-100 text-red-600',
};

interface ActivityFeedCardProps {
  title: string;
  subtitle: string;
  status: string;
  onClick?: () => void;
  /** 'row' renders a borderless list row for the calm dashboard activity section */
  variant?: 'card' | 'row';
}

export function ActivityFeedCard({ title, subtitle, status, onClick, variant = 'card' }: ActivityFeedCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  const statusClass =
    statusStyles[status.toLowerCase()] ??
    (variant === 'row' ? 'bg-dc-teal/10 text-dc-teal-btn' : 'bg-gray-100 text-gray-600');

  const wrapperClass =
    variant === 'row'
      ? `w-full py-3 text-left border-b border-dc-teal/10 last:border-b-0 ${
          onClick ? 'hover:bg-dc-teal/[0.04] transition-colors cursor-pointer' : ''
        }`
      : `w-full border-2 border-dc-teal rounded-2xl p-4 bg-white text-left ${
          onClick ? 'hover:bg-gray-50 transition-colors cursor-pointer' : ''
        }`;

  return (
    <Wrapper onClick={onClick} className={wrapperClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-dc-dark truncate">{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
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
