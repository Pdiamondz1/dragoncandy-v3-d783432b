import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, AlertCircle, CheckCircle2, Clock, Wallet, LayoutDashboard, Loader2, Unplug, RefreshCw, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';
import { toast } from 'sonner';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { StripeTestHelper } from '@/components/payments/StripeTestHelper';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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

interface PreviousAccount {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
}

interface StripeConnectSetupProps {
  role: 'creator' | 'business';
}

const ROLE_CONFIG = {
  creator: {
    createFn: 'create-creator-connect-account',
    statusFn: 'check-creator-payout-status',
    mission: 'setup_payouts' as const,
    connectLabel: 'Connect Stripe Account',
    description: 'Connect your Stripe account to receive payments directly from campaigns.',
    connectedLabel: 'Your Stripe account is set up. Payouts are processed automatically after project completion.',
  },
  business: {
    createFn: 'create-restaurant-connect-account',
    statusFn: 'check-restaurant-payout-status',
    mission: 'setup_payments' as const,
    connectLabel: 'Connect Stripe Account',
    description: 'Connect a Stripe account to pay creators directly through the platform.',
    connectedLabel: 'Your Stripe account is fully set up and ready to process payments.',
  },
};

export function StripeConnectSetup({ role }: StripeConnectSetupProps) {
  const { user, activeOrgUnit, activeOrg, refreshActiveOrgUnit } = useAuth();
  const { data: orgUnits = [] } = useOrgUnits(activeOrg?.id);
  const hasMultipleLocations = orgUnits.length > 1;
  const { completeMission } = useFirstRunMissions();
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [previousAccount, setPreviousAccount] = useState<PreviousAccount | null>(null);

  const config = ROLE_CONFIG[role];
  const isTestMode = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_');

  const checkStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = activeOrgUnit ? `?org_unit_id=${activeOrgUnit.id}` : '';
      const { data, error } = await supabase.functions.invoke(`${config.statusFn}${params}`);
      if (error) throw error;
      setStatus(data);
    } catch (err) {
      console.error('Failed to check payout status:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeOrgUnit, config.statusFn]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_onboarding') === 'complete') {
      toast.success('Stripe setup updated — checking your account status...');
      completeMission(config.mission);
      checkStatus().then(() => refreshActiveOrgUnit());
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('stripe_refresh') === 'true') {
      toast.error('Setup incomplete. Please try connecting again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [checkStatus, completeMission, config.mission, refreshActiveOrgUnit]);

  const handleConnect = async (action?: 'reconnect' | 'create_new') => {
    setConnecting(true);
    setPreviousAccount(null);
    try {
      const { data, error } = await supabase.functions.invoke(config.createFn, {
        body: { org_unit_id: activeOrgUnit?.id ?? null, action: action ?? null },
      });
      if (error) throw error;
      if (data?.previousAccount) {
        setPreviousAccount(data.previousAccount);
      } else if (data?.alreadyComplete) {
        toast.success('Stripe account is already connected!');
        completeMission(config.mission);
        checkStatus().then(() => refreshActiveOrgUnit());
      } else if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      console.error('Failed to create connect account:', err);
      const context = (err as { context?: Response })?.context;
      const serverMsg = context ? await context.json().catch(() => null) : null;
      toast.error(serverMsg?.error || 'Connection failed. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDashboard = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-stripe-dashboard-link');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch {
      toast.error('Failed to open dashboard. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-pending-balance');
      if (error) throw error;
      toast.success(data?.message || 'Funds transferred to your Stripe account.');
      checkStatus();
    } catch {
      toast.error('Withdrawal failed. Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('disconnect-stripe-account', {
        body: { org_unit_id: activeOrgUnit?.id ?? null },
      });
      if (error) {
        const context = await (error as { context?: Response }).context?.json?.().catch(() => null);
        if (context?.error === 'BALANCE_REMAINING') {
          toast.error(`You have $${context.balance.toFixed(2)} pending. Withdraw your balance before disconnecting.`);
          return;
        }
        throw error;
      }
      toast.success('Stripe account disconnected.');
      checkStatus().then(() => refreshActiveOrgUnit());
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (!activeOrgUnit && hasMultipleLocations) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
        <p className="text-sm text-amber-800">
          Switch to a specific location to manage its Stripe account.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking payment status...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Stripe Account</span>
        {!status?.hasAccount && (
          <Badge variant="outline" className="text-muted-foreground">
            <AlertCircle className="w-3 h-3 mr-1" /> Not Connected
          </Badge>
        )}
        {status?.hasAccount && !status.onboardingComplete && (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" /> Verification Pending
          </Badge>
        )}
        {status?.hasAccount && status.onboardingComplete && (
          <Badge variant="outline" className="text-green-600 border-green-300">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
          </Badge>
        )}
      </div>

      {/* Previous account found — reconnect or create new */}
      {!status?.hasAccount && previousAccount && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-3">
          <p className="text-sm text-teal-800">
            We found your previous Stripe account. Would you like to reconnect to it or start fresh?
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => handleConnect('reconnect')}
              disabled={connecting}
              size="sm"
              className="rounded-full bg-teal-500 hover:bg-teal-600"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {connecting ? 'Reconnecting...' : 'Reconnect Previous Account'}
            </Button>
            <Button
              onClick={() => handleConnect('create_new')}
              disabled={connecting}
              variant="outline"
              size="sm"
              className="rounded-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Account
            </Button>
          </div>
        </div>
      )}

      {/* Not connected */}
      {!status?.hasAccount && !previousAccount && (
        <div className="rounded-xl border border-dashed p-4 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{config.description}</p>
          <Button
            onClick={() => handleConnect()}
            disabled={connecting}
            className="rounded-full bg-teal-500 hover:bg-teal-600"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {connecting ? 'Connecting...' : config.connectLabel}
          </Button>
          {isTestMode && (
            <p className="text-[10px] text-muted-foreground">
              Test mode: creates a verified sandbox account instantly
            </p>
          )}
        </div>
      )}

      {/* Onboarding incomplete */}
      {status?.hasAccount && !status.onboardingComplete && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 space-y-3">
          <p className="text-sm text-yellow-800">
            Your Stripe account setup is incomplete. Please finish verification to start {role === 'creator' ? 'receiving' : 'processing'} payments.
          </p>
          <Button
            onClick={() => handleConnect()}
            disabled={connecting}
            variant="outline"
            className="rounded-full"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {connecting ? 'Loading...' : 'Complete Setup'}
          </Button>
        </div>
      )}

      {/* Connected */}
      {status?.hasAccount && status.onboardingComplete && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
          <p className="text-sm text-green-800">{config.connectedLabel}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleDashboard}
              disabled={connecting}
              variant="outline"
              size="sm"
              className="rounded-full"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LayoutDashboard className="w-4 h-4 mr-2" />
              )}
              {connecting ? 'Opening...' : 'View Stripe Dashboard'}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={disconnecting || (status?.platformPendingBalance ?? 0) > 0}
                >
                  <Unplug className="w-4 h-4 mr-2" />
                  {disconnecting ? 'Disconnecting...' : 'Disconnect Account'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Stripe Account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will unlink your Stripe account from DragonCandy. You won't be able to {role === 'creator' ? 'receive' : 'process'} payments until you reconnect.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDisconnect}
                    className="rounded-full bg-red-600 hover:bg-red-700"
                  >
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {(status?.platformPendingBalance ?? 0) > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              Withdraw your balance before disconnecting.
            </p>
          )}
        </div>
      )}

      {/* Platform wallet balance */}
      {(status?.platformPendingBalance ?? 0) > 0 && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Platform Wallet</span>
            </div>
            <span className="text-lg font-bold">
              ${(status?.platformPendingBalance ?? 0).toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Funds waiting to be transferred to your Stripe account.
          </p>
          {status?.onboardingComplete ? (
            <Button
              onClick={handleWithdraw}
              disabled={withdrawing}
              size="sm"
              className="rounded-full bg-teal-500 hover:bg-teal-600"
            >
              {withdrawing ? 'Withdrawing...' : 'Withdraw to Stripe'}
            </Button>
          ) : (
            <p className="text-xs text-yellow-700">
              Connect Stripe above to withdraw these funds.
            </p>
          )}
        </div>
      )}

      <StripeTestHelper variant="bank" />
    </div>
  );
}
