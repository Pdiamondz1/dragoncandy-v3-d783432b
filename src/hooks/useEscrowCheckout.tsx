import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

export function useEscrowCheckout() {
  const [isPayingEscrow, setIsPayingEscrow] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initiateCheckout = useCallback(async (campaignId: string) => {
    // Central safety net: free crew campaigns (group_id set) have no escrow. Some callers
    // (e.g. the proposals page) don't pass the campaign object, so guard here for every
    // surface — never open a paid checkout for a group campaign.
    const { data: campaignRow } = await supabase
      .from('campaigns')
      .select('group_id')
      .eq('id', campaignId)
      .maybeSingle();
    if (campaignRow?.group_id) return;

    setIsPayingEscrow(true);
    try {
      const { data: verifyData } = await supabase.functions.invoke('verify-campaign-escrow', {
        body: { campaignId },
      });
      if (verifyData?.success && verifyData?.status === 'held') {
        toast({ title: 'Payment Already Verified!', description: 'Your campaign is active.' });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
        setIsPayingEscrow(false);
        return;
      }
    } catch { /* proceed to checkout */ }

    const checkoutWindow = window.open('about:blank', '_blank');
    try {
      const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
        body: { campaignId },
      });
      if (error) throw error;
      if (data?.alreadyPaid) {
        checkoutWindow?.close();
        toast({ title: 'Already Paid', description: 'This campaign has already been paid for.' });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        setIsPayingEscrow(false);
        return;
      }
      if (data?.url && checkoutWindow) {
        checkoutWindow.location.href = data.url;
      } else if (data?.url) {
        checkoutWindow?.close();
        toast({
          title: 'Popup Blocked',
          description: 'Click below to open payment.',
          action: <Button variant="outline" size="sm" onClick={() => window.open(data.url, '_blank')}>Open Payment</Button>,
        });
      }
    } catch {
      checkoutWindow?.close();
      toast({ variant: 'destructive', title: 'Payment Failed', description: 'Could not initiate payment. Try the Pay Escrow button on the campaign page.' });
    } finally {
      setIsPayingEscrow(false);
    }
  }, [toast, queryClient]);

  return { initiateCheckout, isPayingEscrow };
}
