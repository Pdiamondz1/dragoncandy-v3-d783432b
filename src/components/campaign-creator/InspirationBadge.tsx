import type { InspirationRef } from '@/types/firstRun';

interface InspirationBadgeProps {
  refs: InspirationRef[];
  onClear: () => void;
}

export function InspirationBadge({ refs, onClear }: InspirationBadgeProps) {
  if (!refs.length) return null;

  const label = refs.length === 1
    ? `${refs[0].content_label} • @${refs[0].creator_name}`
    : `${refs.length} inspiration picks`;

  return (
    <div className="bg-pink-50 border border-pink-300 rounded-xl px-3 py-2 flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-lg bg-pink-200 flex-shrink-0" />
      <div className="flex-1">
        <span className="text-xs font-semibold text-pink-500">Inspired by</span>
        <p className="text-xs text-gray-600">{label}</p>
      </div>
      <button onClick={onClear} className="text-gray-400 text-sm">✕</button>
    </div>
  );
}
