import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, CheckCircle2, Clock, Loader2, PackageCheck, Undo2, RotateCcw, ExternalLink } from 'lucide-react';
import { PACKAGES_ENABLED } from '@/lib/featureConfig';
import { useGuestOrder } from '@/hooks/packages/useGuestOrder';
import { usePackageOrderActions } from '@/hooks/packages/usePackageOrderActions';
import { formatUsd } from '@/lib/packagePricing';
import { safeHref } from '@/lib/packageOrders';

const GuestOrderPage = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { order, isLoading, refetch } = useGuestOrder(token);
  const { verify, approve, cancel, requestRevision } = usePackageOrderActions();
  const [verifyStarted, setVerifyStarted] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const sessionId = searchParams.get('session_id');

  // Confirm the payment on return from Stripe. Used by both the auto-run below and a manual retry button, so a
  // transient failure never strands a paid buyer at "Awaiting payment" — they get a toast and a retry.
  const doVerify = useCallback(async () => {
    if (!order || !sessionId) return;
    try {
      const res = await verify.mutateAsync({ orderId: order.order.id, sessionId });
      if (res?.status === 'amount_mismatch' || res?.status === 'duplicate_refunded') {
        toast.info(res.message ?? 'Your payment was refunded.');
      }
      await refetch();
    } catch {
      toast.error("We couldn't confirm your payment. Please tap “Confirm payment” to retry.");
    }
  }, [order, sessionId, verify, refetch]);

  // Auto-verify once on return.
  useEffect(() => {
    if (!order || verifyStarted) return;
    if (sessionId && order.order.escrow_status === 'pending') {
      setVerifyStarted(true);
      doVerify();
    }
  }, [order, verifyStarted, sessionId, doVerify]);

  if (!PACKAGES_ENABLED) return <Navigate to="/" replace />;

  const o = order?.order;
  const guestToken = token ?? '';
  const isHeld = o?.escrow_status === 'held';
  const awaitingApproval = o?.content_status === 'submitted';
  const isComplete = o?.order_status === 'completed';
  const isRefunded = o?.escrow_status === 'refunded' || o?.order_status === 'refunded';
  const isRevisionRequested = o?.order_status === 'revision_requested';
  const canCancel = isHeld && !o?.content_submitted_at && !isComplete && !isRefunded;
  const deliverables = o?.deliverables ?? [];
  // Revisions the buyer purchased (scope_snapshot.revisions; default 1) minus those used. Mirrors the
  // request_package_revision RPC's server-side allowance so we don't offer a button that would just error.
  const revisionsScope = order?.package?.scope as { revisions?: number } | undefined;
  const revisionsAllowed = Math.max(0, typeof revisionsScope?.revisions === 'number' ? revisionsScope.revisions : 1);
  const revisionsRemaining = Math.max(0, revisionsAllowed - (o?.revision_count ?? 0));

  const onApprove = async () => {
    if (!o) return;
    try {
      const res = await approve.mutateAsync({ orderId: o.id, guestToken });
      if (res?.success) {
        toast.success('Approved — the creator has been paid. Thank you!');
        refetch();
      } else {
        toast.error(res?.error ?? 'Could not approve right now. Please try again.');
      }
    } catch {
      toast.error('Could not approve right now. Please try again.');
    }
  };

  const onCancel = async () => {
    if (!o) return;
    try {
      const res = await cancel.mutateAsync({ orderId: o.id, guestToken });
      if (res?.success) {
        toast.success('Your order was cancelled and your payment refunded.');
        refetch();
      } else {
        toast.error(res?.error ?? 'Could not cancel right now. Please try again.');
      }
    } catch {
      toast.error('Could not cancel right now. Please try again.');
    }
  };

  const onRequestRevision = async () => {
    if (!o) return;
    if (revisionNote.trim().length < 3) {
      toast.error('Tell the creator what you’d like changed.');
      return;
    }
    try {
      await requestRevision.mutateAsync({ orderId: o.id, guestToken, note: revisionNote });
      toast.success('Sent — the creator will make your changes.');
      setRevisionOpen(false);
      setRevisionNote('');
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send your revision request. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-xl px-4 py-8">
        {(isLoading || verify.isPending) && (
          <div className="space-y-4">
            {verify.isPending && <p className="text-center text-sm text-muted-foreground">Confirming your payment…</p>}
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        )}

        {!isLoading && !order && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <h1 className="text-xl font-bold text-foreground">Order not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This link may be incorrect or expired.</p>
          </div>
        )}

        {!isLoading && order && o && (
          <>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-xl font-bold text-foreground">{order.package.title}</h1>
                <span className="shrink-0 text-xl font-bold text-primary">{formatUsd(o.price)}</span>
              </div>

              {/* Status */}
              <div className="mt-4">
                {isRefunded ? (
                  <div className="flex items-center gap-2 rounded-xl border border-landing-pink-line bg-landing-pink-soft p-3 text-sm text-landing-pink-ink">
                    <Undo2 className="h-5 w-5 shrink-0" /> This order was cancelled and refunded.
                  </div>
                ) : isComplete ? (
                  <div className="flex items-center gap-2 rounded-xl border border-landing-mint-line bg-landing-mint-soft p-3 text-sm text-landing-mint-ink">
                    <CheckCircle2 className="h-5 w-5 shrink-0" /> Complete — you approved the work and the creator was paid.
                  </div>
                ) : awaitingApproval ? (
                  <div className="flex items-center gap-2 rounded-xl border border-landing-mint-line bg-landing-mint-soft p-3 text-sm text-landing-mint-ink">
                    <PackageCheck className="h-5 w-5 shrink-0" /> Your content is ready — review it and approve to release payment.
                  </div>
                ) : isRevisionRequested ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-landing-lilac p-3 text-sm text-landing-ink">
                    <RotateCcw className="h-5 w-5 shrink-0" /> Revision requested — the creator is updating your content.
                  </div>
                ) : isHeld ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-landing-lilac p-3 text-sm text-landing-ink">
                    <Clock className="h-5 w-5 shrink-0" /> Paid and in progress — {order.package.title} is being worked on.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                    <Clock className="h-5 w-5 shrink-0" /> Awaiting payment.
                  </div>
                )}
              </div>

              {isHeld && !isComplete && !isRefunded && !awaitingApproval && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-landing-mint-line bg-landing-mint-soft p-3 text-sm text-landing-mint-ink">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>Your payment is held safely. It’s only released when you approve the work — refunded if it isn’t delivered.</span>
                </div>
              )}
            </div>

            {/* Delivered work — the links the creator submitted, shown so the buyer reviews before approving */}
            {deliverables.length > 0 && (
              <div className="mt-4 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  {isComplete ? 'Your content' : 'Review your content'}
                </h2>
                <ul className="mt-3 space-y-2">
                  {deliverables.map((d, i) => (
                    <li key={i}>
                      <a
                        href={safeHref(d.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 break-all text-sm text-primary underline underline-offset-2 hover:opacity-80"
                      >
                        {d.label || d.url}
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
                {o.delivery_note && (
                  <p className="mt-3 rounded-xl border border-border bg-background p-3 text-sm text-foreground">{o.delivery_note}</p>
                )}
              </div>
            )}

            {/* Payment confirmation retry — shown if the buyer returned from Stripe but the order isn't held yet */}
            {sessionId && o.escrow_status === 'pending' && (
              <Button onClick={doVerify} disabled={verify.isPending} size="lg" className="mt-4 w-full gap-2">
                {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm payment
              </Button>
            )}

            {/* Actions */}
            {(awaitingApproval || canCancel) && (
              <div className="mt-4 flex flex-col gap-2">
                {awaitingApproval && (
                  <>
                    <Button onClick={onApprove} disabled={approve.isPending} size="lg" className="gap-2">
                      {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve & release payment
                    </Button>
                    {revisionsRemaining <= 0 ? (
                      <p className="text-center text-xs text-muted-foreground">
                        You’ve used {revisionsAllowed === 0 ? 'the' : `all ${revisionsAllowed}`} included revision{revisionsAllowed === 1 ? '' : 's'} on this order.
                      </p>
                    ) : !revisionOpen ? (
                      <Button onClick={() => setRevisionOpen(true)} variant="outline" className="gap-2">
                        <RotateCcw className="h-4 w-4" /> Request a revision{revisionsAllowed > 0 ? ` (${revisionsRemaining} left)` : ''}
                      </Button>
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-3">
                        <Textarea
                          value={revisionNote}
                          onChange={(e) => setRevisionNote(e.target.value)}
                          placeholder="What would you like changed? Be specific — the creator gets this note."
                          rows={3}
                          autoFocus
                        />
                        <div className="mt-2 flex gap-2">
                          <Button onClick={onRequestRevision} disabled={requestRevision.isPending} className="flex-1 gap-2">
                            {requestRevision.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            Send revision request
                          </Button>
                          <Button
                            onClick={() => { setRevisionOpen(false); setRevisionNote(''); }}
                            variant="outline"
                            disabled={requestRevision.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    <p className="text-center text-xs text-muted-foreground">
                      If you don’t respond, payment is released to the creator automatically after 7 days.
                    </p>
                  </>
                )}
                {canCancel && (
                  <Button onClick={onCancel} disabled={cancel.isPending} variant="outline" className="gap-2">
                    {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    Cancel & refund
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GuestOrderPage;
