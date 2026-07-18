import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink } from 'lucide-react';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';

interface CampaignConversationHeaderProps {
  campaignId: string;
}

export function CampaignConversationHeader({ campaignId }: CampaignConversationHeaderProps) {
  const navigate = useNavigate();

  const { data: campaign } = useQuery({
    queryKey: ['campaign-header', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, title, status, ai_analysis')
        .eq('id', campaignId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!campaignId,
  });

  if (!campaign) return null;

  const emoji = (campaign.ai_analysis as Record<string, unknown>)?.emoji as string || '📣';
  const statusTones: Record<string, 'teal' | 'pink' | 'amber' | 'neutral'> = {
    published: 'teal',
    active: 'teal',
    draft: 'neutral',
    completed: 'pink',
  };

  return (
    <div className="bg-white border-b border-dc-teal/15 px-4 py-2 flex items-center gap-2">
      <span className="text-lg">{emoji}</span>
      <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{campaign.title}</span>
      <AppStatusBadge tone={statusTones[campaign.status] || 'neutral'} className="text-[10px] px-2 py-0.5 capitalize">
        {campaign.status}
      </AppStatusBadge>
      <button
        onClick={() => navigate(`/dashboard/creator/campaigns/${campaign.id}`)}
        className="text-teal-500 hover:text-teal-600"
        aria-label="View campaign details"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
