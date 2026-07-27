/**
 * ForecastTable — pure render of a ForecastModel: a horizontally-scrollable
 * scenario table (Today / 500K / 750K / 1M) grouped into Footprint / Tier /
 * Cost / Economics, the model's degradation notes, and a cost-vs-revenue line
 * chart across the projected scenarios. Dark ops-deck theme; no data fetching.
 */
import { Fragment, type ReactNode } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ForecastModel, ForecastScenario } from '@/lib/internal/forecastModel';
import { GB } from '@/lib/internal/weightThresholds';
import { formatUsd, formatCompactNumber } from '@/lib/utils';
import { SectionHeading } from '@/components/internal/stats';

// ---- formatting helpers (the model's USD fields are DOLLARS — never formatCents) ----
const DASH = '—';
const usd0 = (n: number | null): string =>
  n == null ? DASH : `$${Math.round(n).toLocaleString()}`;
const usdPrecise = (n: number | null): string => (n == null ? DASH : formatUsd(n));
const num = (n: number | null): string => (n == null ? DASH : Math.round(n).toLocaleString());
const pct = (p: number | null): string => (p == null ? DASH : `${Math.round(p * 100)}%`);

const formatBytes = (bytes: number): string => {
  const gb = bytes / GB;
  return gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(2)} GB`;
};

// ---- small tag pills ----
function Pill({ tone, children }: { tone: 'measured' | 'assumed' | 'cap'; children: ReactNode }) {
  const styles = {
    measured: 'bg-dc-teal/20 text-dc-teal',
    assumed: 'bg-dc-pink-accent/15 text-dc-pink',
    cap: 'bg-dc-pink-accent/20 text-dc-pink-accent',
  } as const;
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

interface Row {
  label: ReactNode;
  render: (s: ForecastScenario) => ReactNode;
  bold?: boolean;
}
interface Group {
  title: string;
  rows: Row[];
}

const GROUPS: Group[] = [
  {
    title: 'Footprint',
    rows: [
      { label: 'Registered users', render: (s) => num(s.registeredUsers) },
      { label: 'Peak concurrent', render: (s) => num(s.peakConcurrent) },
      { label: 'Database', render: (s) => formatBytes(s.dbBytes) },
      { label: 'File storage', render: (s) => formatBytes(s.storageBytes) },
      {
        label: 'Pooled DB conns',
        render: (s) => `${num(s.pooledDbConns)} / ${num(s.connCeiling)}`,
      },
    ],
  },
  {
    title: 'Tier',
    rows: [
      {
        label: (
          <>
            Compute tier
            <Pill tone="assumed">assumed</Pill>
          </>
        ),
        render: (s) => s.computeTier,
      },
      { label: 'Compute cost', render: (s) => usd0(s.computeUsd) },
      { label: 'Disk', render: (s) => `${s.diskGb.toFixed(2)} GB` },
    ],
  },
  {
    title: 'Cost / mo',
    rows: [
      { label: 'Supabase', render: (s) => usd0(s.supabaseUsd) },
      {
        label: 'AI serving',
        render: (s) => (
          <>
            {usd0(s.aiUsd)}
            {s.aiCapBreached && <Pill tone="cap">cap</Pill>}
          </>
        ),
      },
      { label: 'Other opex', render: (s) => usd0(s.otherOpexUsd) },
      { label: 'Total', render: (s) => usd0(s.totalCostUsd), bold: true },
    ],
  },
  {
    title: 'Economics',
    rows: [
      { label: 'Revenue', render: (s) => usd0(s.revenueUsd) },
      {
        label: 'Gross margin',
        render: (s) => (
          <>
            {usd0(s.grossMarginUsd)}
            <span className="ml-1 text-white/40">{s.marginPct == null ? '' : `(${pct(s.marginPct)})`}</span>
          </>
        ),
      },
      { label: 'Cost / DAU', render: (s) => usdPrecise(s.costPerDauUsd) },
    ],
  },
];

export function ForecastTable({ model }: { model: ForecastModel }) {
  const { scenarios } = model;
  const projected = scenarios.filter((s) => !s.measured);
  const chartData = projected.map((s) => ({
    label: s.label,
    Cost: Math.round(s.totalCostUsd),
    Revenue: Math.round(s.revenueUsd),
  }));

  const colCount = scenarios.length + 1;
  const todayCell = 'bg-dc-teal/[0.04]';

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-dc-teal/25 bg-white/[0.04] backdrop-blur-sm">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-dc-teal/20">
              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-dc-teal">
                Metric
              </th>
              {scenarios.map((s) => (
                <th
                  key={s.label}
                  className={`px-4 py-3 text-right font-bold text-white ${s.measured ? todayCell : ''}`}
                >
                  {s.label}
                  {s.measured && <Pill tone="measured">measured</Pill>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <Fragment key={group.title}>
                <tr className="bg-white/[0.02]">
                  <td
                    colSpan={colCount}
                    className="px-4 pt-4 pb-1 font-mono text-[11px] uppercase tracking-wider text-dc-teal/80"
                  >
                    {group.title}
                  </td>
                </tr>
                {group.rows.map((row, i) => (
                  <tr key={`${group.title}-${i}`} className="border-t border-white/[0.06]">
                    <td
                      className={`whitespace-nowrap px-4 py-2 text-white/60 ${row.bold ? 'font-bold text-white/80' : ''}`}
                    >
                      {row.label}
                    </td>
                    {scenarios.map((s) => (
                      <td
                        key={s.label}
                        className={`whitespace-nowrap px-4 py-2 text-right tabular-nums text-white ${
                          row.bold ? 'font-bold' : ''
                        } ${s.measured ? todayCell : ''}`}
                      >
                        {row.render(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {model.notes.length > 0 && (
        <div className="mt-3 space-y-1">
          {model.notes.map((note) => (
            <p key={note} className="text-xs text-white/45">
              {note}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/50">
        <span>
          <Pill tone="measured">measured</Pill> from live platform data
        </span>
        <span>
          <Pill tone="assumed">assumed</Pill> founder-editable coefficient
        </span>
      </div>

      {chartData.length >= 2 && (
        <>
          <SectionHeading>Total cost vs revenue (projected)</SectionHeading>
          <div className="h-64 rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.55)' }}
                  stroke="rgba(255,255,255,0.2)"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.55)' }}
                  width={56}
                  stroke="rgba(255,255,255,0.2)"
                  tickFormatter={(v: number) => formatCompactNumber(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A2A',
                    border: '1px solid rgba(77,217,192,0.3)',
                    borderRadius: 12,
                    color: '#fff',
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  formatter={(value: number) => formatUsd(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} />
                <Line type="monotone" dataKey="Cost" stroke="#F9A8D4" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Revenue" stroke="#4DD9C0" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
