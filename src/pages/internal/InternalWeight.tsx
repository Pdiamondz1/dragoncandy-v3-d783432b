import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { usePlatformWeight } from '@/hooks/internal/usePlatformWeight';
import { useCurrentTierIndex } from '@/hooks/internal/useDashboardSettings';
import {
  computeWeightAlerts,
  computeAnalyticsBudgetAlert,
  dailyGrowthBytes,
  DISK_LIMIT_BYTES,
  COMPUTE_TIERS,
  DEFAULT_TIER_INDEX,
  GB,
} from '@/lib/internal/weightThresholds';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';

const MB = 1024 * 1024;
const formatBytes = (bytes: number) =>
  bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${Math.round(bytes / MB)} MB`;

const severityStyles = {
  critical: 'border-dc-pink-accent/60 bg-dc-pink-accent/15',
  warning: 'border-dc-pink/50 bg-dc-pink/10',
  info: 'border-dc-teal/40 bg-dc-teal/10',
} as const;

const InternalWeight = () => {
  const weight = usePlatformWeight();
  // Live compute tier from the DB (founder-correctable); falls back while loading.
  const { data: tierIndex = DEFAULT_TIER_INDEX } = useCurrentTierIndex();

  if (weight.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (weight.isError || !weight.data || weight.data.length === 0) {
    return <ErrorCard message="No weight snapshots yet — the daily capture runs at 08:30 UTC." />;
  }

  const snapshots = weight.data;
  const latest = snapshots[snapshots.length - 1];
  const alerts = [
    ...computeWeightAlerts(snapshots, tierIndex),
    ...computeAnalyticsBudgetAlert(latest.row_counts?.analytics_events),
  ];
  const growth = dailyGrowthBytes(snapshots);
  const diskPct = Math.round((latest.db_bytes / DISK_LIMIT_BYTES) * 100);
  const tier = COMPUTE_TIERS[tierIndex] ?? COMPUTE_TIERS[DEFAULT_TIER_INDEX];
  const chartData = snapshots.map((s) => ({
    day: new Date(s.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    dbMb: Math.round(s.db_bytes / MB),
    storageMb: Math.round(s.storage_bytes / MB),
  }));
  const topRows = Object.entries(latest.row_counts ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-white">App weight</h1>
      <p className="mb-6 text-sm text-white/60">
        Daily snapshots of database, storage, and data volume — and when it&apos;s time to scale
        Supabase compute or disk.
      </p>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.title}
              className={`rounded-2xl border p-4 ${severityStyles[alert.severity]}`}
            >
              <p className="font-bold text-white">{alert.title}</p>
              <p className="text-sm text-white/60">{alert.detail}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Database"
          value={formatBytes(latest.db_bytes)}
          sub={`${diskPct}% of ${DISK_LIMIT_BYTES / GB} GB disk cap`}
        />
        <StatCard label="File storage" value={formatBytes(latest.storage_bytes)} />
        <StatCard
          label="DB growth"
          value={growth > 0 ? `${formatBytes(growth)}/day` : 'flat'}
          sub="Linear rate across snapshots"
        />
        <StatCard
          label="Compute tier"
          value={tier.name}
          sub={`${tier.ramGb} GB RAM · $${tier.monthlyUsd}/mo`}
        />
      </div>

      <SectionHeading>Database vs storage (MB)</SectionHeading>
      <div className="h-64 rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.55)' }} stroke="rgba(255,255,255,0.2)" />
            <YAxis tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.55)' }} width={48} stroke="rgba(255,255,255,0.2)" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A2A',
                border: '1px solid rgba(77,217,192,0.3)',
                borderRadius: 12,
                color: '#fff',
              }}
              labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
            />
            <Area type="monotone" dataKey="dbMb" name="Database" stroke="#4DD9C0" fill="#4DD9C0" fillOpacity={0.25} />
            <Area type="monotone" dataKey="storageMb" name="Storage" stroke="#F9A8D4" fill="#F9A8D4" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <SectionHeading>Largest tables (rows)</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {topRows.slice(0, 8).map(([table, count]) => (
          <StatCard key={table} label={table} value={count.toLocaleString()} />
        ))}
      </div>
    </div>
  );
};

export default InternalWeight;
