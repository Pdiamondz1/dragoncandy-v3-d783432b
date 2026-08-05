import { Navigate, Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, ExternalLink, ShieldCheck, CheckCircle2, Clock, RotateCcw, Undo2, FileText,
} from 'lucide-react';
import { PACKAGES_ENABLED } from '@/lib/featureConfig';
import { useCreatorOrder } from '@/hooks/packages/useCreatorOrders';
import { IntakeSummary } from '@/components/packages/IntakeSummary';
import { DeliverySubmitForm } from '@/components/packages/DeliverySubmitForm';
import { creatorOrderView, orderToneClasses, safeHref } from '@/lib/packageOrders';
import { netPayout, formatUsd } from '@/lib/packagePricing';
import type { CreatorOrder, OrderDeliverable, PackageScope } from '@/types/packages';

const Section = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-border bg-card p-5">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      {icon}
      {title}
    </h2>
    <div className="mt-3">{children}</div>
  </section>
);

const ScopeSummary = ({ scope, turnaround }: { scope: PackageScope; turnaround: number | null }) => {
  const rows: [string, string][] = [];
  if (scope.deliverables?.length)
    rows.push(['Deliverables', scope.deliverables.map((d) => `${d.qty}× ${d.label}`).join(', ')]);
  if (typeof scope.revisions === 'number') rows.push(['Revisions included', String(scope.revisions)]);
  if (typeof scope.asset_count === 'number') rows.push(['Asset count', String(scope.asset_count)]);
  if (typeof scope.travel_radius_mi === 'number') rows.push(['Travel radius', `${scope.travel_radius_mi} mi`]);
  if (turnaround) rows.push(['Turnaround', `${turnaround} days`]);
  if (scope.notes) rows.push(['Notes', scope.notes]);

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No scope details recorded.</p>;
  return (
    <dl className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 text-sm">
          <dt className="shrink-0 text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
};

const DeliverablesList = ({ deliverables, note }: { deliverables: OrderDeliverable[]; note: string | null }) => (
  <div className="space-y-3">
    <ul className="space-y-2">
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
    {note && <p className="rounded-xl border border-border bg-background p-3 text-sm text-foreground">{note}</p>}
  </div>
);

const OrderBody = ({ order, refetch }: { order: CreatorOrder; refetch: () => void }) => {
  const view = creatorOrderView(order);
  const buyer = order.buyer_email ?? 'On-platform buyer';
  const hasDeliverables = order.deliverables.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">{order.package?.title ?? 'Package'}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{buyer}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold text-primary">{formatUsd(netPayout(order.price_snapshot))}</div>
            <div className="text-xs text-muted-foreground">you earn</div>
          </div>
        </div>
        <div className={`mt-4 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${orderToneClasses[view.tone]}`}>
          {view.label}
        </div>
      </div>

      {/* Revision request — surfaced prominently so the creator sees exactly what to change */}
      {order.order_status === 'revision_requested' && (
        <div className="rounded-2xl border border-landing-pink-line bg-landing-pink-soft p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-landing-pink-ink">
            <RotateCcw className="h-4 w-4" /> The buyer asked for a revision
          </h2>
          {order.revision_note ? (
            <p className="mt-2 text-sm text-landing-pink-ink">{order.revision_note}</p>
          ) : (
            <p className="mt-2 text-sm text-landing-pink-ink">They didn’t leave a note — reach out if you’re unsure what to change.</p>
          )}
        </div>
      )}

      {/* The brief — what to make */}
      <Section title="The brief" icon={<FileText className="h-4 w-4 text-primary" />}>
        <IntakeSummary answers={order.intake?.answers} />
      </Section>

      {/* What was sold */}
      <Section title="What’s included">
        <ScopeSummary scope={order.scope_snapshot ?? {}} turnaround={order.turnaround_days_snapshot} />
      </Section>

      {/* Delivery — the state-appropriate action */}
      {view.needsDelivery ? (
        <Section title={order.order_status === 'revision_requested' ? 'Send your revised work' : 'Deliver your work'}>
          <p className="mb-3 flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-landing-mint-ink" />
            The buyer’s payment is held safely. Add links to the finished work — once they approve, you’re paid
            {' '}{formatUsd(netPayout(order.price_snapshot))}.
          </p>
          <DeliverySubmitForm
            orderId={order.id}
            isResubmit={order.order_status === 'revision_requested'}
            onSubmitted={refetch}
          />
        </Section>
      ) : order.order_status === 'submitted' ? (
        <Section title="Delivered — awaiting approval" icon={<Clock className="h-4 w-4 text-primary" />}>
          <p className="mb-3 text-sm text-muted-foreground">
            The buyer can review and approve from their order link. If they don’t respond within 7 days, your
            payment is released automatically.
          </p>
          {hasDeliverables && <DeliverablesList deliverables={order.deliverables} note={order.delivery_note} />}
        </Section>
      ) : order.order_status === 'completed' ? (
        <Section title="Completed & paid" icon={<CheckCircle2 className="h-4 w-4 text-landing-mint-ink" />}>
          <p className="mb-3 text-sm text-muted-foreground">
            The buyer approved your work and {formatUsd(netPayout(order.price_snapshot))} was released to your wallet.
          </p>
          {hasDeliverables && <DeliverablesList deliverables={order.deliverables} note={order.delivery_note} />}
        </Section>
      ) : (
        <Section title="Order closed" icon={<Undo2 className="h-4 w-4 text-muted-foreground" />}>
          <p className="text-sm text-muted-foreground">
            This order was {order.order_status}. No payment was released.
          </p>
        </Section>
      )}
    </div>
  );
};

const PackageOrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { order, isLoading, refetch } = useCreatorOrder(orderId);

  if (!PACKAGES_ENABLED) return <Navigate to="/dashboard/creator" replace />;

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen w-full max-w-full overflow-x-hidden md:mx-auto md:max-w-2xl">
        <div className="px-4 py-6 sm:px-6">
          <Link
            to="/dashboard/creator/orders"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All orders
          </Link>

          <div className="mt-4">
            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-40 rounded-2xl" />
              </div>
            )}

            {!isLoading && !order && (
              <div className="rounded-2xl border border-border bg-card p-10 text-center">
                <h1 className="text-xl font-bold text-foreground">Order not found</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  This order doesn’t exist or isn’t one of yours.
                </p>
              </div>
            )}

            {!isLoading && order && <OrderBody order={order} refetch={refetch} />}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PackageOrderDetail;
