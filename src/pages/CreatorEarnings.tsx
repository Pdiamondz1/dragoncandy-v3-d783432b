import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Building2
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
}

interface PaymentHistoryItem {
  id: string;
  campaignTitle: string;
  amount: number;
  platformFee: number;
  status: 'paid' | 'pending' | 'processing';
  date: string;
}

const CreatorEarnings: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch payout status
  const { data: payoutStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['creator-payout-status', user?.id],
    queryFn: async (): Promise<PayoutStatus> => {
      const { data, error } = await supabase.functions.invoke('check-creator-payout-status');
      
      if (error) {
        console.error('Error checking payout status:', error);
        throw error;
      }
      
      return {
        hasStripeAccount: !!data?.stripeAccountId,
        onboardingComplete: data?.onboardingComplete ?? false,
        stripeAccountId: data?.stripeAccountId ?? null,
        availableBalance: data?.availableBalance ?? 0,
        pendingBalance: data?.pendingBalance ?? 0,
      };
    },
    enabled: !!user,
  });

  // Fetch earnings history from completed projects
  const { data: earnings = [], isLoading: isLoadingEarnings } = useQuery({
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
        const platformFee = amount * 0.05; // 5% platform fee
        
        return {
          id: collab.id,
          campaignTitle: campaign?.title || 'Unknown Campaign',
          amount: amount - platformFee,
          platformFee,
          status: campaign?.escrow_status === 'released' ? 'paid' : 'pending',
          date: collab.completed_at || '',
        };
      });
    },
    enabled: !!user,
  });

  // Setup Stripe mutation
  const setupStripeMutation = useMutation({
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
      if (data?.url && stripeWindow) {
        stripeWindow.location.href = data.url;
        toast({
          title: 'Stripe Setup Started',
          description: 'Complete your setup in the new tab.',
        });
      } else if (data?.url) {
        // Fallback if popup was blocked
        window.location.href = data.url;
      } else {
        toast({
          title: 'Error',
          description: 'Failed to get Stripe onboarding link.',
          variant: 'destructive',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['creator-payout-status'] });
    },
    onError: (error) => {
      console.error('Stripe setup error:', error);
      toast({
        title: 'Setup Failed',
        description: 'Failed to start Stripe setup. Please try again.',
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
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    },
    onError: (error) => {
      console.error('Dashboard link error:', error);
      toast({
        title: 'Error',
        description: 'Failed to open Stripe dashboard.',
        variant: 'destructive',
      });
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
  const totalFees = earnings.reduce((sum, e) => sum + e.platformFee, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Earnings</h1>
            <p className="text-muted-foreground">Track your earnings and manage payouts</p>
          </div>

          {/* Stripe Setup Banner */}
          {!isLoadingStatus && payoutStatus && !payoutStatus.onboardingComplete && (
            <Alert className={payoutStatus.pendingBalance > 0 ? 'border-amber-500 bg-amber-50' : 'border-primary'}>
              <AlertCircle className={`h-4 w-4 ${payoutStatus.pendingBalance > 0 ? 'text-amber-600' : 'text-primary'}`} />
              <AlertTitle>
                {payoutStatus.pendingBalance > 0 
                  ? `You have ${formatCurrency(payoutStatus.pendingBalance)} pending!`
                  : 'Set Up Your Payout Method'
                }
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {payoutStatus.hasStripeAccount 
                    ? 'Complete your Stripe verification to receive payments directly.'
                    : 'Connect your Stripe account to receive payments for completed projects.'
                  }
                </span>
                <Button 
                  onClick={() => setupStripeMutation.mutate()}
                  disabled={setupStripeMutation.isPending}
                  size="sm"
                  className="ml-4"
                >
                  {setupStripeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  {payoutStatus.hasStripeAccount ? 'Complete Setup' : 'Connect Stripe'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Available Balance */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <Wallet className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Available Balance</p>
                    {isLoadingStatus ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(payoutStatus?.availableBalance || 0)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Ready to withdraw</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pending Balance */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-100 rounded-lg">
                    <Clock className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Pending Balance</p>
                    {isLoadingStatus ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className="text-2xl font-bold text-amber-600">
                        {formatCurrency(payoutStatus?.pendingBalance || 0)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Awaiting processing</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Earnings */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Total Earnings</p>
                    {isLoadingEarnings ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className="text-2xl font-bold text-purple-600">
                        {formatCurrency(totalEarnings)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">All time (after fees)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stripe Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Payout Account
              </CardTitle>
              <CardDescription>Manage your connected Stripe account</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingStatus ? (
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ) : payoutStatus?.onboardingComplete ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-green-100 rounded-full">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Stripe Connected</p>
                      <p className="text-sm text-muted-foreground">
                        Your bank account is set up for payouts
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => openDashboardMutation.mutate()}
                    disabled={openDashboardMutation.isPending}
                  >
                    {openDashboardMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    View Stripe Dashboard
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-full">
                      <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Not Connected</p>
                      <p className="text-sm text-muted-foreground">
                        Set up Stripe to receive direct payouts
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => setupStripeMutation.mutate()}
                    disabled={setupStripeMutation.isPending}
                  >
                    {setupStripeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Connect Stripe
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Payment History
              </CardTitle>
              <CardDescription>
                Your completed project payments (5% platform fee applied)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingEarnings ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  ))}
                </div>
              ) : earnings.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No payments yet</h3>
                  <p className="text-muted-foreground">
                    Complete projects to start earning!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {earnings.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{payment.campaignTitle}</p>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span>
                            {payment.date ? format(new Date(payment.date), 'MMM d, yyyy') : 'Date unknown'}
                          </span>
                          <span className="text-xs">
                            Fee: {formatCurrency(payment.platformFee)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-foreground">
                          {formatCurrency(payment.amount)}
                        </span>
                        {getStatusBadge(payment.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary Card */}
          {earnings.length > 0 && (
            <Card className="bg-muted/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Platform Fees Paid</span>
                  <span className="font-medium">{formatCurrency(totalFees)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Total Projects Completed</span>
                  <span className="font-medium">{earnings.length}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorEarnings;
