import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink } from 'lucide-react';

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
  const statusColors: Record<string, string> = {
    published: 'bg-green-100 text-green-700',
    active: 'bg-blue-100 text-blue-700',
    draft: 'bg-gray-100 text-gray-600',
    completed: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 flex items-center gap-2">
      <span className="text-lg">{emoji}</span>
      <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{campaign.title}</span>
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[campaign.status] || 'bg-gray-100 text-gray-600'}`}>
        {campaign.status}
      </span>
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
