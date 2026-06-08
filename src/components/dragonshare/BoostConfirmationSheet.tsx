import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Clock } from 'lucide-react';
import { useState } from 'react';
import { DRAGONSHARE_FEE_RATE } from '@/types/dragonshare';
import type { DragonSharePostWithRelations, BoostTierLabel } from '@/types/dragonshare';
import { useAmplificationPreview } from '@/hooks/useAmplificationPreview';
import { resolveBoostOutcome } from './boostOutcome';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: DragonSharePostWithRelations;
  amountCents: number;
  tierLabel: BoostTierLabel;
  creatorId: string;
  orgId: string;
}

export function BoostConfirmationSheet({ open, onOpenChange, post, amountCents, tierLabel, creatorId, orgId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: platforms } = useAmplificationPreview(creatorId, orgId);
  const [boostQueued, setBoostQueued] = useState(false);

  const platformFeeCents = Math.round(amountCents * DRAGONSHARE_FEE_RATE);
  const creatorPayoutCents = amountCents - platformFeeCents;
  const creatorName = post.creator?.full_name ?? 'the creator';

  const creatorPlatforms = platforms?.filter((p) => p.ownerType === 'creator') ?? [];
  const orgPlatforms = platforms?.filter((p) => p.ownerType === 'business') ?? [];

  const formatPlatformList = (list: typeof creatorPlatforms): string => {
    if (list.length === 0) return 'connected platforms';
    const names = list.map((p) => p.platform.charAt(0).toUpperCase() + p.platform.slice(1));
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  };

  const boostMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Pre-open a blank tab synchronously to dodge pop-up blockers (may be unused).
      const checkoutTab = window.open('about:blank', '_blank');

      const res = await supabase.functions.invoke('boost-payment', {
        body: { post_id: post.id, amount_cents: amountCents, tier_label: tierLabel },
      });
      if (res.error) {
        checkoutTab?.close();
        throw new Error(res.error.message);
      }
      return { data: res.data, checkoutTab };
    },
    onSuccess: ({ data, checkoutTab }) => {
      const outcome = resolveBoostOutcome(data);
      if (outcome.kind === 'checkout') {
        if (checkoutTab) checkoutTab.location.href = outcome.url;
        else window.open(outcome.url, '_blank');
        toast({ title: 'Complete your payment', description: 'Finish the boost in the new tab.' });
        onOpenChange(false);
        return;
      }
      checkoutTab?.close();
      if (outcome.kind === 'queued') {
        setBoostQueued(true);
        toast({ title: 'Boost queued', description: "We've notified the creator to finish setup. You won't be charged until it's processed." });
        return;
      }
      const paidCents = outcome.creatorPayoutCents ?? creatorPayoutCents;
      toast({ title: 'Boost confirmed!', description: `$${(paidCents / 100).toFixed(0)} is on its way to ${creatorName}.` });
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Boost failed', description: msg, variant: 'destructive' });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setBoostQueued(false);
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-dc-text">
            Boost This Post
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-dc-text">${(amountCents / 100).toFixed(0)}</p>
            <p className="text-sm text-dc-text-muted">boost to {creatorName}</p>
          </div>

          {/* What happens when you boost */}
          <div className="rounded-xl bg-dc-teal/5 border border-dc-teal/20 p-4 space-y-3">
            <p className="text-xs font-bold text-dc-teal uppercase tracking-wider">What happens when you boost</p>
            <ol className="space-y-2 text-sm text-dc-text">
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-dc-teal text-white flex items-center justify-center text-[11px] font-bold">1</span>
                <span>
                  Drafted for one-tap posting to <span className="font-medium">{creatorName}</span>'s{' '}
                  <span className="font-medium">{formatPlatformList(creatorPlatforms)}</span>, with an AI caption
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-dc-teal text-white flex items-center justify-center text-[11px] font-bold">2</span>
                <span>
                  Drafted for your <span className="font-medium">{formatPlatformList(orgPlatforms)}</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-dc-teal text-white flex items-center justify-center text-[11px] font-bold">3</span>
                <span>
                  <span className="font-medium">{creatorName}</span> gets{' '}
                  <span className="font-medium text-dc-teal">${(creatorPayoutCents / 100).toFixed(0)}</span> for their great content
                </span>
              </li>
            </ol>
          </div>

          {/* Payment breakdown */}
          <div className="rounded-xl bg-dc-teal/5 border border-dc-teal/10 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-dc-text-muted">Creator gets</span>
              <span className="font-medium">${(creatorPayoutCents / 100).toFixed(2)} (80%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dc-text-muted">DragonCandy fee</span>
              <span className="font-medium">${(platformFeeCents / 100).toFixed(2)} (20%)</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold text-dc-text">
              <span>You pay</span>
              <span>${(amountCents / 100).toFixed(2)}</span>
            </div>
          </div>

          {boostQueued ? (
            <div className="rounded-2xl bg-dc-teal/10 border border-dc-teal/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-dc-teal flex-shrink-0" />
                <p className="text-sm font-semibold text-dc-teal">Boost queued</p>
              </div>
              <p className="text-sm text-dc-text-muted leading-relaxed">
                <span className="font-medium text-dc-text">{creatorName}</span> is finishing payout setup — your{' '}
                <span className="font-medium text-dc-text">${(amountCents / 100).toFixed(0)} boost</span> is queued and
                will be charged automatically once they're ready. You won't be charged until then.
              </p>
              <Button
                variant="ghost"
                className="w-full rounded-full text-dc-text-muted text-sm mt-1"
                onClick={() => onOpenChange(false)}
              >
                Got it
              </Button>
            </div>
          ) : (
            <Button
              className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white"
              onClick={() => boostMutation.mutate()}
              disabled={boostMutation.isPending}
            >
              {boostMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing…</>
              ) : (
                'Confirm Boost'
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
