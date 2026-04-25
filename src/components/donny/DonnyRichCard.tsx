import { Button } from '@/components/ui/button';
import type { DonnyRichCard as RichCardType } from '@/types/donny';
import { useNavigate } from 'react-router-dom';
import { useDonnyContext } from '@/contexts/DonnyProvider';

interface DonnyRichCardProps {
  card: RichCardType;
}

export function DonnyRichCard({ card }: DonnyRichCardProps) {
  const navigate = useNavigate();
  const { sendMessage } = useDonnyContext();

  switch (card.type) {
    case 'creator_profile':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="flex gap-2 items-center">
            <div className="w-10 h-10 rounded-full bg-gray-200 ring-2 ring-teal-400 overflow-hidden flex-shrink-0">
              {card.data.avatar_url ? (
                <img src={card.data.avatar_url} alt={card.data.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                  {card.data.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-[#111]">{card.data.name}</div>
              <div className="text-xs text-[#555]">{(card.data.platforms ?? []).join(' · ')}{card.data.niche ? ` · ${card.data.niche}` : ''}</div>
              <div className="text-xs text-[#EC4899]">⭐ {card.data.rating} · {card.data.project_count} projects</div>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              className="flex-1 rounded-full bg-[#4DD9C0] hover:bg-[#3cc5ad] text-white text-xs"
              onClick={() => navigate(`/creator/${card.data.profile_slug || card.data.id}`)}
            >
              View Portfolio
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-full border-[#EC4899] text-[#EC4899] text-xs"
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
          <div className="text-sm font-bold text-[#111]">{card.data.title}</div>
          <div className="text-xs text-[#555] mt-1">
            {card.data.platform} · ${card.data.budget_min}–${card.data.budget_max}
          </div>
          <div className="text-xs text-[#4DD9C0] mt-1">
            {card.data.application_count} applications · {card.data.status}
          </div>
          <Button
            size="sm"
            className="w-full rounded-full bg-[#4DD9C0] hover:bg-[#3cc5ad] text-white text-xs mt-2"
            onClick={() => navigate(`/dashboard/business/campaigns/${card.data.id}`)}
          >
            View Campaign
          </Button>
        </div>
      );

    case 'payment_confirmation':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-[#FACC15] mt-1.5">
          <div className="text-sm font-bold text-[#111]">Payment Ready</div>
          <div className="text-xs text-[#555] mt-1">
            ${card.data.amount} to {card.data.recipient_name}
          </div>
          <div className="text-xs text-[#555]">{card.data.description}</div>
          <Button
            size="sm"
            className="w-full rounded-full bg-[#4DD9C0] hover:bg-[#3cc5ad] text-white text-xs mt-2"
            onClick={() => navigate(card.data.payment_url)}
          >
            Confirm Payment
          </Button>
        </div>
      );

    case 'application_summary':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="text-sm font-bold text-[#111]">{card.data.campaign_title}</div>
          <div className="text-xs text-[#555] mt-1">From: {card.data.creator_name}</div>
          <div className="text-xs text-[#555] italic mt-1">"{card.data.pitch}"</div>
          <div className="text-xs text-[#4DD9C0] mt-1">Proposed: ${card.data.proposed_rate}</div>
        </div>
      );

    case 'onboarding_step':
      return null; // Onboarding options rendered as quick chips, not cards

    default:
      return null;
  }
}
