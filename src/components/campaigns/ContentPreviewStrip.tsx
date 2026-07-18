import { useCampaignContentSummary } from '@/hooks/useCampaignContentSummary';
import { Skeleton } from '@/components/ui/skeleton';

interface ContentPreviewStripProps {
  campaignId: string;
  collaborationId?: string;
  role: 'business' | 'creator';
}

export function ContentPreviewStrip({ campaignId, collaborationId, role }: ContentPreviewStripProps) {
  const { data, isLoading, isError } = useCampaignContentSummary(campaignId, collaborationId);

  if (isError) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 bg-dc-teal/[0.04] rounded-lg border border-dc-teal/15 p-2">
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-[44px] h-[44px] rounded-lg" />
          ))}
        </div>
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </div>
    );
  }

  if (!data || data.totalDeliverables === 0) return null;

  const deliveredLabel = role === 'business' ? 'delivered' : 'submitted';
  const primaryText = `${data.submitted}/${data.totalDeliverables} ${deliveredLabel}`;

  let secondaryText = '';
  let secondaryColor = 'text-gray-500';

  if (data.submitted === 0) {
    secondaryText = role === 'business' ? 'Waiting on creators' : 'Upload your first deliverable';
  } else if (data.revisionRequested > 0) {
    secondaryText = `${data.revisionRequested} needs revision`;
    secondaryColor = 'text-amber-500';
  } else if (data.approved === data.totalDeliverables) {
    secondaryText = 'All approved';
    secondaryColor = 'text-emerald-400';
  } else if (data.pendingReview > 0 && data.approved > 0) {
    secondaryText = `${data.approved} approved · ${data.pendingReview} in review`;
    secondaryColor = 'text-yellow-400';
  } else if (data.pendingReview > 0) {
    secondaryText = `${data.pendingReview} awaiting review`;
    secondaryColor = 'text-yellow-400';
  } else {
    secondaryText = `${data.approved} approved`;
    secondaryColor = 'text-emerald-400';
  }

  return (
    <div className="flex items-center gap-2.5 bg-dc-teal/[0.04] rounded-lg border border-dc-teal/15 p-2">
      {data.thumbnailUrls.length > 0 && (
        <div className="flex gap-1.5 flex-shrink-0">
          {data.thumbnailUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-[44px] h-[44px] rounded-lg object-cover"
              loading="lazy"
            />
          ))}
          {data.submitted > data.thumbnailUrls.length && (
            <div className="w-[44px] h-[44px] rounded-lg border-2 border-dashed border-dc-teal/20 flex items-center justify-center">
              <span className="text-xs text-gray-400 font-semibold">
                +{data.submitted - data.thumbnailUrls.length}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-dc-teal truncate">{primaryText}</p>
        <p className={`text-xs ${secondaryColor} truncate`}>{secondaryText}</p>
      </div>
    </div>
  );
}
