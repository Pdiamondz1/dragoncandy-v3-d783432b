import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Facebook, Loader2 } from 'lucide-react';
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
  useConnectFacebook,
  useDisconnectFacebookPage,
  useFacebookConnections,
  type FacebookPageConnection,
} from '@/hooks/useFacebookConnection';
import { useFacebookPageInsights } from '@/hooks/useFacebookInsights';

const SUMMARY_DAYS = 30;

/**
 * Reasons the callback can hand back. Anything unrecognised falls through to a
 * generic line rather than printing a raw code at the user — though the code is
 * still shown so a support conversation has something to go on.
 */
const REASON_COPY: Record<string, string> = {
  user_denied: 'You cancelled the Facebook connection. Nothing was changed.',
  access_denied: 'You cancelled the Facebook connection. Nothing was changed.',
  // The one case that is genuinely not a fault and cannot be retried into
  // working. A personal profile is not a Page and never becomes one, so
  // "try again" would be actively misleading advice.
  no_pages:
    'That Facebook account does not manage any Pages. Facebook insights come from a Page — a personal profile cannot provide them.',
  state_expired: 'That took too long and the request expired. Start the connection again.',
  bad_state: 'That connection link was not valid. Start the connection again.',
  exchange_failed: 'Facebook rejected the connection. Try again.',
  storage_failed: 'We could not save the connection. Try again.',
  not_configured: 'Facebook is not configured on this environment yet.',
};

/** Read and clear the `?facebook=…` params the OAuth callback lands with. */
function useCallbackResult(onConnected: () => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('facebook');
    if (!outcome) return;

    const cancelled = outcome === 'error' && /denied/.test(params.get('reason') ?? '');

    if (outcome === 'connected') {
      // One consent can return several Pages, so the count decides the wording.
      // Naming a single Page when three were linked would be a small lie that
      // makes the other two look like they failed.
      const count = Number(params.get('count') ?? '0');
      const page = params.get('page');
      toast({
        title: 'Facebook connected',
        description:
          count === 1 && page
            ? `Insights for ${page} are now available.`
            : `Insights are now available for ${count} Page${count === 1 ? '' : 's'}.`,
      });
      onConnected();
    } else {
      const reason = params.get('reason') ?? 'unknown';
      toast({
        title: cancelled ? 'Connection cancelled' : 'Facebook connection failed',
        description: REASON_COPY[reason] ?? `Could not connect (${reason.replace(/_/g, ' ')}).`,
        variant: cancelled ? 'default' : 'destructive',
      });
    }

    // Strip the params so a refresh does not replay the toast.
    params.delete('facebook');
    params.delete('reason');
    params.delete('count');
    params.delete('page');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [onConnected]);
}

/**
 * Render a metric Facebook may not have reported at all.
 *
 * An absent key becomes an em dash, NEVER a zero. The server is careful to omit
 * a metric rather than send 0, and `value?.toLocaleString() ?? '0'` here would
 * throw that away at the last step — the easiest place in the whole stack to
 * reintroduce the fabricated zero, because it reads as a defensive default.
 * See [[Honest Analytics]].
 */
function metric(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '—';
}

function PageSummary({ connection }: { connection: FacebookPageConnection }) {
  const { data, isLoading, error } = useFacebookPageInsights(connection.page_id, SUMMARY_DAYS, {
    enabled: connection.status === 'active' && connection.can_read_insights,
  });

  // A Page whose role lacks ANALYZE can never answer, so there is nothing to
  // load and no error worth showing here — the row itself explains it.
  if (!connection.can_read_insights || connection.status !== 'active') return null;

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
        No data yet — Facebook reports a couple of days behind.
      </p>
    );
  }

  const follows = data.totals.page_daily_follows;
  const unfollows = data.totals.page_daily_unfollows;
  // Only computed when BOTH are present. A net figure derived from one of them
  // is a different number wearing the same label.
  const net =
    typeof follows === 'number' && typeof unfollows === 'number' ? follows - unfollows : undefined;

  return (
    <AppCard variant="inset" pad="5" className="mt-2">
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-dc-text-muted">Page views</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(data.totals.page_views_total)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Engagements</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {metric(data.totals.page_post_engagements)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dc-text-muted">Net follows</dt>
          <dd className="text-lg font-extrabold tabular-nums text-dc-text">
            {/* Sign shown explicitly: a net loss is information, and rendering
                −12 as 12 would invert the only figure a business acts on. */}
            {typeof net === 'number' ? `${net > 0 ? '+' : ''}${net.toLocaleString()}` : '—'}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-center text-xs text-dc-text-muted">
        {data.days_with_data} {data.days_with_data === 1 ? 'day' : 'days'} of data
      </p>

      {/* Meta deprecated 85 Page metrics across all API versions in June 2026 and
          will do it again. Saying which ones are gone is what stops a reader
          concluding the number was zero — the two look identical otherwise. */}
      {data.unavailable_metrics.length > 0 && (
        <p className="mt-2 text-center text-xs text-dc-text-muted">
          Facebook no longer reports:{' '}
          {data.unavailable_metrics.map((m) => m.replace(/^page_/, '').replace(/_/g, ' ')).join(', ')}.
        </p>
      )}
    </AppCard>
  );
}

function PageRow({
  connection,
  onReconnect,
  onDisconnect,
  busy,
}: {
  connection: FacebookPageConnection;
  onReconnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  const needsReconnect = connection.status === 'needs_reconnect';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dc-teal/15 bg-white p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-dc-text">
            {connection.page_name ?? connection.page_id}
          </span>
          {needsReconnect ? (
            <AppStatusBadge tone="amber">
              <AlertCircle className="mr-1 h-3 w-3" />
              Reconnect needed
            </AppStatusBadge>
          ) : connection.can_read_insights ? (
            <AppStatusBadge tone="teal">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Connected
            </AppStatusBadge>
          ) : (
            /* Linked but useless, and it must not read as "Connected". The
               account holds a Page role without the Analyze task, so every
               insights call would fail with an error naming nothing the user
               could act on. Saying it here, in the row, is the difference
               between a fixable problem and a mystery. */
            <AppStatusBadge tone="amber">
              <AlertCircle className="mr-1 h-3 w-3" />
              No analytics access
            </AppStatusBadge>
          )}
        </div>
        {typeof connection.followers_count === 'number' && (
          <p className="truncate text-xs text-dc-text-muted">
            {connection.followers_count.toLocaleString()} followers
          </p>
        )}
        {!connection.can_read_insights && (
          <p className="mt-1 max-w-md text-xs text-dc-text-muted">
            This Page did not grant analytics access. Reconnect with an account that has the
            Analyze permission on the Page.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(needsReconnect || !connection.can_read_insights) && (
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

export function FacebookPageInsightsCard() {
  const { data: connections, isLoading, error, refetch } = useFacebookConnections();
  const connect = useConnectFacebook();
  const disconnect = useDisconnectFacebookPage();
  const [pendingDisconnect, setPendingDisconnect] = useState<FacebookPageConnection | null>(null);

  useCallbackResult(() => void refetch());

  const handleConnect = () => {
    connect.mutate(undefined, {
      onError: (err: unknown) => {
        toast({
          title: 'Could not open Facebook',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const handleDisconnect = () => {
    const target = pendingDisconnect;
    if (!target) return;
    disconnect.mutate(target.page_id, {
      onSuccess: (result) => {
        setPendingDisconnect(null);
        // The wording depends on what actually happened at Meta. `expired` is
        // the honest awkward case: we deleted our copy but could not tell
        // Facebook, because the permission that does that lapses while the Page
        // token does not.
        toast({
          title: 'Facebook Page disconnected',
          description:
            result?.revoked === 'expired'
              ? (result.message ??
                'Disconnected here, but Facebook could not be told. Remove DragonCandy under Facebook Settings → Business Integrations.')
              : 'We withdrew access at Facebook and deleted the stored token.',
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
        <Facebook className="mt-0.5 h-5 w-5 shrink-0 text-dc-teal-btn" aria-hidden />
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-dc-text">Facebook Page insights</h4>
          {/* Say what it does NOT do, and say it needs a Page. Both are the
              questions this card actually gets asked: there is already a button
              on this page that connects social accounts for POSTING, and a
              personal Facebook profile cannot serve insights at all. */}
          <p className="text-sm text-dc-text-muted">
            Read-only access to your Facebook Page's performance. This does not post — your
            existing social connection still handles that. You'll need a Facebook Page; a personal
            profile can't provide insights.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-dc-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your Pages…
          </p>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-600">
            Could not check your Facebook connection. Reload the page to try again.
          </p>
        )}

        {!isLoading &&
          !error &&
          connections?.map((connection) => (
            <div key={connection.page_id}>
              <PageRow
                connection={connection}
                busy={busy}
                onReconnect={handleConnect}
                onDisconnect={() => setPendingDisconnect(connection)}
              />
              <PageSummary connection={connection} />
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
            {connections?.length ? 'Connect another Page' : 'Connect Facebook Page'}
          </Button>
        )}
      </div>

      <AlertDialog
        open={!!pendingDisconnect}
        onOpenChange={(open) => !open && setPendingDisconnect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this Page?</AlertDialogTitle>
            {/* Unlike the Instagram dialog, this one CAN promise the withdrawal:
                Facebook has a revoke endpoint, so disconnect revokes before it
                deletes the row that holds the only copy of the token. The one
                exception — a lapsed user token — is reported in the toast rather
                than hedged here, because hedging every case would make the
                normal one sound uncertain. */}
            <AlertDialogDescription>
              We will withdraw DragonCandy's access at Facebook and delete the stored token, so we
              can no longer read this Page's insights. Your Page, its posts and any scheduled
              publishing are untouched, and you can reconnect at any time.
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
