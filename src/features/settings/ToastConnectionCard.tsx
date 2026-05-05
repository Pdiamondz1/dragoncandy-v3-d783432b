import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  XCircle,
  Unplug,
  Zap,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

type ConnectionStatus = 'not_connected' | 'active' | 'refreshing' | 'error' | 'expired' | 'revoked';

interface ToastConnection {
  id: string;
  restaurant_guid: string;
  status: string;
  token_expires_at: string;
  last_sync_at: string | null;
  error_message: string | null;
  scopes: string[];
  created_at: string;
}

function deriveStatus(conn: ToastConnection | null): ConnectionStatus {
  if (!conn) return 'not_connected';
  if (conn.status === 'error') return 'error';
  if (conn.status === 'revoked') return 'not_connected';
  if (conn.status === 'expired') return 'expired';
  if (new Date(conn.token_expires_at) < new Date()) return 'expired';
  return 'active';
}

const statusConfig: Record<ConnectionStatus, {
  label: string;
  className: string;
  icon: React.ReactNode;
}> = {
  not_connected: {
    label: 'Not Connected',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
    icon: <WifiOff className="w-3 h-3" />,
  },
  active: {
    label: 'Connected',
    className: 'bg-teal-50 text-teal-700 border-teal-200',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  refreshing: {
    label: 'Refreshing',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <RefreshCw className="w-3 h-3 animate-spin" />,
  },
  error: {
    label: 'Error',
    className: 'bg-red-50 text-red-600 border-red-200',
    icon: <XCircle className="w-3 h-3" />,
  },
  expired: {
    label: 'Expired',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <AlertCircle className="w-3 h-3" />,
  },
  revoked: {
    label: 'Not Connected',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
    icon: <WifiOff className="w-3 h-3" />,
  },
};

export const ToastConnectionCard = () => {
  const { user } = useAuth();
  const [connection, setConnection] = useState<ToastConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [restaurantGuid, setRestaurantGuid] = useState('');
  const [notConfigured, setNotConfigured] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const status = deriveStatus(connection);
  const pill = statusConfig[status];

  // --- Fetch connection + business profile ---
  const fetchConnection = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get the user's business profile
      const { data: biz } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (biz) setBusinessId(biz.id);

      const { data: conn } = await supabase
        .from('toast_connections')
        .select('id, restaurant_guid, status, token_expires_at, last_sync_at, error_message, scopes, created_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      setConnection(conn);
    } catch (err) {
      console.error('Failed to fetch Toast connection:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  // Probe Toast config on mount (only when not connected)
  useEffect(() => {
    if (!businessId || connection) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('toast-oauth-start', {
          body: { business_id: businessId },
        });
        if (data?.error === 'toast_not_configured') {
          setNotConfigured(true);
        }
      } catch {
        // Ignore — user will see the error when they click Connect
      }
    })();
  }, [businessId, connection]);

  // Handle return from OAuth flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const toastStatus = params.get('toast_connection');
    if (toastStatus === 'complete') {
      toast({ title: 'Toast connected', description: 'Your Toast POS is now linked.' });
      fetchConnection();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (toastStatus === 'error') {
      const reason = params.get('reason') || 'unknown';
      toast({
        title: 'Toast connection failed',
        description: `Could not connect: ${reason.replace(/_/g, ' ')}. Please try again.`,
        variant: 'destructive',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchConnection]);

  // --- Connect ---
  const handleConnect = async () => {
    if (!businessId) {
      toast({ title: 'No business profile', description: 'Please complete your restaurant profile first.', variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('toast-oauth-start', {
        body: { business_id: businessId, restaurant_guid: restaurantGuid || undefined },
      });
      if (error) {
        if (data?.error === 'toast_not_configured') {
          setNotConfigured(true);
          return;
        }
        throw error;
      }
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (err: unknown) {
      console.error('Toast connect failed:', err);
      const message = err instanceof Error ? err.message : 'Please try again.';
      toast({ title: 'Connection failed', description: message, variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  // --- Test ---
  const handleTest = async () => {
    if (!connection) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('toast-token-refresh', {});
      if (error) {
        if (data?.error === 'toast_not_configured') {
          setNotConfigured(true);
          return;
        }
        throw error;
      }
      toast({
        title: 'Connection healthy',
        description: `Toast responded successfully. ${data?.refreshed || 0} token(s) refreshed.`,
      });
      fetchConnection();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not reach Toast.';
      toast({ title: 'Test failed', description: message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  // --- Disconnect ---
  const handleDisconnect = async () => {
    if (!connection) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('toast_connections')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', connection.id);
      if (error) throw error;

      toast({ title: 'Toast disconnected', description: 'Your connection has been revoked.' });
      setConnection(null);
      setDisconnectOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      toast({ title: 'Disconnect failed', description: message, variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  // --- Loading skeleton ---
  if (loading) {
    return (
      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-5 h-5 text-teal-500" /> Toast POS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-gray-200 overflow-hidden">
        {/* Accent strip */}
        <div className="h-1 bg-gradient-to-r from-teal-400 to-teal-500" />

        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Zap className="w-5 h-5 text-teal-500" />
              Toast POS
            </CardTitle>
            <Badge
              variant="outline"
              className={`flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium border ${pill.className}`}
            >
              {pill.icon}
              {pill.label}
            </Badge>
          </div>
          <CardDescription className="text-sm text-gray-500 mt-1">
            Sync menus, track redemptions, and let Donny read your sales data.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* --- Not connected state --- */}
          {status === 'not_connected' && (
            notConfigured ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 flex items-start gap-3">
                <Zap className="w-5 h-5 text-teal-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-teal-800">
                    Toast integration coming soon
                  </p>
                  <p className="text-sm text-teal-600 mt-1">
                    We're finalizing our partnership with Toast POS. You'll be able to connect here once it's ready.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-5 lg:grid lg:grid-cols-2 lg:gap-6">
                <div className="space-y-3 mb-4 lg:mb-0">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Connect your Toast POS so DragonCandy can read menus and
                    count promotion redemptions at the register.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="restaurant-guid" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Restaurant GUID <span className="normal-case text-gray-400">(optional)</span>
                    </Label>
                    <Input
                      id="restaurant-guid"
                      value={restaurantGuid}
                      onChange={(e) => setRestaurantGuid(e.target.value)}
                      placeholder="e.g. abc12345-def6-7890-ghij-klmnopqrstuv"
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-end lg:justify-end">
                  <Button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="w-full lg:w-auto rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold px-8"
                  >
                    {connecting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4 mr-2" />
                    )}
                    {connecting ? 'Connecting…' : 'Connect Toast'}
                  </Button>
                </div>
              </div>
            )
          )}

          {/* --- Connected / Error / Expired state --- */}
          {status !== 'not_connected' && connection && (
            <div className="space-y-4">
              {/* Info grid */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-3 space-y-2 lg:space-y-0">
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Restaurant</span>
                  <p className="text-sm font-mono text-gray-700 truncate">{connection.restaurant_guid || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Last Sync</span>
                  <p className="text-sm text-gray-700">
                    {connection.last_sync_at
                      ? new Date(connection.last_sync_at).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Token Expires</span>
                  <p className="text-sm text-gray-700">
                    {new Date(connection.token_expires_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Scopes</span>
                  <p className="text-sm text-gray-700">{connection.scopes?.join(', ') || '—'}</p>
                </div>
              </div>

              {/* Error banner */}
              {(status === 'error' || status === 'expired') && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">
                      {status === 'expired' ? 'Token expired' : 'Connection error'}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      {connection.error_message || 'Try reconnecting or testing the connection.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Actions row */}
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Button
                  onClick={handleTest}
                  disabled={testing}
                  variant="outline"
                  className="rounded-full border-teal-300 text-teal-700 hover:bg-teal-50 font-medium"
                >
                  {testing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  {testing ? 'Testing…' : 'Test Connection'}
                </Button>
                <Button
                  onClick={() => setDisconnectOpen(true)}
                  variant="outline"
                  className="rounded-full border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 font-medium"
                >
                  <Unplug className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Disconnect confirmation modal --- */}
      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Disconnect Toast POS?</DialogTitle>
            <DialogDescription className="text-gray-500">
              This will revoke DragonCandy's access to your Toast account.
              Existing redemption data is preserved, but no new syncs will occur.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button
              variant="outline"
              onClick={() => setDisconnectOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-full bg-red-500 hover:bg-red-600 text-white"
            >
              {disconnecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Unplug className="w-4 h-4 mr-2" />
              )}
              {disconnecting ? 'Disconnecting…' : 'Yes, Disconnect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
