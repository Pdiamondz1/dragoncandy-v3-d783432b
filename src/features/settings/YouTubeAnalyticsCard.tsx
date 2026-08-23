import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Youtube } from 'lucide-react';
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import {
  useConnectYouTube,
  useDisconnectYouTube,
  useYouTubeConnections,
  type YouTubeConnection,
} from '@/hooks/useYouTubeConnection';
import { useYouTubeAnalytics } from '@/hooks/useYouTubeAnalytics';

const SUMMARY_DAYS = 28;

/**
 * Reasons the callback can hand back. Anything unrecognised falls through to a
 * generic line rather than printing a raw code at the user — but the code is
 * still shown in the description so a support conversation has something to go on.
 */
const REASON_COPY: Record<string, string> = {
  access_denied: 'You cancelled the YouTube connection. Nothing was changed.',
  no_channel: 'That Google account has no YouTube channel yet. Pick a different account.',
  no_refresh_token:
    'Google did not return a long-lived token. Try again, and choose "Allow" on every screen.',
  state_expired: 'That took too long and the request expired. Start the connection again.',
  bad_state: 'That connection link was not valid. Start the connection again.',
  // Reachable when the user unticks a permission on Google's consent screen.
  // The channel IS linked, but without analytics access it can answer nothing,
  // so this is reported as a failure rather than a success.
  missing_scope:
    'Your channel was linked, but analytics access was not granted. Reconnect and leave every permission ticked.',
  exchange_failed: 'Google rejected the connection. Try again.',
  save_failed: 'We could not save the connection. Try again.',
  not_configured: 'YouTube is not configured on this environment yet.',
};

/** Read and clear the `?youtube=…` params the OAuth callback lands with. */
function useCallbackResult(onConnected: () => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('youtube');
    if (!outcome) return;

    if (outcome === 'connected') {
      const channel = params.get('channel');
      toast({
        title: 'YouTube connected',
        description: channel
          ? `Analytics for ${channel} are now available.`
          : 'Analytics are now available.',
      });
      onConnected();
    } else {
      const reason = params.get('reason') ?? 'unknown';
      toast({
        title: reason === 'access_denied' ? 'Connection cancelled' : 'YouTube connection failed',
        description: REASON_COPY[reason] ?? `Could not connect (${reason.replace(/_/g, ' ')}).`,
        variant: reason === 'access_denied' ? 'default' : 'destructive',
      });
    }

    // Strip the params so a refresh does not replay the toast.
    params.delete('youtube');
    params.delete('reason');
    params.delete('channel');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }, [onConnected]);
}

/**
 * The smallest honest proof the connection works: three figures and the N they
 * rest on.
 *
 * `days_with_data` is shown rather than the 28 we asked for, because YouTube
 * processes analytics a day or two in arrears and a fresh channel legitimately
 * returns fewer days — or none. Printing "last 28 days" over 3 days of data
 * would be the exact shape of dishonesty [[Honest Analytics]] was written about.
 */
function ChannelSummary({ connection }: { connection: YouTubeConnection }) {
  const { data, isLoading, error } = useYouTubeAnalytics(connection.channel_id, SUMMARY_DAYS, {
    enabled: !connection.needs_reconnect,
  });

  if (connection.needs_reconnect) return null;

  if (isLoading) {
    return (
      <p className="mt-2 flex items-center gap-2 px-3 text-xs text-dc-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading performance…
      </p>
    );
  }

  if (error) {
    return (
      <p className="mt-2 px-3 text-xs text-dc-text-muted">
        {error instanceof Error ? error.message : 'Could not read performance right now.'}
      </p>
    );
  }

  if (!data) return null;

  if (data.days_with_data === 0) {
    return (
      <p className="mt-2 px-3 text-xs text-dc-text-muted">
        No data yet — YouTube reports a day or two behind.
      </p>
    );
  }

  const hoursWatched = Math.round(data.totals.minutes_watched / 60);
  const net = data.totals.net_subscribers;

  return (
    <AppCard variant="inset" pad="5" className="mt-2">
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-dc-text-muted">Views</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {data.totals.views.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Hours watched</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {hoursWatched.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Subscribers</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {net > 0 ? '+' : ''}
            {net.toLocaleString()}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-center text-xs text-dc-text-muted">
        {data.days_with_data} {data.days_with_data === 1 ? 'day' : 'days'} of data, ending{' '}
        {data.range.end_date}
      </p>
    </AppCard>
  );
}

function ConnectionRow({
  connection,
  onReconnect,
  onDisconnect,
  busy,
}: {
  connection: YouTubeConnection;
  onReconnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dc-teal/15 bg-white p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-dc-text">
            {connection.channel_title || connection.channel_id}
          </span>
          {connection.needs_reconnect ? (
            <AppStatusBadge tone="amber">
              <AlertCircle className="mr-1 h-3 w-3" />
              Reconnect needed
            </AppStatusBadge>
          ) : (
            <AppStatusBadge tone="teal">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Connected
            </AppStatusBadge>
          )}
        </div>
        {connection.google_email && (
          <p className="truncate text-xs text-dc-text-muted">{connection.google_email}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {connection.needs_reconnect && (
          <Button variant="dc-primary" size="sm" className="rounded-full" onClick={onReconnect} disabled={busy}>
            Reconnect
          </Button>
        )}
        <Button
          variant="dc-secondary"
          size="sm"
          className="rounded-full"
          onClick={onDisconnect}
          disabled={busy}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

export function YouTubeAnalyticsCard() {
  const { data: connections, isLoading, error, refetch } = useYouTubeConnections();
  const connect = useConnectYouTube();
  const disconnect = useDisconnectYouTube();
  const [pendingDisconnect, setPendingDisconnect] = useState<YouTubeConnection | null>(null);

  useCallbackResult(() => void refetch());

  const handleConnect = () => {
    connect.mutate(undefined, {
      onError: (err: unknown) => {
        toast({
          title: 'Could not open YouTube',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const handleDisconnect = () => {
    const target = pendingDisconnect;
    if (!target) return;
    disconnect.mutate(target.channel_id, {
      onSuccess: () => {
        setPendingDisconnect(null);
        toast({
          title: 'YouTube disconnected',
          description: `We no longer have access to ${target.channel_title || 'that channel'}.`,
        });
      },
      onError: (err: unknown) => {
        setPendingDisconnect(null);
        toast({
          title: 'Could not disconnect',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const busy = connect.isPending || disconnect.isPending;

  return (
    <AppCard pad="5" className="mt-4">
      <div className="flex items-start gap-3">
        <Youtube className="mt-0.5 h-5 w-5 shrink-0 text-dc-pink-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-dc-text">YouTube analytics</h4>
          {/* Say what it does NOT do. Posting stays with the existing social
              connection, and a card that only said "connect YouTube" would read
              as a second, competing publishing setup. */}
          <p className="text-sm text-dc-text-muted">
            Read-only access to your channel's performance. This does not post — your existing
            social connection still handles that.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-dc-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your channels…
          </p>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-600">
            Could not check your YouTube connection. Reload the page to try again.
          </p>
        )}

        {!isLoading &&
          !error &&
          connections?.map((connection) => (
            <div key={connection.channel_id}>
              <ConnectionRow
                connection={connection}
                busy={busy}
                onReconnect={handleConnect}
                onDisconnect={() => setPendingDisconnect(connection)}
              />
              <ChannelSummary connection={connection} />
            </div>
          ))}

        {!isLoading && !error && (
          <Button
            variant={connections?.length ? 'dc-secondary' : 'dc-primary'}
            size="sm"
            className="rounded-full"
            onClick={handleConnect}
            disabled={busy}
          >
            {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {connections?.length ? 'Connect another channel' : 'Connect YouTube'}
          </Button>
        )}
      </div>

      <AlertDialog
        open={!!pendingDisconnect}
        onOpenChange={(open) => !open && setPendingDisconnect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this channel?</AlertDialogTitle>
            <AlertDialogDescription>
              We will withdraw our access at Google and delete the stored token. Your channel,
              videos and any scheduled posts are untouched — you can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog up while the request runs; it closes in the
                // mutation callbacks, so a slow revoke cannot look like a no-op.
                e.preventDefault();
                handleDisconnect();
              }}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppCard>
  );
}
