import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { CreatorApplication } from '@/hooks/useCreatorApplications';
import type { CreatorCollaboration } from '@/hooks/useCreatorCollaborations';

type CardVariant = 'applied' | 'counter_offered' | 'accepted' | 'active' | 'completed';

interface MyCampaignCardProps {
  variant: CardVariant;
  campaignId: string;
  title: string;
  businessName: string;
  businessLocation?: string | null;
  price: number | null;
  application?: CreatorApplication;
  collaboration?: CreatorCollaboration;
}

const borderColors: Record<CardVariant, string> = {
  applied: 'border-l-yellow-400',
  counter_offered: 'border-l-orange-500',
  accepted: 'border-l-teal-400',
  active: 'border-l-dc-teal',
  completed: 'border-l-green-500',
};

const statusConfig: Record<CardVariant, { label: string; className: string }> = {
  applied: { label: '⏳ Pending', className: 'bg-yellow-50 text-yellow-800' },
  counter_offered: { label: '💬 Counter Offer', className: 'bg-orange-50 text-orange-800' },
  accepted: { label: '✅ Accepted', className: 'bg-teal-50 text-teal-800' },
  active: { label: 'Active', className: 'bg-teal-50 text-teal-800' },
  completed: { label: '✅ Completed', className: 'bg-green-50 text-green-800' },
};

const ctaConfig: Record<CardVariant, { label: string; className: string }> = {
  applied: { label: 'View →', className: 'text-dc-teal' },
  counter_offered: { label: 'Respond →', className: 'text-pink-500' },
  accepted: { label: 'View →', className: 'text-dc-teal' },
  active: { label: 'Upload →', className: 'text-white bg-dc-teal px-3 py-1.5 rounded-full text-xs' },
  completed: { label: 'Review →', className: 'text-dc-teal' },
};

export function MyCampaignCard({
  variant,
  campaignId,
  title,
  businessName,
  businessLocation,
  price,
  application,
  collaboration,
}: MyCampaignCardProps) {
  const navigate = useNavigate();

  const timeContext = getTimeContext(variant, application, collaboration);
  const status = statusConfig[variant];
  const cta = ctaConfig[variant];
  const deliverableProgress = getDeliverableProgress(collaboration);
  const deadlineUrgency = getDeadlineUrgency(collaboration);

  return (
    <div
      onClick={() => navigate(`/dashboard/creator/my-campaigns/${campaignId}`)}
      className={`bg-white rounded-2xl p-4 border-l-4 ${borderColors[variant]} cursor-pointer hover:shadow-md transition-shadow`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900 text-sm truncate">{title}</div>
          <div className="text-xs text-gray-500">
            {businessName}{businessLocation ? ` • ${businessLocation}` : ''}
          </div>
        </div>
        <Badge className={`ml-2 shrink-0 text-[11px] ${status.className}`}>
          {status.label}
        </Badge>
      </div>

      {variant === 'accepted' && (
        <p className="text-xs text-amber-600 mb-2">Awaiting project start</p>
      )}

      {variant === 'active' && collaboration?.campaign?.delivery_type && (
        <Badge className="mb-2 bg-green-50 text-green-800 text-[11px]">
          ⚡ {collaboration.campaign.delivery_type === 'dragonrush' ? 'DragonRush' :
              collaboration.campaign.delivery_type === 'expedited' ? 'Expedited' : 'Standard'}
        </Badge>
      )}

      {variant === 'active' && deliverableProgress && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Deliverables</span>
            <span>{deliverableProgress.done}/{deliverableProgress.total} done</span>
          </div>
          <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-dc-teal h-full rounded-full transition-all"
              style={{ width: `${deliverableProgress.total > 0 ? (deliverableProgress.done / deliverableProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {price != null && `$${price}`}
          {timeContext && <span className="text-gray-400"> · {timeContext}</span>}
          {variant === 'active' && deadlineUrgency && (
            <span className={`ml-1 font-semibold ${deadlineUrgency.color}`}>
              ⏰ {deadlineUrgency.label}
            </span>
          )}
        </div>
        <span className={`text-sm font-semibold ${cta.className}`}>{cta.label}</span>
      </div>
    </div>
  );
}

function getTimeContext(
  variant: CardVariant,
  application?: CreatorApplication,
  collaboration?: CreatorCollaboration,
): string | null {
  if (variant === 'applied' || variant === 'counter_offered') {
    if (!application?.created_at) return null;
    const days = Math.floor((Date.now() - new Date(application.created_at).getTime()) / 86400000);
    return days === 0 ? 'Applied today' : `Applied ${days}d ago`;
  }
  if (variant === 'accepted') {
    if (!application?.updated_at) return null;
    const days = Math.floor((Date.now() - new Date(application.updated_at).getTime()) / 86400000);
    return days === 0 ? 'Accepted today' : `Accepted ${days}d ago`;
  }
  if (variant === 'completed') {
    if (!collaboration?.completed_at) return null;
    return `Completed ${new Date(collaboration.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return null;
}

function getDeliverableProgress(collaboration?: CreatorCollaboration) {
  if (!collaboration?.deliverables_status) return null;
  const statuses = Object.values(collaboration.deliverables_status);
  const total = statuses.length;
  const done = statuses.filter((s) => s === 'approved' || s === 'submitted').length;
  return { done, total };
}

function getDeadlineUrgency(collaboration?: CreatorCollaboration) {
  if (!collaboration?.content_deadline) return null;
  const days = Math.ceil((new Date(collaboration.content_deadline).getTime() - Date.now()) / 86400000);
  if (days <= 2) return { label: `Due in ${days}d`, color: 'text-red-500' };
  if (days <= 5) return { label: `Due in ${days}d`, color: 'text-yellow-600' };
  return null;
}
