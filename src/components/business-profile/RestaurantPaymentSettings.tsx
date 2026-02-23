import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard, ExternalLink, AlertCircle, CheckCircle2, Clock, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface PayoutStatus {
  hasAccount: boolean;
  accountId?: string;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  availableBalance: number;
  pendingBalance: number;
  platformPendingBalance: number;
}

export const RestaurantPaymentSettings = () => {
  const { user } = useAuth();
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const checkPayoutStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-restaurant-payout-status');
      if (error) throw error;
      setPayoutStatus(data);
    } catch (err) {
      console.error('Failed to check payout status:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkPayoutStatus();
  }, [checkPayoutStatus]);

  // Handle Stripe onboarding return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_onboarding') === 'complete') {
      toast({ title: 'Stripe setup updated', description: 'Checking your account status...' });
      checkPayoutStatus();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('stripe_refresh') === 'true') {
      toast({ title: 'Setup incomplete', description: 'Please try connecting again.', variant: 'destructive' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [checkPayoutStatus]);

  const handleConnectStripe = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-restaurant-connect-account');
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to create connect account:', err);
      toast({ title: 'Connection failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-pending-balance');
      if (error) throw error;
      toast({ title: 'Withdrawal successful', description: data?.message || 'Funds transferred to your Stripe account.' });
      checkPayoutStatus();
    } catch (err) {
      console.error('Withdrawal failed:', err);
      toast({ title: 'Withdrawal failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setWithdrawing(false);
    }
  };

  const getStatusBadge = () => {
    if (!payoutStatus?.hasAccount) {
      return <Badge variant="outline" className="text-muted-foreground"><AlertCircle className="w-3 h-3 mr-1" /> Not Connected</Badge>;
    }
    if (!payoutStatus.onboardingComplete) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-300"><Clock className="w-3 h-3 mr-1" /> Verification Pending</Badge>;
    }
    return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Payment Settings</CardTitle>
        </CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">Loading payment status...</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Payment Settings</CardTitle>
        <CardDescription>Manage your Stripe account to receive sponsorship payments</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Stripe Account Status</span>
          {getStatusBadge()}
        </div>

        {!payoutStatus?.hasAccount && (
          <div className="rounded-lg border border-dashed p-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect a Stripe account to receive sponsorship payments directly.
            </p>
            <Button onClick={handleConnectStripe} disabled={connecting} className="bg-pink-600 hover:bg-pink-700">
              <ExternalLink className="w-4 h-4 mr-2" />
              {connecting ? 'Connecting...' : 'Connect Stripe Account'}
            </Button>
          </div>
        )}

        {payoutStatus?.hasAccount && !payoutStatus.onboardingComplete && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-3">
            <p className="text-sm text-yellow-800">
              Your Stripe account setup is incomplete. Please finish verification to receive payouts.
            </p>
            <Button onClick={handleConnectStripe} disabled={connecting} variant="outline">
              <ExternalLink className="w-4 h-4 mr-2" />
              {connecting ? 'Loading...' : 'Complete Setup'}
            </Button>
          </div>
        )}

        {payoutStatus?.hasAccount && payoutStatus.onboardingComplete && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm text-green-800">
              ✓ Your Stripe account is fully set up and ready to receive sponsorship payments.
            </p>
          </div>
        )}

        {/* Platform pending balance */}
        {(payoutStatus?.platformPendingBalance ?? 0) > 0 && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Platform Wallet</span>
              </div>
              <span className="text-lg font-bold">${(payoutStatus?.platformPendingBalance ?? 0).toFixed(2)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Funds from completed sponsorships waiting to be transferred to your Stripe account.
            </p>
            {payoutStatus?.onboardingComplete ? (
              <Button onClick={handleWithdraw} disabled={withdrawing} size="sm" className="bg-pink-600 hover:bg-pink-700">
                {withdrawing ? 'Withdrawing...' : 'Withdraw to Stripe'}
              </Button>
            ) : (
              <p className="text-xs text-yellow-700">Connect Stripe above to withdraw these funds.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
