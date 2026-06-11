import { usePlatformStats } from '@/hooks/internal/usePlatformStats';
import { useRevenueStats } from '@/hooks/internal/useRevenueStats';
import { useCostStats } from '@/hooks/internal/useCostStats';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';
import { Spinner } from '@/components/ui/spinner';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatCents = (cents: number) => usd.format(cents / 100);

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'teal' | 'pink';
}

function StatCard({ label, value, sub, accent = 'teal' }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border-2 bg-dc-card p-4 ${
        accent === 'teal' ? 'border-teal-300' : 'border-dc-pink'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-dc-text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-dc-text">{value}</p>
      {sub && <p className="mt-1 text-xs text-dc-text-muted">{sub}</p>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 text-lg font-bold text-dc-text first:mt-0">{children}</h2>;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-2 border-dc-pink bg-dc-pink/10 p-4 text-sm text-dc-text">
      {message}
    </div>
  );
}

const InternalOverview = () => {
  const { isAdmin } = useInternalAccess();
  const platform = usePlatformStats();
  const revenue = useRevenueStats();
  const cost = useCostStats();

  if (platform.isLoading || revenue.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (platform.isError || !platform.data) {
    return <ErrorCard message="Platform stats failed to load. Check your internal access and try again." />;
  }

  const p = platform.data;
  const r = revenue.data;
  const c = cost.data;
  const activeCampaigns = p.campaigns.by_status['active'] ?? 0;
  const verifiedPosts = p.dragonshare.posts_by_status['verified'] ?? 0;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-dc-text">DragonCandy AIOS</h1>
        <p className="text-xs text-dc-text-muted">
          Live as of {new Date(p.generated_at).toLocaleString()}
        </p>
      </div>

      <SectionHeading>Users &amp; businesses</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total users" value={p.users.total} />
        <StatCard label="Creators" value={p.users.by_role['content_creator'] ?? 0} />
        <StatCard
          label="Restaurants"
          value={p.businesses.restaurants}
          sub={`${p.businesses.locations} locations`}
        />
        <StatCard label="Brands" value={p.businesses.brands} />
      </div>

      <SectionHeading>Activity</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Campaigns" value={p.campaigns.total} sub={`${activeCampaigns} active`} />
        <StatCard
          label="DragonShare posts"
          value={p.dragonshare.posts_total}
          sub={`${verifiedPosts} verified · ${p.dragonshare.boosts_total} boosts`}
        />
        <StatCard label="Promotions" value={p.promotions.total} />
        <StatCard
          label="Social connections"
          value={p.social_connections.total}
          sub={Object.entries(p.social_connections.by_platform)
            .map(([platform, n]) => `${platform} ${n}`)
            .join(' · ')}
        />
      </div>

      <SectionHeading>Content</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Social posts logged" value={p.content.social_posts_logged} />
        <StatCard label="Performance-tracked posts" value={p.content.performance_tracked_posts} />
      </div>

      <SectionHeading>Revenue</SectionHeading>
      {revenue.isError || !r ? (
        <ErrorCard message="Revenue stats failed to load." />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="DragonCandy revenue"
            value={formatCents(r.dragonshare.platform_fee_cents)}
            sub="DragonShare platform fees (20%)"
            accent="pink"
          />
          <StatCard
            label="Creator payouts"
            value={formatCents(r.dragonshare.creator_payout_cents)}
            sub="DragonShare creator share (80%)"
            accent="pink"
          />
          <StatCard
            label="Gross boost volume"
            value={formatCents(r.dragonshare.gross_cents)}
            accent="pink"
          />
          <StatCard
            label="This month"
            value={formatCents(r.dragonshare_mtd.platform_fee_cents)}
            sub={`of ${formatCents(r.dragonshare_mtd.gross_cents)} gross MTD`}
            accent="pink"
          />
        </div>
      )}

      {isAdmin && (
        <>
          <SectionHeading>AI spend (admin)</SectionHeading>
          {cost.isError || !c ? (
            <ErrorCard message="Cost stats failed to load." />
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="MTD AI spend" value={usd.format(c.mtd_spend_usd)} />
              <StatCard
                label="Top function"
                value={topEntry(c.mtd_by_function)?.[0] ?? '—'}
                sub={topEntry(c.mtd_by_function) ? usd.format(topEntry(c.mtd_by_function)![1]) : undefined}
              />
              <StatCard
                label="Top model"
                value={topEntry(c.mtd_by_model)?.[0] ?? '—'}
                sub={topEntry(c.mtd_by_model) ? usd.format(topEntry(c.mtd_by_model)![1]) : undefined}
              />
              <StatCard
                label="Cost alert"
                value={c.latest_alert?.alert_level ?? 'none'}
                sub={
                  c.latest_alert
                    ? `${Math.round(c.latest_alert.ratio * 100)}% of ${usd.format(c.latest_alert.cap_usd)} cap`
                    : 'No alerts logged'
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

function topEntry(record: Record<string, number>): [string, number] | undefined {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0];
}

export default InternalOverview;
