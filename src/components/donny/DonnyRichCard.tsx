import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DonnyRichCard as RichCardType } from '@/types/donny';
import { useNavigate } from 'react-router-dom';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
import { SocialDraftCard } from './SocialDraftCard';

interface DonnyRichCardProps {
  card: RichCardType;
}

export function DonnyRichCard({ card }: DonnyRichCardProps) {
  const navigate = useNavigate();
  const { sendMessage } = useDonnyContext();
  const avatarPath = card.type === 'creator_profile' ? card.data.avatar_url : null;
  const resolvedAvatarUrl = useResolvedAvatarUrl(avatarPath);
  const [avatarError, setAvatarError] = useState(false);

  switch (card.type) {
    case 'creator_profile':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="flex gap-2 items-center">
            <div className="w-10 h-10 rounded-full bg-gray-200 ring-2 ring-teal-400 overflow-hidden flex-shrink-0">
              {resolvedAvatarUrl && !avatarError ? (
                <img src={resolvedAvatarUrl} alt={card.data.name} className="w-full h-full object-cover" loading="lazy" onError={() => setAvatarError(true)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                  {card.data.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-dc-text">{card.data.name}</div>
              <div className="text-xs text-dc-text-muted">{(card.data.platforms ?? []).join(' · ')}{card.data.niche ? ` · ${card.data.niche}` : ''}</div>
              <div className="text-xs text-dc-pink-accent">⭐ {card.data.rating} · {card.data.project_count} projects</div>
              {typeof card.data.distance_miles === 'number' && (
                <div className="text-xs text-dc-text-muted">
                  {card.data.distance_miles < 1 ? 'Nearby' : `${Math.round(card.data.distance_miles)} mi away`}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              className="flex-1 rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white text-xs"
              onClick={() => navigate(`/creator/${card.data.profile_slug || card.data.id}`)}
            >
              View Portfolio
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-full border-dc-pink-accent text-dc-pink-accent text-xs"
              onClick={() => sendMessage(`Invite ${card.data.name} to my campaign`)}
            >
              Invite
            </Button>
          </div>
        </div>
      );

    case 'campaign_summary':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="text-sm font-bold text-dc-text">{card.data.title}</div>
          <div className="text-xs text-dc-text-muted mt-1">
            {card.data.platform} · ${card.data.fixed_price || 0}
          </div>
          <div className="text-xs text-dc-teal mt-1">
            {card.data.application_count} applications · {card.data.status}
          </div>
          <Button
            size="sm"
            className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white text-xs mt-2"
            onClick={() => navigate(`/dashboard/business/campaigns/${card.data.id}`)}
          >
            View Campaign
          </Button>
        </div>
      );

    case 'payment_confirmation':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-dc-yellow mt-1.5">
          <div className="text-sm font-bold text-dc-text">Payment Ready</div>
          <div className="text-xs text-dc-text-muted mt-1">
            ${card.data.amount} to {card.data.recipient_name}
          </div>
          <div className="text-xs text-dc-text-muted">{card.data.description}</div>
          <Button
            size="sm"
            className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white text-xs mt-2"
            onClick={() => navigate(card.data.payment_url)}
          >
            Confirm Payment
          </Button>
        </div>
      );

    case 'application_summary':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="text-sm font-bold text-dc-text">{card.data.campaign_title}</div>
          <div className="text-xs text-dc-text-muted mt-1">From: {card.data.creator_name}</div>
          <div className="text-xs text-dc-text-muted italic mt-1">"{card.data.pitch}"</div>
          <div className="text-xs text-dc-teal mt-1">Proposed: ${card.data.proposed_rate}</div>
        </div>
      );

    case 'onboarding_step':
      return null; // Onboarding options rendered as quick chips, not cards

    case 'social_post_draft':
      return <SocialDraftCard data={card.data} />;

    default:
      return null;
  }
}
