import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EscrowPaymentAlertProps {
  campaignId: string;
  escrowStatus: string;
  escrowPaymentIntentId: string | null;
}

export const EscrowPaymentAlert: React.FC<EscrowPaymentAlertProps> = ({
  campaignId,
  escrowStatus,
  escrowPaymentIntentId: _escrowPaymentIntentId,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPaying, setIsPaying] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Handle ?payment=success / ?payment=cancelled on mount
  useEffect(() => {
    const paymentParam = searchParams.get('payment');
    if (!paymentParam) return;

    if (paymentParam === 'success') {
      const verify = async () => {
        setIsVerifying(true);
        try {
          const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
            body: { campaignId },
          });
          if (error) throw error;
          if (data?.success) {
            toast({
              title: 'Payment Confirmed!',
              description: 'Your campaign is now published and visible to creators.',
            });
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
            queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
          } else {
            toast({
              variant: 'destructive',
              title: 'Payment Pending',
              description: data?.message || 'Payment not yet confirmed. Please try again.',
            });
          }
        } catch {
          toast({
            variant: 'destructive',
            title: 'Verification Failed',
            description: 'Could not verify payment. Please refresh and try again.',
          });
        } finally {
          setIsVerifying(false);
        }
      };
      void verify();
    } else if (paymentParam === 'cancelled') {
      toast({
        title: 'Payment Cancelled',
        description: 'Your campaign was saved as a draft. You can pay escrow later.',
      });
    }

    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('payment');
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (escrowStatus !== 'pending') return null;

  const handlePayEscrow = async () => {
    setIsPaying(true);

    // First try to verify in case payment was already made
    try {
      const { data: verifyData } = await supabase.functions.invoke('verify-campaign-escrow', {
        body: { campaignId },
      });
      if (verifyData?.success && verifyData?.status === 'held') {
        toast({ title: 'Payment Already Verified!', description: 'Your campaign is published.' });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
        setIsPaying(false);
        return;
      }
    } catch {
      // Proceed to checkout
    }

    const checkoutWindow = window.open('about:blank', '_blank');
    try {
      const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
        body: {
          campaignId,
          successUrl: `${window.location.origin}${window.location.pathname}?payment=success`,
          cancelUrl: `${window.location.origin}${window.location.pathname}?payment=cancelled`,
        },
      });
      if (error) throw error;
      if (data?.alreadyPaid) {
        checkoutWindow?.close();
        toast({ title: 'Already Paid', description: 'This campaign has already been paid for.' });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
        return;
      }
      if (data?.url && checkoutWindow) {
        checkoutWindow.location.href = data.url;
        toast({ title: 'Opening Stripe Checkout', description: 'Complete your payment to publish the campaign.' });
      } else if (data?.url) {
        checkoutWindow?.close();
        toast({
          title: 'Popup Blocked',
          description: 'Click below to open payment.',
          action: (
            <Button variant="outline" size="sm" onClick={() => window.open(data.url, '_blank')}>
              Open Payment
            </Button>
          ),
        });
      }
    } catch {
      checkoutWindow?.close();
      toast({ variant: 'destructive', title: 'Payment Failed', description: 'Could not initiate payment. Please try again.' });
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="text-amber-500 text-xl">⚠️</div>
        <div className="flex-1">
          <p className="font-semibold text-amber-900 text-sm">Payment Required to Publish</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Pay escrow to activate your campaign and make it visible to creators.
          </p>
        </div>
      </div>
      <Button
        onClick={handlePayEscrow}
        disabled={isPaying || isVerifying}
        className="w-full rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold"
      >
        {(isPaying || isVerifying) ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {isVerifying ? 'Verifying…' : 'Opening Checkout…'}
          </>
        ) : (
          'Pay & Publish Campaign'
        )}
      </Button>
    </div>
  );
};
