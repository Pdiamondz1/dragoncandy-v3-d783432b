import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
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
  useConnectTikTok,
  useDisconnectTikTok,
  useTikTokConnection,
} from '@/hooks/useTikTokConnection';
import {
  useRefreshTikTokInsights,
  useTikTokInsights,
  type TikTokInsights,
} from '@/hooks/useTikTokInsights';

/**
 * Reasons the callback can hand back. Anything unrecognised falls through to a
 * generic line rather than printing a raw code at the user — but the code is
 * still shown so a support conversation has something to go on.
 */
const REASON_COPY: Record<string, string> = {
  access_denied: 'You cancelled the TikTok connection. Nothing was changed.',
  no_code: 'TikTok did not send back a connection code. Start the connection again.',
  state_expired: 'That took too long and the request expired. Start the connection again.',
  bad_state: 'That connection link was not valid. Start the connection again.',
  exchange_failed: 'TikTok rejected the connection. Try again.',
  storage_failed: 'We could not save the connection. Try again.',
  not_configured: 'TikTok is not configured on this environment yet.',
};

/** Read and clear the `?tiktok=…` params the OAuth callback lands with. */
function useCallbackResult(onConnected: () => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('tiktok');
    if (!outcome) return;

    if (outcome === 'connected') {
      const username = params.get('username');
      toast({
        title: 'TikTok connected',
        description: username
          ? `Reading analytics for ${username.startsWith('@') ? username : `@${username}`}.`
          : 'Reading analytics for your account.',
      });
      onConnected();
    } else {
      const reason = params.get('reason') ?? '';
      const cancelled = reason === 'access_denied';
      toast({
        title: cancelled ? 'TikTok connection cancelled' : 'Could not connect TikTok',
        description: REASON_COPY[reason] ?? `Something went wrong${reason ? ` (${reason})` : ''}.`,
        variant: cancelled ? 'default' : 'destructive',
      });
    }

    // Clear the params so a refresh does not replay the toast.
    params.delete('tiktok');
    params.delete('reason');
    params.delete('username');
    const search = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
    // Deliberately runs once on mount: the params are consumed and removed, so a
    // dependency on them would re-run against a URL this effect just changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * A metric TikTok did not return renders as an em dash, never as 0.
 *
 * `value?.toLocaleString() ?? '0'` is the shape that quietly undoes the server's
 * care — it is the last place a fabricated zero can appear, after every guard
 * upstream got it right. See [[Honest Analytics]].
 */
function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-dc-text">
        {value === null || value === undefined ? '—' : value.toLocaleString()}
      </p>
      <p className="text-xs text-dc-text-muted">{label}</p>
    </div>
  );
}

function InsightsSummary({
  insights,
  cachedAt,
  openId,
}: {
  insights: TikTokInsights;
  cachedAt: string | null;
  openId: string;
}) {
  const refresh = useRefreshTikTokInsights(openId);
  const { totals, videos_counted, has_more, account } = insights;

  return (
    <AppCard variant="inset" pad="5" className="mt-3">
      <div className="grid grid-cols-4 gap-2">
        <Metric label="Followers" value={account.follower_count} />
        <Metric label="Likes" value={account.likes_count} />
        <Metric label="Videos" value={account.video_count} />
        <Metric label="Views" value={totals.views} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Likes (recent)" value={totals.likes} />
        <Metric label="Comments" value={totals.comments} />
        <Metric label="Shares" value={totals.shares} />
      </div>

      <p className="mt-3 text-center text-xs text-dc-text-muted">
        {videos_counted === 0
          ? 'No videos in the window we can read.'
          : /*
             * SAY WHAT WAS MEASURED, NOT WHAT WAS ASKED FOR. TikTok caps a page
             * at 20, so these totals describe recent videos rather than an
             * account lifetime. `has_more` is reported rather than hidden —
             * implying completeness we do not have is the fabrication this rule
             * exists to prevent.
             */
            `From your ${videos_counted} most recent ${videos_counted === 1 ? 'video' : 'videos'}${
              has_more ? ' — you have more than we read here' : ''
            }.`}
      </p>

      <div className="mt-3 flex justify-center">
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
        // Shown because the figures can be up to fifteen minutes old, and a
        // dashboard that looks live but is not is its own small lie.
        <p className="mt-2 text-center text-xs text-dc-text-muted">
          Measured {new Date(cachedAt).toLocaleTimeString()}
        </p>
      )}
    </AppCard>
  );
}

function ConnectionBody() {
  const { data: connection } = useTikTokConnection();
  const needsReconnect = connection?.status === 'needs_reconnect';
  const { data, isLoading, error } = useTikTokInsights(connection?.open_id, {
    enabled: !needsReconnect,
  });

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

  if (!data || !connection) return null;
  return (
    <InsightsSummary
      insights={data.insights}
      cachedAt={data.cached_at}
      openId={connection.open_id}
    />
  );
}

export function TikTokAnalyticsCard() {
  const { data: connection, isLoading, error, refetch } = useTikTokConnection();
  const connect = useConnectTikTok();
  const disconnect = useDisconnectTikTok();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  useCallbackResult(() => void refetch());

  const handleConnect = () => {
    connect.mutate(undefined, {
      onError: (err: unknown) => {
        toast({
          title: 'Could not start',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const needsReconnect = connection?.status === 'needs_reconnect';
  // Prefer the @handle. It is the whole reason the profile scope is requested:
  // display names are not unique, and this line is how a user confirms the right
  // account is linked.
  const handle = connection?.username
    ? `@${connection.username}`
    : (connection?.display_name ?? 'Your account');

  return (
    <AppCard pad="6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0" aria-hidden>
          {/* TikTok has no lucide icon; a plain mark keeps the row aligned with
              the sibling cards without shipping a brand asset. */}
          <span className="text-lg font-bold">♪</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-dc-text">TikTok analytics</h3>
          <p className="mt-1 text-sm text-dc-text-muted">
            Read-only access to your account&rsquo;s performance. This does not post &mdash; your
            existing social connection still handles that.
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="mt-3 flex items-center gap-2 text-xs text-dc-text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking&hellip;
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {error instanceof Error ? error.message : 'Could not check the connection.'}
        </p>
      )}

      {!isLoading && !error && !connection && (
        <div className="mt-4">
          <Button
            variant="dc-primary"
            className="rounded-full"
            onClick={handleConnect}
            disabled={connect.isPending}
          >
            {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect TikTok
          </Button>
        </div>
      )}

      {!isLoading && !error && connection && (
        <div className="mt-4">
          <AppCard variant="inset" pad="5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-dc-text">{handle}</p>
                  {connection.profile_deep_link && (
                    // One tap to check the right account is linked, rather than
                    // trusting a name.
                    <a
                      href={connection.profile_deep_link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-dc-teal-btn"
                      aria-label={`Open ${handle} on TikTok`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-dc-text-muted">
                  {connection.follower_count === null
                    ? '—'
                    : `${connection.follower_count.toLocaleString()} followers`}
                </p>
              </div>

              {needsReconnect ? (
                <AppStatusBadge tone="amber">Reconnect needed</AppStatusBadge>
              ) : (
                <AppStatusBadge tone="teal">
                  <CheckCircle2 className="mr-1 inline h-3 w-3" />
                  Connected
                </AppStatusBadge>
              )}
            </div>

            {needsReconnect && (
              <div className="mt-3">
                <p className="text-xs text-dc-text-muted">
                  {connection.last_error ??
                    'TikTok ended this connection. Reconnect to keep seeing analytics.'}
                </p>
                <Button
                  variant="dc-primary"
                  size="sm"
                  className="mt-2 rounded-full"
                  onClick={handleConnect}
                  disabled={connect.isPending}
                >
                  Reconnect
                </Button>
              </div>
            )}

            <div className="mt-3">
              <Button
                variant="dc-secondary"
                size="sm"
                className="rounded-full"
                onClick={() => setConfirmingDisconnect(true)}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Disconnect
              </Button>
            </div>
          </AppCard>

          <ConnectionBody />
        </div>
      )}

      <AlertDialog open={confirmingDisconnect} onOpenChange={setConfirmingDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect TikTok?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* TikTok HAS a revoke endpoint, so this can promise something the
                  Instagram and Facebook cards deliberately cannot: the grant is
                  actually withdrawn, not merely forgotten on our side. */}
              We&rsquo;ll withdraw our access at TikTok and delete the connection. Your posts and
              your account are untouched, and you can reconnect any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () =>
                    toast({
                      title: 'TikTok disconnected',
                      description: 'We no longer have access to that account.',
                    }),
                  onError: (err: unknown) =>
                    toast({
                      title: 'Could not disconnect',
                      description: err instanceof Error ? err.message : 'Please try again.',
                      variant: 'destructive',
                    }),
                })
              }
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppCard>
  );
}
