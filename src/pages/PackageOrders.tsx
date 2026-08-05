import { Navigate, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Package as PackageIcon, ChevronRight, Clock } from 'lucide-react';
import { PACKAGES_ENABLED } from '@/lib/featureConfig';
import { useCreatorOrders } from '@/hooks/packages/useCreatorOrders';
import { creatorOrderView, orderToneClasses, orderNetPayout } from '@/lib/packageOrders';
import { formatUsd } from '@/lib/packagePricing';
import type { CreatorOrder } from '@/types/packages';

const OrderRow = ({ order }: { order: CreatorOrder }) => {
  const view = creatorOrderView(order);
  const buyer = order.buyer_email ?? 'On-platform buyer';
  return (
    <Link
      to={`/dashboard/creator/orders/${order.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate font-semibold text-foreground">{order.package?.title ?? 'Package'}</h2>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${orderToneClasses[view.tone]}`}>
            {view.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{buyer}</p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold text-foreground">{formatUsd(orderNetPayout(order))}</div>
        <div className="text-xs text-muted-foreground">you earn</div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
};

const PackageOrders = () => {
  const { orders, isLoading } = useCreatorOrders();

  if (!PACKAGES_ENABLED) return <Navigate to="/dashboard/creator" replace />;

  // Action-needed orders (needs delivery / revision) float to the top; the query already returns newest-first
  // within each group.
  const sorted = [...orders].sort(
    (a, b) => Number(creatorOrderView(b).needsDelivery) - Number(creatorOrderView(a).needsDelivery),
  );
  const actionCount = orders.filter((o) => creatorOrderView(o).needsDelivery).length;

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen w-full max-w-full overflow-x-hidden md:mx-auto md:max-w-3xl">
        <div className="px-4 py-6 sm:px-6">
          <h1 className="text-2xl font-bold text-foreground">Your Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {actionCount > 0
              ? `${actionCount} order${actionCount > 1 ? 's' : ''} waiting on you — deliver the work to get paid.`
              : 'Orders from your package links show up here. Deliver the work and the buyer releases your payment.'}
          </p>

          <div className="mt-6 space-y-3">
            {isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}

            {!isLoading && orders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <PackageIcon className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-3 font-semibold text-foreground">No orders yet</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Share one of your package links with a restaurant you know. When they book and pay, the order
                  lands here for you to deliver.
                </p>
                <Link
                  to="/dashboard/creator/packages"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Clock className="h-4 w-4" /> Go to your packages
                </Link>
              </div>
            )}

            {!isLoading && sorted.map((order) => <OrderRow key={order.id} order={order} />)}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PackageOrders;
