import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Loader2,
  DollarSign
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreatorPayoutBannerProps {
  creatorId: string;
}

const CreatorPayoutBanner: React.FC<CreatorPayoutBannerProps> = ({ creatorId }) => {
  const queryClient = useQueryClient();
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Check creator payout status
  const { data: payoutStatus, isLoading } = useQuery({
    queryKey: ['creator-payout-status', creatorId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-creator-payout-status', {
        body: { creatorId }
      });

      if (error) throw error;
      return data as {
        stripeOnboardingComplete: boolean;
        pendingBalance: number;
        stripeAccountId: string | null;
        chargesEnabled?: boolean;
        payoutsEnabled?: boolean;
      };
    },
    enabled: !!creatorId,
    refetchInterval: 30000 // Refetch every 30 seconds to update status
  });

  // Create or get Stripe Connect account
  const setupPayout = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-creator-connect-account', {
        body: { creatorId }
      });

      if (error) throw error;
      return data as { onboardingUrl: string };
    },
    onSuccess: (data) => {
      // Open Stripe onboarding in new tab
      window.open(data.onboardingUrl, '_blank');
      toast.success('Stripe onboarding opened in a new tab');
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
  if (payoutStatus?.stripeOnboardingComplete && !payoutStatus.pendingBalance) {
    return null; // Don't show banner if everything is good
  }

  // Has pending balance but onboarding not complete
  if (payoutStatus?.pendingBalance && payoutStatus.pendingBalance > 0 && !payoutStatus.stripeOnboardingComplete) {
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
      </Alert>
    );
  }

  // Onboarding not complete (but no pending balance yet)
  if (!payoutStatus?.stripeOnboardingComplete) {
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
      </Alert>
    );
  }

  // Has pending balance and setup is complete - show success state
  if (payoutStatus?.stripeOnboardingComplete && payoutStatus.pendingBalance && payoutStatus.pendingBalance > 0) {
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

export default CreatorPayoutBanner;
