// src/components/dashboard/ActiveCampaignsFeed.tsx
import { useNavigate } from 'react-router-dom';
import { useBusinessActiveCampaigns, type ActiveCampaignItem } from '@/hooks/useBusinessActiveCampaigns';
import { Loader2 } from 'lucide-react';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  published: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  completed: 'bg-gray-100 text-gray-600',
  draft: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-red-50 text-red-600',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActiveCampaignsFeed() {
  const { data: campaigns, isLoading, isError } = useBusinessActiveCampaigns();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-900">Active Campaigns</h3>
        <div className="bg-white rounded-xl p-6 shadow-sm flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
        </div>
      </div>
    );
  }

  if (isError) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-gray-900">Active Campaigns</h3>

      {!campaigns || campaigns.length === 0 ? (
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-sm text-gray-500">No active campaigns yet.</p>
          <button
            onClick={() => navigate('/dashboard/business/campaigns/create')}
            className="text-sm font-semibold text-dc-teal hover:underline mt-1"
          >
            Let Donny help you create one
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">{campaign.title}</div>
                <div className="text-xs text-gray-500">
                  {campaign.creatorName ? `@${campaign.creatorName}` : 'Unassigned'} · Due {formatDate(campaign.deadline)}
                </div>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-3 flex-shrink-0 capitalize ${
                  statusStyles[campaign.status] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {campaign.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
