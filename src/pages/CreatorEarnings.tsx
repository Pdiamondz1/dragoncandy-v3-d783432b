import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Wallet,
  DollarSign,
  Clock,
  CheckCircle,
  ExternalLink,
  AlertCircle,
  TrendingUp,
  Loader2,
  CreditCard,
  Building2,
  ArrowUpRight
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface PayoutStatus {
  hasStripeAccount: boolean;
  onboardingComplete: boolean;
  stripeAccountId: string | null;
  availableBalance: number;
  pendingBalance: number;
  platformPendingBalance: number;
}

interface PaymentHistoryItem {
  id: string;
  campaignTitle: string;
  amount: number;
  platformFee: number;
  escrowStatus: string;
  date: string;
}

// Compute display status at render time based on escrow status and payout state
const getPaymentDisplayStatus = (
  escrowStatus: string,
  onboardingComplete: boolean,
  hasPlatformPendingBalance: boolean
): 'paid' | 'pending' | 'in_wallet' => {
  if (escrowStatus !== 'released') {
    return 'pending';
  }
  if (!onboardingComplete || hasPlatformPendingBalance) {
    return 'in_wallet';
  }
  return 'paid';
};

const CreatorEarnings: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch payout status
  const { data: payoutStatus, isLoading: isLoadingStatus, isError: isStatusError } = useQuery({
    queryKey: ['creator-payout-status', user?.id],
    queryFn: async (): Promise<PayoutStatus> => {
      const { data, error } = await supabase.functions.invoke('check-creator-payout-status');

      if (error) {
        console.error('Error checking payout status:', error);
        throw error;
      }

      const onboardingComplete = data?.onboardingComplete ?? false;
      const platformPendingBalance = data?.platformPendingBalance ?? 0;

      return {
        hasStripeAccount: data?.hasAccount ?? !!data?.accountId,
        onboardingComplete,
        stripeAccountId: data?.accountId ?? null,
        availableBalance: onboardingComplete ? (data?.availableBalance ?? 0) : 0,
        pendingBalance: data?.pendingBalance ?? 0,
        platformPendingBalance,
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Fetch earnings history from completed projects
  const { data: earnings = [], isLoading: isLoadingEarnings, isError: isEarningsError } = useQuery({
    queryKey: ['creator-earnings-history', user?.id],
    queryFn: async (): Promise<PaymentHistoryItem[]> => {
      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          completed_at,
          campaigns!campaign_id (
            title,
            budget_min,
            budget_max,
            fixed_price,
            pricing_type,
            escrow_status
          )
        `)
        .eq('creator_id', user!.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((collab: any) => {
        const campaign = collab.campaigns;
        const amount = campaign?.fixed_price || campaign?.budget_min || campaign?.budget_max || 0;
        const platformFee = amount * 0.05;

        return {
          id: collab.id,
          campaignTitle: campaign?.title || 'Unknown Campaign',
          amount: amount - platformFee,
          platformFee,
          escrowStatus: campaign?.escrow_status || 'pending',
          date: collab.completed_at || '',
        };
      });
    },
    enabled: !!user,
  });

  // Setup Stripe mutation
  const setupStripeMutation = useMutation({
    mutationFn: async () => {
      const stripeWindow = window.open('about:blank', '_blank');

      const { data, error } = await supabase.functions.invoke('create-creator-connect-account');
      if (error) {
        stripeWindow?.close();
        throw error;
      }

      return { data, stripeWindow };
    },
    onSuccess: ({ data, stripeWindow }) => {
      if (data?.url && stripeWindow) {
        stripeWindow.location.href = data.url;
        toast({ title: 'Stripe Setup Started', description: 'Complete your setup in the new tab.' });
      } else if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({ title: 'Error', description: 'Failed to get Stripe onboarding link.', variant: 'destructive' });
      }
      queryClient.invalidateQueries({ queryKey: ['creator-payout-status'] });
    },
    onError: (error) => {
      console.error('Stripe setup error:', error);
      toast({ title: 'Setup Failed', description: 'Failed to start Stripe setup. Please try again.', variant: 'destructive' });
    },
  });

  // Withdraw to Stripe mutation
  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('withdraw-pending-balance');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: 'Withdrawal Complete!', description: data?.message || `Successfully transferred funds to your Stripe account.` });
      queryClient.invalidateQueries({ queryKey: ['creator-payout-status'] });
      queryClient.invalidateQueries({ queryKey: ['creator-earnings-history'] });
    },
    onError: (error) => {
      console.error('Withdraw error:', error);
      toast({
        title: 'Withdrawal Failed',
        description: error instanceof Error ? error.message : 'Failed to withdraw funds. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Open Stripe Dashboard mutation
  const openDashboardMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-stripe-dashboard-link');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.url) window.open(data.url, '_blank');
    },
    onError: (error) => {
      console.error('Dashboard link error:', error);
      toast({ title: 'Error', description: 'Failed to open Stripe dashboard.', variant: 'destructive' });
    },
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
  const totalFees = earnings.reduce((sum, e) => sum + e.platformFee, 0);

  const hasPlatformPendingBalance = (payoutStatus?.platformPendingBalance ?? 0) > 0;
  const canWithdraw = payoutStatus?.onboardingComplete && hasPlatformPendingBalance;

  const getStatusBadge = (status: 'paid' | 'pending' | 'in_wallet') => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 rounded-full text-xs">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 rounded-full text-xs">Pending</Badge>;
      case 'in_wallet':
        return <Badge className="bg-amber-100 text-amber-800 rounded-full text-xs">In Wallet</Badge>;
      default:
        return <Badge variant="secondary" className="rounded-full text-xs">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen overflow-x-hidden">
        {/* Template A — Pink gradient header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-4 pb-6">
          <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal mb-1">
            Creator Earnings
          </p>
          <h1 className="text-2xl font-extrabold text-gray-900">My Earnings</h1>
          <p className="text-sm text-gray-500 mt-1">Track your earnings and manage payouts</p>

          {/* Stripe Setup Banner */}
          {!isLoadingStatus && payoutStatus && !payoutStatus.onboardingComplete && (
            <Alert className={`mt-4 rounded-2xl ${hasPlatformPendingBalance ? 'border-amber-500 bg-amber-50' : 'border-dc-teal bg-white'}`}>
              <AlertCircle className={`h-4 w-4 ${hasPlatformPendingBalance ? 'text-amber-600' : 'text-dc-teal'}`} />
              <AlertTitle className="text-sm font-bold">
                {hasPlatformPendingBalance
                  ? `${formatCurrency(payoutStatus.platformPendingBalance)} ready to withdraw!`
                  : 'Set Up Your Payout Method'
                }
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-gray-600">
                  {payoutStatus.hasStripeAccount
                    ? 'Complete your Stripe verification to withdraw.'
                    : 'Connect your Stripe account to withdraw earnings.'
                  }
                </span>
                <Button
                  onClick={() => setupStripeMutation.mutate()}
                  disabled={setupStripeMutation.isPending}
                  size="sm"
                  className="rounded-full bg-dc-teal text-white font-bold text-xs"
                >
                  {setupStripeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-1" />
                  )}
                  {payoutStatus.hasStripeAccount ? 'Complete Setup' : 'Connect Stripe'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Withdraw Banner */}
          {!isLoadingStatus && payoutStatus?.onboardingComplete && hasPlatformPendingBalance && (
            <Alert className="mt-4 border-green-500 bg-green-50 rounded-2xl">
              <Wallet className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-sm font-bold text-green-800">
                {formatCurrency(payoutStatus.platformPendingBalance)} Available
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-green-700">Ready to transfer to your Stripe account.</span>
                <Button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  size="sm"
                  className="rounded-full bg-green-600 hover:bg-green-700 text-white font-bold text-xs"
                >
                  {withdrawMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                  )}
                  Withdraw
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Template A — White body */}
        <div className="bg-white px-4 pt-4 pb-24 space-y-4">

          {/* Balance Stats Row */}
          <div className="grid grid-cols-3 divide-x divide-dc-pink border-2 border-dc-teal rounded-2xl overflow-hidden">
            <div className="p-3 text-center min-w-0">
              {isLoadingStatus ? (
                <Skeleton className="h-6 w-14 mx-auto mb-1" />
              ) : (
                <p className="text-base font-extrabold text-gray-900 truncate">
                  {formatCurrency(payoutStatus?.availableBalance || 0)}
                </p>
              )}
              <p className="text-xs text-gray-500 leading-tight">Stripe Bal.</p>
            </div>
            <div className="p-3 text-center min-w-0">
              {isLoadingStatus ? (
                <Skeleton className="h-6 w-14 mx-auto mb-1" />
              ) : (
                <p className={`text-base font-extrabold truncate ${canWithdraw ? 'text-green-600' : 'text-amber-600'}`}>
                  {formatCurrency(payoutStatus?.platformPendingBalance || 0)}
                </p>
              )}
              <p className="text-xs text-gray-500 leading-tight">Wallet</p>
            </div>
            <div className="p-3 text-center min-w-0">
              {isLoadingEarnings ? (
                <Skeleton className="h-6 w-14 mx-auto mb-1" />
              ) : (
                <p className="text-base font-extrabold text-gray-900 truncate">
                  {formatCurrency(totalEarnings)}
                </p>
              )}
              <p className="text-xs text-gray-500 leading-tight">Total Earned</p>
            </div>
          </div>

          {/* Payout Account Card */}
          <div className="border-2 border-dc-teal rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-dc-teal" />
              <h2 className="font-bold text-gray-900 uppercase tracking-wide text-sm">Payout Account</h2>
            </div>

            {isLoadingStatus ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ) : isStatusError ? (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Unable to load payout status</AlertTitle>
                <AlertDescription>Could not connect to the payment service. Please refresh.</AlertDescription>
              </Alert>
            ) : payoutStatus?.onboardingComplete ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-green-100 rounded-full shrink-0">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">Stripe Connected</p>
                    <p className="text-xs text-gray-500 break-words">Your bank account is set up for payouts</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-dc-teal text-dc-teal font-bold"
                  onClick={() => openDashboardMutation.mutate()}
                  disabled={openDashboardMutation.isPending}
                >
                  {openDashboardMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-gray-100 rounded-full shrink-0">
                    <AlertCircle className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">Not Connected</p>
                    <p className="text-xs text-gray-500 break-words">Set up Stripe to withdraw earnings</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="rounded-full bg-dc-teal text-white font-bold"
                  onClick={() => setupStripeMutation.mutate()}
                  disabled={setupStripeMutation.isPending}
                >
                  {setupStripeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-1" />
                  )}
                  Connect
                </Button>
              </div>
            )}
          </div>

          {/* Payment History */}
          <div className="border-2 border-dc-teal rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-dc-teal" />
              <div>
                <h2 className="font-bold text-gray-900 uppercase tracking-wide text-sm">Payment History</h2>
                <p className="text-xs text-gray-500">5% platform fee applied</p>
              </div>
            </div>

            {isLoadingEarnings ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 animate-pulse">
                    <div className="space-y-1">
                      <div className="h-4 bg-gray-200 rounded w-40" />
                      <div className="h-3 bg-gray-200 rounded w-24" />
                    </div>
                    <div className="h-5 w-16 bg-gray-200 rounded-full" />
                  </div>
                ))}
              </div>
            ) : isEarningsError ? (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Unable to load payment history</AlertTitle>
                <AlertDescription>There was a problem fetching your earnings. Please refresh.</AlertDescription>
              </Alert>
            ) : earnings.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">No payments yet</h3>
                <p className="text-sm text-gray-500">Complete projects to start earning!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {earnings.map((payment) => {
                  const displayStatus = getPaymentDisplayStatus(
                    payment.escrowStatus,
                    payoutStatus?.onboardingComplete ?? false,
                    hasPlatformPendingBalance
                  );

                  return (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-bold text-gray-900 text-sm truncate">{payment.campaignTitle}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                          <span className="shrink-0">
                            {payment.date ? format(new Date(payment.date), 'MMM d, yyyy') : 'Date unknown'}
                          </span>
                          <span className="shrink-0">Fee: {formatCurrency(payment.platformFee)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-extrabold text-gray-900 text-sm">
                          {formatCurrency(payment.amount)}
                        </span>
                        {getStatusBadge(displayStatus)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          {earnings.length > 0 && (
            <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Total Platform Fees Paid</span>
                <span className="font-bold text-gray-900">{formatCurrency(totalFees)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Total Projects Completed</span>
                <span className="font-bold text-gray-900">{earnings.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorEarnings;
