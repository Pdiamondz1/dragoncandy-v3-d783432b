import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import type { IntakeAnswers } from '@/components/packages/IntakeForm';

export interface CheckoutInput {
  packageId: string;
  intake: IntakeAnswers;
  /** The buyer's email — always required here; the public link is a guest-checkout surface for everyone. */
  buyerEmail: string;
}

/**
 * Start a package checkout from the public shareable link. This is a GUEST surface by design (built for
 * off-platform restaurants), so it invokes create-package-order-escrow AS ANON — overriding the Authorization
 * header to the publishable key even if a DragonCandy user happens to be logged in — so every buyer gets a
 * guest order with a /order/:token tracking page (there is no logged-in buyer order page until v1d). It then
 * navigates the CURRENT window to Stripe Checkout (a direct navigation, never a popup, so it's never blocked).
 */
export const usePackageCheckout = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkout = useCallback(async (input: CheckoutInput) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-package-order-escrow', {
        body: { packageId: input.packageId, intake: input.intake, buyerEmail: input.buyerEmail },
        headers: { Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (error) throw error;

      if (data?.retry) {
        toast.message('One moment — finishing preparing your checkout. Please tap Book again.');
        setIsSubmitting(false);
        return;
      }
      if (data?.alreadyPaid) {
        if (data.guestToken) {
          // Forward session_id when present so the order page can verify a paid-but-unverified session
          // (otherwise the buyer would be stuck at "Awaiting payment").
          const qs = data.sessionId ? `?session_id=${encodeURIComponent(data.sessionId)}` : '';
          window.location.href = `/order/${data.guestToken}${qs}`;
        } else {
          toast.success('This order is already paid.');
        }
        setIsSubmitting(false);
        return;
      }
      if (data?.url) {
        window.location.href = data.url; // success navigates away; leave isSubmitting true
        return;
      }
      throw new Error('No checkout URL was returned.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start checkout. Please try again.');
      setIsSubmitting(false);
    }
  }, []);

  return { checkout, isSubmitting };
};
