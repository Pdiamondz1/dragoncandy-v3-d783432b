import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
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
import { useConnectX, useDisconnectX, useXConnection } from '@/hooks/useXConnection';
import { useRefreshXInsights, useXInsights, type XInsights } from '@/hooks/useXInsights';

/**
 * Reasons the callback can hand back. Anything unrecognised falls through to a
 * generic line rather than printing a raw code at the user — but the code is
 * still shown so a support conversation has something to go on.
 */
const REASON_COPY: Record<string, string> = {
  access_denied: 'You cancelled the X connection. Nothing was changed.',
  no_code: 'X did not send back a connection code. Start the connection again.',
  state_expired: 'That took too long and the request expired. Start the connection again.',
  bad_state: 'That connection link was not valid. Start the connection again.',
  // The unique constraint on the X account id. Refusing is deliberate: two rows
  // on one grant would rotate each other's refresh token away and kill both.
  account_in_use:
    'That X account is already connected to another DragonCandy account. Disconnect it there first.',
  exchange_failed: 'X rejected the connection. Try again.',
  storage_failed: 'We could not save the connection. Try again.',
  not_configured: 'X is not configured on this environment yet.',
};

/** Read and clear the `?x=…` params the OAuth callback lands with. */
function useCallbackResult(onConnected: () => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('x');
    if (!outcome) return;

    const cancelled = outcome === 'error' && /denied/.test(params.get('reason') ?? '');

    if (outcome === 'connected') {
      const username = params.get('username');
      // Surfaced immediately rather than left to be discovered. A connection
      // without offline access is real and stops working in two hours, and
      // finding that out from a card that quietly went stale is worse than
      // being told now.
      const canRefresh = params.get('can_refresh') !== 'false';
      toast({
        title: canRefresh ? 'X connected' : 'X connected — but only for two hours',
        description: canRefresh
          ? username
            ? `Analytics for @${username} are now available.`
            : 'Analytics are now available.'
          : 'Offline access was not granted, so this connection expires in about two hours. ' +
            'Reconnect and leave every permission ticked to keep it.',
        variant: canRefresh ? 'default' : 'destructive',
      });
      onConnected();
    } else {
      const reason = params.get('reason') ?? 'unknown';
      toast({
        title: cancelled ? 'Connection cancelled' : 'X connection failed',
        description: REASON_COPY[reason] ?? `Could not connect (${reason.replace(/_/g, ' ')}).`,
        variant: cancelled ? 'default' : 'destructive',
      });
    }

    // Strip the params so a refresh does not replay the toast.
    params.delete('x');
    params.delete('reason');
    params.delete('username');
    params.delete('can_refresh');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [onConnected]);
}

/**
 * Render a metric X may not have reported at all.
 *
 * A null becomes an em dash, NEVER a zero. The server is careful to send null
 * rather than 0, and `value?.toLocaleString() ?? '0'` here would throw that away
 * at the last step — the easiest place in the whole stack to reintroduce the
 * fabricated zero, because it reads as a defensive default. See [[Honest
 * Analytics]].
 */
function metric(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '—';
}

/**
 * X's logo is not in lucide, and the brand mark is a glyph rather than an icon.
 * Inline so the card does not depend on an asset load for its identity.
 */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * The smallest honest summary: the figures, and the N they rest on.
 *
 * Two counts are shown, not one, and the difference is the point. `posts_counted`
 * is how many posts the totals cover; `posts_with_organic` is how many carried
 * impressions and click data. X supplies organic metrics only for posts under 30
 * days old, so when the second is lower the impression figures describe a SUBSET
 * — and a card that showed one number would imply full coverage it does not have.
 */
function InsightsSummary({ insights, cachedAt }: { insights: XInsights; cachedAt: string | null }) {
  const refresh = useRefreshXInsights();
  const partial =
    insights.posts_with_organic > 0 && insights.posts_with_organic < insights.posts_counted;

  if (insights.posts_counted === 0) {
    return (
      <p className="mt-2 px-3 text-xs text-dc-text-muted">
        No posts in the last {insights.window_days} days.
      </p>
    );
  }

  return (
    <AppCard variant="inset" pad="5" className="mt-2">
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-dc-text-muted">Impressions</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(insights.totals.impressions)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Likes</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(insights.totals.likes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Reposts</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(insights.totals.reposts)}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-center text-xs text-dc-text-muted">
        {insights.posts_counted} {insights.posts_counted === 1 ? 'post' : 'posts'} in{' '}
        {insights.window_days} days
        {partial && (
          <>
            {' '}
            · impressions and clicks cover {insights.posts_with_organic} of them
          </>
        )}
      </p>

      <div className="mt-3 flex items-center justify-center gap-2">
        <Button
          variant="dc-secondary"
          size="sm"
          className="rounded-full"
          onClick={() =>
            refresh.mutate(undefined, {
              onError: (err: unknown) =>
                toast({
                  title: 'Could not refresh',
                  description: err instanceof Error ? err.message : 'Please try again.',
                  variant: 'destructive',
                }),
            })
          }
          disabled={refresh.isPending}
        >
          {refresh.isPending ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Refresh
        </Button>
      </div>

      {cachedAt && (
        // Shown because the figures can be up to fifteen minutes old and a
        // dashboard that looks live but is not is its own small lie. It also
        // explains why Refresh may return the same numbers — the server keeps a
        // floor under it so the button cannot be held down for money.
        <p className="mt-2 text-center text-xs text-dc-text-muted">
          Measured {new Date(cachedAt).toLocaleTimeString()}
        </p>
      )}
    </AppCard>
  );
}

function ConnectionBody() {
  const { data: connection } = useXConnection();
  const needsReconnect = connection?.status === 'needs_reconnect';
  const { data, isLoading, error } = useXInsights({ enabled: !needsReconnect });

  if (needsReconnect) return null;

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
  return <InsightsSummary insights={data.insights} cachedAt={data.cached_at} />;
}

export function XAnalyticsCard() {
  const { data: connection, isLoading, error, refetch } = useXConnection();
  const connect = useConnectX();
  const disconnect = useDisconnectX();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  useCallbackResult(() => void refetch());

  const handleConnect = () => {
    connect.mutate(undefined, {
      onError: (err: unknown) => {
        toast({
          title: 'Could not open X',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: (result) => {
        setConfirmingDisconnect(false);
        toast({
          title: 'X disconnected',
          // Unlike the Instagram card, this one CAN promise the grant is gone —
          // X has a revoke endpoint and the row is only deleted after X reports
          // the token revoked or already dead.
          description:
            result?.revoked === 'already_gone'
              ? 'That account was already disconnected.'
              : 'We withdrew access at X and deleted the stored token.',
        });
      },
      onError: (err: unknown) => {
        setConfirmingDisconnect(false);
        toast({
          title: 'Could not disconnect',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const busy = connect.isPending || disconnect.isPending;
  const needsReconnect = connection?.status === 'needs_reconnect';

  return (
    <AppCard pad="5" className="mt-4">
      <div className="flex items-start gap-3">
        <XLogo className="mt-0.5 h-5 w-5 shrink-0 text-dc-text" />
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-dc-text">X analytics</h4>
          {/* Say what it does NOT do. Posting stays with the existing social
              connection, and a card that only said "connect X" would read as a
              second, competing publishing setup. */}
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
            Checking your account…
          </p>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-600">
            Could not check your X connection. Reload the page to try again.
          </p>
        )}

        {!isLoading && !error && connection && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dc-teal/15 bg-white p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-dc-text">
                    {connection.username ? `@${connection.username}` : connection.x_user_id}
                  </span>
                  {needsReconnect ? (
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
                {!connection.can_refresh && !needsReconnect && (
                  // The two-hour case. Stated plainly on the card rather than
                  // only in a toast the user has already dismissed.
                  <p className="mt-1 text-xs text-amber-700">
                    Offline access was not granted, so this connection expires about two hours
                    after it was made. Reconnect to keep it.
                  </p>
                )}
                {needsReconnect && connection.last_error && (
                  <p className="mt-1 truncate text-xs text-dc-text-muted">
                    {connection.last_error}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {needsReconnect && (
                  <Button
                    variant="dc-primary"
                    size="sm"
                    className="rounded-full"
                    onClick={handleConnect}
                    disabled={busy}
                  >
                    Reconnect
                  </Button>
                )}
                <Button
                  variant="dc-secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setConfirmingDisconnect(true)}
                  disabled={busy}
                >
                  Disconnect
                </Button>
              </div>
            </div>
            <ConnectionBody />
          </>
        )}

        {!isLoading && !error && !connection && (
          <Button
            variant="dc-primary"
            size="sm"
            className="rounded-full"
            onClick={handleConnect}
            disabled={busy}
          >
            {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect X
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirmingDisconnect}
        onOpenChange={(open) => !open && setConfirmingDisconnect(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect X?</AlertDialogTitle>
            {/* This copy CAN promise withdrawal, unlike the Instagram dialog's.
                X documents a revoke endpoint and this flow calls it BEFORE
                deleting the row, so if the revoke fails nothing is deleted and
                the user is asked to retry. Saying "we withdrew access" is
                therefore true whenever the disconnect reports success. */}
            <AlertDialogDescription>
              We will withdraw our access at X and delete the stored token, so DragonCandy can no
              longer read your analytics. Your account, posts and any scheduled publishing are
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
