import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';
import { DRAGONSHARE_FEE_RATE } from '@/types/dragonshare';
import type { DragonSharePostWithRelations, BoostTierLabel } from '@/types/dragonshare';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: DragonSharePostWithRelations;
  amountCents: number;
  tierLabel: BoostTierLabel;
}

export function BoostConfirmationSheet({ open, onOpenChange, post, amountCents, tierLabel }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const platformFeeCents = Math.round(amountCents * DRAGONSHARE_FEE_RATE);
  const creatorPayoutCents = amountCents - platformFeeCents;

  const boostMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await supabase.functions.invoke('boost-payment', {
        body: { post_id: post.id, amount_cents: amountCents, tier_label: tierLabel },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Boost confirmed!', description: `$${(creatorPayoutCents / 100).toFixed(0)} is on its way to ${post.creator?.full_name}.` });
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('CREATOR_PAYOUT_NOT_READY')) {
        toast({ title: 'Boost queued', description: "We've notified the creator to finish setup. Your boost is queued — you won't be charged until it's processed." });
        onOpenChange(false);
      } else {
        toast({ title: 'Boost failed', description: msg, variant: 'destructive' });
      }
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-500" />
            Confirm Boost
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold">${(amountCents / 100).toFixed(0)}</p>
            <p className="text-sm text-muted-foreground">boost to {post.creator?.full_name}</p>
          </div>

          <div className="rounded-xl bg-muted p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Creator gets</span>
              <span className="font-medium">${(creatorPayoutCents / 100).toFixed(2)} (80%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DragonCandy fee</span>
              <span className="font-medium">${(platformFeeCents / 100).toFixed(2)} (20%)</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>You pay</span>
              <span>${(amountCents / 100).toFixed(2)}</span>
            </div>
          </div>

          <Button
            className="w-full rounded-full"
            onClick={() => boostMutation.mutate()}
            disabled={boostMutation.isPending}
          >
            {boostMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
            ) : (
              'Confirm Boost'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
