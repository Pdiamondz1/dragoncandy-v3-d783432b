import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignDetailHeaderProps {
  campaign: Campaign;
  phase: 'applied' | 'active' | 'completed';
  stats?: { label: string; value: string; color?: string }[];
  applicationStatus?: string;
}

const phaseGradients: Record<string, string> = {
  applied: 'from-pink-200 to-pink-50',
  active: 'from-pink-200 to-pink-50',
  completed: 'from-green-100 to-green-50',
};

const phaseBadges: Record<string, { label: string; className: string }> = {
  applied: { label: '⏳ Pending', className: 'bg-yellow-50 text-yellow-800' },
  active: { label: 'Active', className: 'bg-teal-50 text-teal-800' },
  completed: { label: '✅ Completed', className: 'bg-green-50 text-green-800' },
};

export function CampaignDetailHeader({
  campaign,
  phase,
  stats,
  applicationStatus,
}: CampaignDetailHeaderProps) {
  const navigate = useNavigate();
  const badge =
    applicationStatus === 'counter_offered'
      ? { label: '💬 Counter Offer', className: 'bg-orange-50 text-orange-800' }
      : phaseBadges[phase];

  return (
    <div className={`bg-gradient-to-b ${phaseGradients[phase]} px-5 pt-4 pb-4`}>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => navigate('/dashboard/creator/my-campaigns')}
          className="text-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900 truncate">{campaign.title}</h1>
      </div>

      <div className="flex gap-1.5 mb-3">
        <Badge className={badge.className}>{badge.label}</Badge>
        {campaign.delivery_type && campaign.delivery_type !== 'standard' && (
          <Badge className="bg-teal-50 text-teal-800">
            ⚡ {campaign.delivery_type === 'dragonrush' ? 'DragonRush' : 'Expedited'}
          </Badge>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="flex gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <span className={`text-lg font-extrabold ${stat.color || 'text-gray-900'}`}>
                {stat.value}
              </span>
              <br />
              <span className="text-[10px] text-gray-500">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
