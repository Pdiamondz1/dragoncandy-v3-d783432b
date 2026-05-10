import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  ExternalLink,
  CheckCircle2,
  Loader2,
  DollarSign
} from 'lucide-react';
import { StripeTestHelper } from '@/components/payments/StripeTestHelper';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreatorPayoutBannerProps {
  creatorId: string;
}

export const CreatorPayoutBanner: React.FC<CreatorPayoutBannerProps> = ({ creatorId }) => {
  const [_isSettingUp, setIsSettingUp] = useState(false);

  // Check creator payout status
  const { data: payoutStatus, isLoading } = useQuery({
    queryKey: ['creator-payout-status', creatorId],
    queryFn: async () => {
      // Edge function uses auth header, no need to pass creatorId in body
      const { data, error } = await supabase.functions.invoke('check-creator-payout-status');

      if (error) throw error;
      
      // Map Edge Function response fields correctly
      // check-creator-payout-status returns: hasAccount, accountId, onboardingComplete, 
      // availableBalance, pendingBalance (Stripe), platformPendingBalance (platform wallet)
      return {
        onboardingComplete: data?.onboardingComplete ?? false,
        pendingBalance: data?.platformPendingBalance ?? 0, // Platform wallet balance
        stripeAccountId: data?.accountId ?? null,
        hasAccount: data?.hasAccount ?? false,
        chargesEnabled: data?.chargesEnabled ?? false,
        payoutsEnabled: data?.payoutsEnabled ?? false,
      };
    },
    enabled: !!creatorId,
    refetchInterval: 30000 // Refetch every 30 seconds to update status
  });

  // Create or get Stripe Connect account
  const setupPayout = useMutation({
    mutationFn: async () => {
      // Open blank window synchronously to bypass popup blocker
      const stripeWindow = window.open('about:blank', '_blank');
      
      const { data, error } = await supabase.functions.invoke('create-creator-connect-account');

      if (error) {
        stripeWindow?.close();
        throw error;
      }
      
      return { data, stripeWindow };
    },
    onSuccess: ({ data, stripeWindow }) => {
      // Edge function returns { url, accountId, isNew }
      if (data?.url && stripeWindow) {
        stripeWindow.location.href = data.url;
        toast.success('Stripe onboarding opened in a new tab');
      } else if (data?.url) {
        // Fallback if popup was blocked
        window.location.href = data.url;
      } else {
        toast.error('Failed to get Stripe onboarding link');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to start payout setup: ${error.message}`);
    }
  });

  const handleSetupClick = () => {
    setIsSettingUp(true);
    setupPayout.mutate();
  };

  if (isLoading) {
    return (
      <Alert className="bg-muted/50">
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertDescription>Checking payout status...</AlertDescription>
      </Alert>
    );
  }

  // Already fully set up and no pending balance
  if (payoutStatus?.onboardingComplete && !payoutStatus.pendingBalance) {
    return null; // Don't show banner if everything is good
  }

  // Has pending balance but onboarding not complete
  if (payoutStatus?.pendingBalance && payoutStatus.pendingBalance > 0 && !payoutStatus.onboardingComplete) {
    return (
      <Alert className="border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
        <Wallet className="h-5 w-5 text-amber-600" />
        <div className="flex-1">
          <AlertTitle className="text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            You have ${payoutStatus.pendingBalance.toFixed(2)} pending!
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-400 mt-1">
            Complete your payout setup to receive your earnings. This balance will be transferred once your Stripe account is verified.
          </AlertDescription>
        </div>
        <Button
          onClick={handleSetupClick}
          disabled={setupPayout.isPending}
          className="bg-amber-600 hover:bg-amber-700 shrink-0"
        >
          {setupPayout.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              Complete Setup
            </>
          )}
        </Button>
        <StripeTestHelper variant="bank" className="mt-3" />
      </Alert>
    );
  }

  // Onboarding not complete (but no pending balance yet)
  if (!payoutStatus?.onboardingComplete) {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <Wallet className="h-5 w-5 text-blue-600" />
        <div className="flex-1">
          <AlertTitle className="text-blue-800 dark:text-blue-300">
            Set Up Your Payout Method
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-400 mt-1">
            Connect your bank account to receive payments when you complete projects. Quick and secure setup via Stripe.
          </AlertDescription>
        </div>
        <Button
          onClick={handleSetupClick}
          disabled={setupPayout.isPending}
          variant="outline"
          className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
        >
          {setupPayout.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              Set Up Payouts
            </>
          )}
        </Button>
        <StripeTestHelper variant="bank" className="mt-3" />
      </Alert>
    );
  }

  // Has pending balance and setup is complete - show success state
  if (payoutStatus?.onboardingComplete && payoutStatus.pendingBalance && payoutStatus.pendingBalance > 0) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <div className="flex-1">
          <AlertTitle className="text-green-800 dark:text-green-300 flex items-center gap-2">
            Payout Processing
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              ${payoutStatus.pendingBalance.toFixed(2)}
            </Badge>
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400 mt-1">
            Your payout is being processed and will arrive in your bank account shortly.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  return null;
};

