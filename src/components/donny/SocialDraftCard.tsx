// The confirm gate. Donny proposes a post; this is where a human publishes it.
//
// The only rich card that runs a mutation rather than navigating. It goes
// through useCrossPost — the same hook SocialPostPrompt and PostingPlanReview
// publish through — so there is one posting path, not a second one that drifts.
import React from 'react';
import { Send, CalendarClock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import {
  useDraftPublication,
  useRecordDraftPublication,
} from '@/hooks/donny/useDraftPublication';
import type { DonnyRichCardSocialPostDraft } from '@/types/donny';

interface SocialDraftCardProps {
  data: DonnyRichCardSocialPostDraft['data'];
}

export function SocialDraftCard({ data }: SocialDraftCardProps) {
  const { mutate, isPending } = useCrossPost();
  // This card is persisted verbatim to donny_messages.rich_cards and re-rendered
  // on every conversation load, so component state cannot answer "has this
  // already gone out" — a reload after a successful publish used to re-arm the
  // button on the SAME draft, and a second tap posted a duplicate to a real
  // public feed. The durable answer lives in donny_draft_publications, keyed on
  // the draft's own id (CT-4b).
  const publication = useDraftPublication(data.draft_id);
  const record = useRecordDraftPublication();
  const [submitted, setSubmitted] = React.useState(false);
  const isScheduled = Boolean(data.scheduled_at);

  // Fail closed on anything short of a definite "not yet published". A draft
  // with no id cannot be proven unpublished at all; neither can one whose
  // lookup failed. This is the one card whose action cannot be undone, so
  // "probably fine" is not the bar — the user can ask Donny for a fresh draft.
  const cannotVerify = !data.draft_id || publication.isUnknown;
  const alreadyPublished = publication.isPublished;
  const busy = submitted || isPending || record.isPending;
  const disabled = alreadyPublished || cannotVerify || publication.isLoading || busy;

  const handlePublish = () => {
    if (disabled) return;
    setSubmitted(true);
    mutate(
      {
        caption: data.caption,
        mediaUrls: data.media_urls,
        accountIds: [data.account_id],
        scheduledAt: data.scheduled_at ?? undefined,
      },
      {
        // Recorded only AFTER the post is out, never before: the invariant is
        // "row exists => it went out". A pre-claim would leave a draft marked
        // published that never posted — permanently un-postable, with nothing
        // on the feed to explain why.
        onSuccess: () => {
          record.mutate(data.draft_id, {
            // The post IS live. A failed marker write is a bookkeeping failure,
            // not a publish failure, so it must not re-arm the button or tell
            // the user anything went wrong. `submitted` keeps this session
            // correct; the residual is that a reload could re-arm this one card.
            onError: (err) =>
              console.error('[SocialDraftCard] published but not recorded', err),
          });
        },
        // useCrossPost's own onError already toasts the failure; without this,
        // `submitted` stays true forever on a failed publish and the button is
        // stuck on "Sending…" behind that toast, with no way to retry.
        onError: () => setSubmitted(false),
      },
    );
  };

  const label = () => {
    if (alreadyPublished) return isScheduled ? 'Scheduled' : 'Posted';
    if (cannotVerify) return 'Ask Donny for a new draft';
    if (busy) return 'Sending…';
    if (publication.isLoading) return 'Checking…';
    return isScheduled ? 'Schedule it' : 'Post it';
  };

  return (
    <AppCard pad="5" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-dc-text">{data.account_label}</span>
        <AppStatusBadge tone={alreadyPublished ? 'teal' : isScheduled ? 'amber' : 'teal'}>
          {alreadyPublished
            ? isScheduled
              ? 'Scheduled'
              : 'Posted'
            : isScheduled
              ? 'Scheduled draft'
              : 'Draft'}
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
        disabled={disabled}
        onClick={handlePublish}
      >
        {alreadyPublished ? (
          <Check className="mr-2 h-4 w-4" />
        ) : isScheduled ? (
          <CalendarClock className="mr-2 h-4 w-4" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {label()}
      </Button>

      {cannotVerify && (
        <p className="text-xs text-dc-text-muted">
          This draft can&apos;t be sent because we can&apos;t confirm whether it already went
          out. Ask Donny to write it again.
        </p>
      )}
    </AppCard>
  );
}
