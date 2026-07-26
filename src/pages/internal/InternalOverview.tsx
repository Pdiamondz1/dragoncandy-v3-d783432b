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
  // Real-vs-total: surface the synthetic gap (all − real) as a per-card sub, only when synthetic exists.
  const ofTotal = (real: number, all: number) =>
    all > real ? `of ${all.toLocaleString()} incl. synthetic` : undefined;
  const withSub = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
  const syntheticActive = p.users.total_all > p.users.total;
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

      {syntheticActive && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <span className="font-semibold text-amber-200">Synthetic test data is active.</span>{' '}
          The metrics below count <span className="font-semibold">real users only</span> — excluding{' '}
          {(p.users.total_all - p.users.total).toLocaleString()} synthetic profiles,{' '}
          {(
            p.businesses.restaurants_all + p.businesses.brands_all - p.businesses.restaurants - p.businesses.brands
          ).toLocaleString()}{' '}
          businesses, and {(p.campaigns.total_all - p.campaigns.total).toLocaleString()} campaigns. See the{' '}
          <span className="font-mono">Simulation</span> page for the synthetic-inclusive view.
        </div>
      )}

      <SectionHeading>Users &amp; businesses</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total users" value={p.users.total} sub={ofTotal(p.users.total, p.users.total_all)} />
        <StatCard
          label="Creators"
          value={p.users.by_role['content_creator'] ?? 0}
          sub={ofTotal(p.users.by_role['content_creator'] ?? 0, p.users.by_role_all['content_creator'] ?? 0)}
        />
        <StatCard
          label="Restaurants"
          value={p.businesses.restaurants}
          sub={withSub(`${p.businesses.locations} locations`, ofTotal(p.businesses.restaurants, p.businesses.restaurants_all))}
        />
        <StatCard label="Brands" value={p.businesses.brands} sub={ofTotal(p.businesses.brands, p.businesses.brands_all)} />
      </div>

      <SectionHeading>Activity</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Campaigns"
          value={p.campaigns.total}
          sub={withSub(`${activeCampaigns} active`, ofTotal(p.campaigns.total, p.campaigns.total_all))}
        />
        <StatCard
          label="DragonShare posts"
          value={p.dragonshare.posts_total}
          sub={withSub(
            `${verifiedPosts} verified · ${p.dragonshare.boosts_total} boosts`,
            ofTotal(p.dragonshare.posts_total, p.dragonshare.posts_total_all),
          )}
        />
        <StatCard label="Promotions" value={p.promotions.total} sub={ofTotal(p.promotions.total, p.promotions.total_all)} />
        <StatCard
          label="Social connections"
          value={p.social_connections.total}
          sub={withSub(
            Object.entries(p.social_connections.by_platform)
              .map(([platform, n]) => `${platform} ${n}`)
              .join(' · ') || undefined,
            ofTotal(p.social_connections.total, p.social_connections.total_all),
          )}
        />
      </div>

      <SectionHeading>Content</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Social posts logged"
          value={p.content.social_posts_logged}
          sub={ofTotal(p.content.social_posts_logged, p.content.social_posts_logged_all)}
        />
        <StatCard
          label="Performance-tracked posts"
          value={p.content.performance_tracked_posts}
          sub={ofTotal(p.content.performance_tracked_posts, p.content.performance_tracked_posts_all)}
        />
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
