import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { usePlatformWeight } from '@/hooks/internal/usePlatformWeight';
import {
  computeWeightAlerts,
  dailyGrowthBytes,
  DISK_LIMIT_BYTES,
  CURRENT_TIER,
  GB,
} from '@/lib/internal/weightThresholds';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';

const MB = 1024 * 1024;
const formatBytes = (bytes: number) =>
  bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${Math.round(bytes / MB)} MB`;

const severityStyles = {
  critical: 'border-dc-pink-accent bg-dc-pink/20',
  warning: 'border-dc-pink bg-dc-pink/10',
  info: 'border-teal-300 bg-dc-teal/12',
} as const;

const InternalWeight = () => {
  const weight = usePlatformWeight();

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
  const alerts = computeWeightAlerts(snapshots);
  const growth = dailyGrowthBytes(snapshots);
  const diskPct = Math.round((latest.db_bytes / DISK_LIMIT_BYTES) * 100);
  const tier = CURRENT_TIER;
  const chartData = snapshots.map((s) => ({
    day: new Date(s.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    dbMb: Math.round(s.db_bytes / MB),
    storageMb: Math.round(s.storage_bytes / MB),
  }));
  const topRows = Object.entries(latest.row_counts ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-dc-text">App weight</h1>
      <p className="mb-6 text-sm text-dc-text-muted">
        Daily snapshots of database, storage, and data volume — and when it&apos;s time to scale
        Supabase compute or disk.
      </p>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.title}
              className={`rounded-2xl border-2 p-4 ${severityStyles[alert.severity]}`}
            >
              <p className="font-bold text-dc-text">{alert.title}</p>
              <p className="text-sm text-dc-text-muted">{alert.detail}</p>
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
      <div className="h-64 rounded-2xl border border-teal-300 bg-dc-card p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={48} />
            <Tooltip />
            <Area type="monotone" dataKey="dbMb" name="Database" stroke="#0F766E" fill="#4DD9C0" fillOpacity={0.5} />
            <Area type="monotone" dataKey="storageMb" name="Storage" stroke="#DB2777" fill="#F9A8D4" fillOpacity={0.4} />
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
