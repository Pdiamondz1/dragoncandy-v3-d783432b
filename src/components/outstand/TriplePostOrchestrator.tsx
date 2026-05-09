import React from 'react';
import { type TriplePostSession } from '@/hooks/outstand/useTriplePostState';

interface PartyStatusProps {
  session: TriplePostSession;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-dc-teal',
  posted: 'bg-green-500',
  skipped: 'bg-gray-300',
  'n/a': 'bg-transparent',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Prompted',
  posted: 'Posted',
  skipped: 'Skipped',
  'n/a': '',
};

export const CoordinationStatusPanel: React.FC<PartyStatusProps & {
  restaurantName?: string;
  creatorName?: string;
  brandName?: string;
  currentUserId?: string;
}> = ({ session, restaurantName, creatorName, brandName, currentUserId }) => {
  const parties = [
    { label: restaurantName ?? 'Restaurant', status: session.restaurant_status, userId: session.restaurant_id, color: 'text-dc-teal' },
    { label: creatorName ?? 'Creator', status: session.creator_status, userId: session.creator_id, color: 'text-pink-400' },
  ];

  if (session.brand_id && session.brand_status !== 'n/a') {
    parties.push({ label: brandName ?? 'Brand', status: session.brand_status, userId: session.brand_id, color: 'text-amber-500' });
  }

  const partyCount = parties.length;

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
      <p className="text-xs font-semibold text-green-800 mb-2">
        Coordinated Post — {partyCount} {partyCount === 1 ? 'Party' : 'Parties'}
      </p>
      <div className="flex flex-col gap-2">
        {parties.map((p) => (
          <div key={p.userId} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[p.status]}`} />
            <span className="text-xs text-gray-600 flex-1">{p.label}</span>
            {p.userId === currentUserId ? (
              <span className="text-[10px] text-gray-400 font-semibold">
                {p.status === 'pending' ? 'Awaiting your action' : STATUS_LABELS[p.status]}
              </span>
            ) : (
              <span className={`text-[10px] font-semibold ${p.color}`}>{STATUS_LABELS[p.status]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
