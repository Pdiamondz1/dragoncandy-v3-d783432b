import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Zap } from 'lucide-react';

interface InvitationBannerProps {
  businessName?: string;
  campaignId?: string;
  campaignTitle?: string;
  onQuickApply?: () => void;
  onDecline?: () => void;
}

export function InvitationBanner({
  businessName,
  campaignId,
  campaignTitle,
  onQuickApply,
  onDecline,
}: InvitationBannerProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-4 my-3 rounded-2xl bg-gradient-to-r from-teal-50 to-pink-50 border border-teal-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl leading-none shrink-0">📩</span>
          <div className="min-w-0">
            <p className="font-bold text-dc-text text-sm">You're invited!</p>
            <p className="text-xs text-dc-text-muted mt-0.5">
              {businessName
                ? `${businessName} personally invited you${campaignTitle ? ` to "${campaignTitle}"` : ' to this campaign'}`
                : 'You were personally invited to this campaign'}
            </p>
          </div>
        </div>

        {onDecline && (
          <button
            type="button"
            onClick={onDecline}
            className="shrink-0 text-dc-text-muted hover:text-dc-text transition-colors"
            aria-label="Dismiss invitation"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        {campaignId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/dashboard/creator/campaigns/${campaignId}`)}
            className="flex-1 rounded-full border-dc-teal text-dc-teal hover:bg-teal-50 font-semibold text-xs h-9"
          >
            View Campaign
          </Button>
        )}
        {onQuickApply && (
          <Button
            size="sm"
            onClick={onQuickApply}
            className="flex-1 rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold text-xs h-9"
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            Quick Apply
          </Button>
        )}
      </div>
    </div>
  );
}
