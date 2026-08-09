// The confirm gate. Donny proposes a post; this is where a human publishes it.
//
// The only rich card that runs a mutation rather than navigating. It goes
// through useCrossPost — the same hook SocialPostPrompt and PostingPlanReview
// publish through — so there is one posting path, not a second one that drifts.
import React from 'react';
import { Send, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import type { DonnyRichCardSocialPostDraft } from '@/types/donny';

interface SocialDraftCardProps {
  data: DonnyRichCardSocialPostDraft['data'];
}

export function SocialDraftCard({ data }: SocialDraftCardProps) {
  const { mutate, isPending } = useCrossPost();
  const [submitted, setSubmitted] = React.useState(false);
  const isScheduled = Boolean(data.scheduled_at);

  const handlePublish = () => {
    if (submitted || isPending) return;
    setSubmitted(true);
    mutate({
      caption: data.caption,
      mediaUrls: data.media_urls,
      accountIds: [data.account_id],
      scheduledAt: data.scheduled_at ?? undefined,
    });
  };

  return (
    <AppCard pad="5" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-dc-text">{data.account_label}</span>
        <AppStatusBadge tone={isScheduled ? 'amber' : 'teal'}>
          {isScheduled ? 'Scheduled draft' : 'Draft'}
        </AppStatusBadge>
      </div>

      <p className="whitespace-pre-wrap text-sm text-dc-text">{data.caption}</p>

      {data.media_urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.media_urls.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-20 w-20 rounded-xl object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {data.scheduled_at && (
        <p className="text-xs text-dc-text-muted">
          Goes out {new Date(data.scheduled_at).toLocaleString()}
        </p>
      )}

      <Button
        variant="dc-primary"
        className="w-full rounded-full"
        disabled={submitted || isPending}
        onClick={handlePublish}
      >
        {isScheduled ? (
          <CalendarClock className="mr-2 h-4 w-4" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {submitted ? 'Sending…' : isScheduled ? 'Schedule it' : 'Post it'}
      </Button>
    </AppCard>
  );
}
