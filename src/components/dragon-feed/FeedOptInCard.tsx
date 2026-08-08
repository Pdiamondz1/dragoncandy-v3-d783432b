import React, { useState } from 'react';
import { Image, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppCard } from '@/components/app/AppCard';
import { Button } from '@/components/ui/button';
import { useFeedOptIn } from '@/hooks/useFeedOptIn';

/**
 * Dashboard prompt for a creator who has portfolio work but is absent from the Dragon Feed.
 *
 * The flag defaults to false and lived only in a collapsed Settings accordion, so being missing
 * from the feed was almost never a decision — it was just the default nobody saw. This asks once,
 * plainly, where the creator already is.
 */
export const FeedOptInCard: React.FC = () => {
  const { shouldPrompt, optIn, isOptingIn, dismiss } = useFeedOptIn();
  const [hidden, setHidden] = useState(false);

  if (!shouldPrompt || hidden) return null;

  const handleOptIn = async () => {
    try {
      await optIn();
      toast.success('Your work is now in the Dragon Feed');
    } catch {
      toast.error("Couldn't update that — please try again");
    }
  };

  return (
    <AppCard className="relative">
      <button
        type="button"
        onClick={() => { dismiss(); setHidden(true); }}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-full p-1 text-dc-text-muted hover:bg-dc-teal/10"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-dc-teal/10">
          <Image className="h-5 w-5 text-dc-teal-btn" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-dc-text">Your work isn't in the Dragon Feed</h3>
          <p className="mt-1 text-sm text-dc-text-muted">
            The Dragon Feed is where businesses browse creators' work to decide who to hire.
            Your portfolio is hidden from it right now.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="dc-primary" onClick={handleOptIn} disabled={isOptingIn}>
              {isOptingIn ? 'Adding…' : 'Show my work'}
            </Button>
            <Button
              variant="dc-secondary"
              onClick={() => { dismiss(); setHidden(true); }}
              disabled={isOptingIn}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </AppCard>
  );
};
