import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Ticket } from 'lucide-react';

interface RedemptionMetricsProps {
  promotionId: string;
  currentRedemptions: number;
  maxRedemptions: number | null;
}

interface DayBucket {
  date: string;
  label: string;
  count: number;
}

function buildLast7Days(): DayBucket[] {
  const days: DayBucket[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      count: 0,
    });
  }
  return days;
}

const SparkTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: DayBucket }> }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-dc-dark text-white text-[10px] px-2 py-1 rounded shadow-lg">
      <span className="font-medium">{d.label}</span>
      <span className="ml-1.5 tabular-nums">{d.count}</span>
    </div>
  );
};

export const RedemptionMetrics: React.FC<RedemptionMetricsProps> = ({
  promotionId,
  currentRedemptions,
  maxRedemptions,
}) => {
  // Fetch daily redemption counts for sparkline
  const { data: sparkData } = useQuery({
    queryKey: ['redemption-spark', promotionId],
    queryFn: async () => {
      const days = buildLast7Days();
      const sevenDaysAgo = days[0].date + 'T00:00:00.000Z';

      const { data, error } = await supabase
        .from('promotion_redemptions')
        .select('redeemed_at')
        .eq('promotion_id', promotionId)
        .gte('redeemed_at', sevenDaysAgo)
        .order('redeemed_at', { ascending: true });

      if (error || !data) return days;

      // Bucket into days
      for (const row of data) {
        const dateStr = new Date(row.redeemed_at).toISOString().slice(0, 10);
        const bucket = days.find((d) => d.date === dateStr);
        if (bucket) bucket.count++;
      }

      return days;
    },
    staleTime: 60_000,
  });

  const hasActivity = sparkData?.some((d) => d.count > 0);
  const pct = maxRedemptions ? Math.min(100, (currentRedemptions / maxRedemptions) * 100) : null;

  return (
    <div className="flex items-center gap-3">
      {/* Counter — always visible */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Ticket className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
        <span className="text-sm font-semibold tabular-nums text-gray-900 tracking-tight">
          {currentRedemptions}
        </span>
        {maxRedemptions != null && (
          <span className="text-xs text-gray-400 tabular-nums">
            / {maxRedemptions}
          </span>
        )}
      </div>

      {/* Progress pip — visible when capped */}
      {pct != null && (
        <div className="hidden sm:block w-12 h-1.5 bg-dc-teal/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background:
                pct >= 90
                  ? '#ef4444'
                  : pct >= 70
                    ? '#f59e0b'
                    : '#4DD9C0',
            }}
          />
        </div>
      )}

      {/* Sparkline — desktop only */}
      {hasActivity && (
        <div className="hidden lg:block w-24 h-8 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-fill-${promotionId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4DD9C0" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4DD9C0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <RechartsTooltip
                content={<SparkTooltip />}
                cursor={false}
                allowEscapeViewBox={{ x: true, y: true }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#4DD9C0"
                strokeWidth={1.5}
                fill={`url(#spark-fill-${promotionId})`}
                dot={false}
                activeDot={{
                  r: 2.5,
                  fill: '#4DD9C0',
                  stroke: '#fff',
                  strokeWidth: 1.5,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Period label — desktop only, next to sparkline */}
      {hasActivity && (
        <span className="hidden lg:inline text-[10px] text-gray-400 tracking-wide uppercase">
          7d
        </span>
      )}
    </div>
  );
};
