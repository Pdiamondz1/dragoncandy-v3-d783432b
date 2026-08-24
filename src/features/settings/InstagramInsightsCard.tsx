import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Instagram, Loader2 } from 'lucide-react';
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
  useConnectInstagram,
  useDisconnectInstagram,
  useInstagramConnections,
  type InstagramConnection,
} from '@/hooks/useInstagramConnection';
import { useInstagramInsights } from '@/hooks/useInstagramInsights';

const SUMMARY_DAYS = 30;

/**
 * Reasons the callback can hand back. Anything unrecognised falls through to a
 * generic line rather than printing a raw code at the user — but the code is
 * still shown in the description so a support conversation has something to go on.
 */
const REASON_COPY: Record<string, string> = {
  user_denied: 'You cancelled the Instagram connection. Nothing was changed.',
  access_denied: 'You cancelled the Instagram connection. Nothing was changed.',
  no_account: 'That login has no Instagram account. Pick a different one.',
  state_expired: 'That took too long and the request expired. Start the connection again.',
  bad_state: 'That connection link was not valid. Start the connection again.',
  // Reachable when the user unticks a permission on Meta's consent screen. The
  // account IS linked, but without insights access it can answer nothing, so
  // this is reported as a failure rather than a success.
  missing_permission:
    'Your account was linked, but insights access was not granted. Reconnect and leave every permission ticked.',
  exchange_failed: 'Instagram rejected the connection. Try again.',
  save_failed: 'We could not save the connection. Try again.',
  not_configured: 'Instagram is not configured on this environment yet.',
};

/** Read and clear the `?instagram=…` params the OAuth callback lands with. */
function useCallbackResult(onConnected: () => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('instagram');
    if (!outcome) return;

    const cancelled = outcome === 'error' && /denied/.test(params.get('reason') ?? '');

    if (outcome === 'connected') {
      const account = params.get('account');
      toast({
        title: 'Instagram connected',
        description: account
          ? `Insights for @${account} are now available.`
          : 'Insights are now available.',
      });
      onConnected();
    } else {
      const reason = params.get('reason') ?? 'unknown';
      toast({
        title: cancelled ? 'Connection cancelled' : 'Instagram connection failed',
        description: REASON_COPY[reason] ?? `Could not connect (${reason.replace(/_/g, ' ')}).`,
        variant: cancelled ? 'default' : 'destructive',
      });
    }

    // Strip the params so a refresh does not replay the toast.
    params.delete('instagram');
    params.delete('reason');
    params.delete('account');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }, [onConnected]);
}

/**
 * Render a metric that Instagram may not have reported at all.
 *
 * An absent key becomes an em dash, NEVER a zero. The server is careful to omit
 * a metric rather than send 0 for it, and `value?.toLocaleString() ?? '0'` here
 * would throw that away at the last step — which is the easiest place in the
 * whole stack to reintroduce the fabricated zero, because it reads as a
 * defensive default. See [[Honest Analytics]].
 */
function metric(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '—';
}

/**
 * The smallest honest proof the connection works: three figures and the N they
 * rest on.
 *
 * `days_with_data` is shown rather than the 30 we asked for, because Meta
 * processes insights up to 48 hours in arrears and a quiet account legitimately
 * returns fewer days — or none.
 */
function AccountSummary({ connection }: { connection: InstagramConnection }) {
  const { data, isLoading, error } = useInstagramInsights(connection.ig_user_id, SUMMARY_DAYS, {
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
        No data yet — Instagram reports up to two days behind.
      </p>
    );
  }

  return (
    <AppCard variant="inset" pad="5" className="mt-2">
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-dc-text-muted">Reach</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(data.totals.reach)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Views</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(data.totals.views)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Interactions</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(data.totals.total_interactions)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-center text-xs text-dc-text-muted">
        {data.days_with_data} {data.days_with_data === 1 ? 'day' : 'days'} of data
        {data.interactions_per_reach !== null && (
          <> · {(data.interactions_per_reach * 100).toFixed(1)}% of reach interacted</>
        )}
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
  connection: InstagramConnection;
  onReconnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dc-teal/15 bg-white p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-dc-text">
            {connection.username ? `@${connection.username}` : connection.ig_user_id}
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
        {typeof connection.followers_count === 'number' && (
          <p className="truncate text-xs text-dc-text-muted">
            {connection.followers_count.toLocaleString()} followers
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {connection.needs_reconnect && (
          <Button
            variant="dc-primary"
            size="sm"
            className="rounded-full"
            onClick={onReconnect}
            disabled={busy}
          >
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

export function InstagramInsightsCard() {
  const { data: connections, isLoading, error, refetch } = useInstagramConnections();
  const connect = useConnectInstagram();
  const disconnect = useDisconnectInstagram();
  const [pendingDisconnect, setPendingDisconnect] = useState<InstagramConnection | null>(null);

  useCallbackResult(() => void refetch());

  const handleConnect = () => {
    connect.mutate(undefined, {
      onError: (err: unknown) => {
        toast({
          title: 'Could not open Instagram',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const handleDisconnect = () => {
    const target = pendingDisconnect;
    if (!target) return;
    disconnect.mutate(target.ig_user_id, {
      onSuccess: (result) => {
        setPendingDisconnect(null);
        // The wording depends on what actually happened at Meta, because we
        // cannot promise the grant is gone — see the dialog copy below.
        toast({
          title: 'Instagram disconnected',
          description: result?.revoked_at_instagram
            ? 'We deleted the stored token and withdrew access at Instagram.'
            : 'We deleted the stored token. To remove the authorization on Instagram, open Settings → Website permissions → Apps and websites.',
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
        <Instagram className="mt-0.5 h-5 w-5 shrink-0 text-dc-pink-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-dc-text">Instagram insights</h4>
          {/* Say what it does NOT do. Posting stays with the existing social
              connection, and a card that only said "connect Instagram" would
              read as a second, competing publishing setup — there is already a
              button on this page that does exactly that. */}
          <p className="text-sm text-dc-text-muted">
            Read-only access to your account's performance. This does not post — your existing
            social connection still handles that.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-dc-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your accounts…
          </p>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-600">
            Could not check your Instagram connection. Reload the page to try again.
          </p>
        )}

        {!isLoading &&
          !error &&
          connections?.map((connection) => (
            <div key={connection.ig_user_id}>
              <ConnectionRow
                connection={connection}
                busy={busy}
                onReconnect={handleConnect}
                onDisconnect={() => setPendingDisconnect(connection)}
              />
              <AccountSummary connection={connection} />
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
            {connections?.length ? 'Connect another account' : 'Connect Instagram'}
          </Button>
        )}
      </div>

      <AlertDialog
        open={!!pendingDisconnect}
        onOpenChange={(open) => !open && setPendingDisconnect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this account?</AlertDialogTitle>
            {/* This copy is deliberately NOT the YouTube dialog's. That one says
                "we will withdraw our access at Google", which is true there and
                would be a lie here: Meta documents no revoke for the Instagram
                Login path, so all we can promise is that our copy of the token
                is destroyed. Saying more would be the kind of reassurance that
                is only discovered to be false by someone checking their
                Instagram settings. */}
            <AlertDialogDescription>
              We will delete the stored token, so DragonCandy can no longer read your insights.
              Instagram keeps its own record of the authorization — you can remove that under
              Settings → Website permissions. Your account, posts and any scheduled publishing are
              untouched, and you can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog up while the request runs; it closes in the
                // mutation callbacks, so a slow request cannot look like a no-op.
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
