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
  // KNOWN GAP, deliberately not closed here: `submitted` is component state,
  // but this card is persisted verbatim to donny_messages.rich_cards and
  // re-rendered on every conversation load — so a reload after a successful
  // publish re-arms this button on the SAME draft, and a second tap posts a
  // duplicate to a real public feed. Closing it needs the client to mark the
  // card published in its own donny_messages row, and donny_messages has no
  // UPDATE RLS policy for any surface (checked supabase/migrations/ — only
  // SELECT + INSERT exist). Per this branch's no-migration constraint, that
  // is left to the founder rather than worked around here.
  const [submitted, setSubmitted] = React.useState(false);
  const isScheduled = Boolean(data.scheduled_at);

  const handlePublish = () => {
    if (submitted || isPending) return;
    setSubmitted(true);
    mutate(
      {
        caption: data.caption,
        mediaUrls: data.media_urls,
        accountIds: [data.account_id],
        scheduledAt: data.scheduled_at ?? undefined,
      },
      {
        // useCrossPost's own onError already toasts the failure; without
        // this, `submitted` stays true forever on a failed publish (it is
        // only ever set, never cleared) and the button is permanently stuck
        // on "Sending…" behind that toast, with no way to retry.
        onError: () => setSubmitted(false),
      },
    );
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
