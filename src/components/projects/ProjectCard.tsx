import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { ContentPreviewStrip } from '@/components/campaigns/ContentPreviewStrip';

interface ProjectCardProps {
  project: {
    id: string;
    campaign_id?: string;
    status: string;
    content_status?: string | null;
    content_started_at?: string | null;
    content_deadline?: string | null;
    campaigns: {
      title: string;
      delivery_type?: string;
      fixed_price?: number;
      budget_min?: number;
      budget_max?: number;
    };
  };
}

const TIER_STYLES: Record<string, { border: string; badge: string; label: string }> = {
  dragon_rush: { border: 'border-l-red-500', badge: 'bg-red-500 text-white', label: '🐉 DASH' },
  dragonrush: { border: 'border-l-red-500', badge: 'bg-red-500 text-white', label: '🐉 DASH' },
  expedited: { border: 'border-l-blue-500', badge: 'bg-blue-100 text-blue-700', label: '⚡ EXPRESS' },
  standard: { border: 'border-l-[#4DD9C0]', badge: 'bg-teal-100 text-teal-700', label: 'STANDARD' },
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Awaiting start',
  in_progress: 'In progress',
  submitted: 'Under review',
  approved: 'Completed',
  auto_approved: 'Completed',
  revision_requested: 'Revision needed',
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();

  const deliveryType = project.campaigns.delivery_type || 'standard';
  const tier = TIER_STYLES[deliveryType] || TIER_STYLES.standard;

  const isCompleted =
    project.content_status === 'approved' ||
    project.content_status === 'auto_approved' ||
    project.status === 'completed';

  const borderColor = isCompleted ? 'border-l-gray-300' : tier.border;
  const badgeStyle = isCompleted ? 'bg-gray-200 text-gray-500' : tier.badge;
  const badgeLabel = isCompleted ? 'DONE' : tier.label;

  const paymentAmount =
    project.campaigns.fixed_price ||
    ((project.campaigns.budget_min || 0) + (project.campaigns.budget_max || 0)) / 2;

  const statusText =
    STATUS_LABELS[project.content_status || ''] ||
    (project.status === 'completed' ? 'Completed' : 'Active');

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className={cn(
        'bg-white rounded-2xl p-4 border-l-4 cursor-pointer hover:shadow-md transition-shadow',
        borderColor,
        isCompleted && 'opacity-70'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', badgeStyle)}>
          {badgeLabel}
        </span>
        {paymentAmount > 0 && (
          <span className="text-sm font-bold text-gray-900">{formatCurrency(paymentAmount)}</span>
        )}
      </div>
      <p className="text-sm font-bold text-gray-900 mb-1">{project.campaigns.title}</p>
      {project.campaign_id ? (
        <ContentPreviewStrip
          campaignId={project.campaign_id}
          collaborationId={project.id}
          role="creator"
        />
      ) : (
        <p className="text-xs text-gray-500">{statusText}</p>
      )}
    </div>
  );
}
