import { usePlatformStats } from '@/hooks/internal/usePlatformStats';
import { useRevenueStats } from '@/hooks/internal/useRevenueStats';
import { useCostStats } from '@/hooks/internal/useCostStats';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { formatCents, formatUsd } from '@/lib/utils';
import { aiCapStatus } from '@/lib/aiCostCap';
import { Spinner } from '@/components/ui/spinner';

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
  const topFunction = c ? topEntry(c.mtd_by_function) : undefined;
  const topModel = c ? topEntry(c.mtd_by_model) : undefined;
  // Live cap vs the ledger's MTD runtime spend. Revenue basis is DragonShare's MTD
  // platform fee (DragonCandy's earned revenue); pre-revenue this is ~$0 so the $250 floor
  // applies. Requires BOTH cost and revenue: without revenue the 15%-of-revenue basis is
  // unknown, so we withhold the cap rather than show a misleading floor-only status.
  const cap =
    c && r ? aiCapStatus(c.mtd_spend_usd, r.dragonshare_mtd.platform_fee_cents / 100) : undefined;

  return (
    <PageContainer size="xl">
      <PageHeader
        title="DragonCandy AIOS"
        actions={
          <p className="font-mono text-xs text-white/40">
            Live as of {new Date(p.generated_at).toLocaleString()}
          </p>
        }
      />

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
          <p className="-mt-1 mb-3 text-xs text-white/45">
            Runtime serving cost (<span className="font-mono">donny_cost_ledger</span>) — excludes
            founder dev / Claude Code usage, which is opex.
          </p>
          {cost.isError || !c ? (
            <ErrorCard message="Cost stats failed to load." />
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="MTD AI spend" value={formatUsd(c.mtd_spend_usd)} />
              <StatCard
                label="Runtime vs cap"
                value={cap ? `${Math.round(cap.ratio * 100)}%` : '—'}
                sub={
                  cap
                    ? `${formatUsd(c.mtd_spend_usd)} of ${formatUsd(cap.capUsd)} cap (${cap.basis}) · ${cap.status}`
                    : 'revenue unavailable — cap needs it'
                }
                accent={cap && cap.status !== 'green' ? 'pink' : 'teal'}
              />
              <StatCard
                label="Top function"
                value={topFunction?.[0] ?? '—'}
                sub={topFunction ? formatUsd(topFunction[1]) : undefined}
              />
              <StatCard
                label="Top model"
                value={topModel?.[0] ?? '—'}
                sub={topModel ? formatUsd(topModel[1]) : undefined}
              />
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
};

function topEntry(record: Record<string, number>): [string, number] | undefined {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0];
}

export default InternalOverview;
