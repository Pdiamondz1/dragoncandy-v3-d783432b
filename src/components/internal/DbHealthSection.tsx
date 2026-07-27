import { computeConnectionAlert, connectionHeadroomPct } from '@/lib/internal/weightThresholds';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';
import type { DbHealth } from '@/hooks/internal/useDbHealth';

interface DbHealthSectionProps {
  health: DbHealth | undefined;
  isLoading: boolean;
  isError: boolean;
}

// `severityStyles` in InternalWeight.tsx is not exported — re-define the same 3-line map locally.
const severityStyles = {
  critical: 'border-dc-pink-accent/60 bg-dc-pink-accent/15',
  warning: 'border-dc-pink/50 bg-dc-pink/10',
  info: 'border-dc-teal/40 bg-dc-teal/10',
} as const;

/** "just now" under 5s, else "Ns ago" — tolerant of a future/skewed generated_at. */
function relativeTime(generatedAt: string): string {
  const secondsAgo = Math.round((Date.now() - Date.parse(generatedAt)) / 1000);
  return secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`;
}

/** The rendered body once a live DbHealth snapshot is present. */
function HealthBody({ health }: { health: DbHealth }) {
  const { connections, latency, cache_hit_ratio, xact_commit, xact_rollback } = health;
  const usable = connections.max - connections.reserved;
  const connValue = usable > 0 ? `${connections.total} / ${usable}` : `${connections.total}`;
  const headroom = connectionHeadroomPct(connections);
  const meanMs = latency.mean_query_ms;
  const alerts = computeConnectionAlert(connections);

  return (
    <>
      <p className="mb-3 text-xs text-white/40">live · updated {relativeTime(health.generated_at)}</p>

      {alerts.length > 0 && (
        <div className="mb-4 space-y-3">
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
          label="Connections"
          value={connValue}
          sub={headroom === null ? '—' : `${headroom}% headroom`}
        />
        <StatCard label="Active queries" value={connections.active} />
        <StatCard
          label="Mean query time"
          value={meanMs == null ? '—' : `${meanMs.toFixed(1)} ms`}
          sub={meanMs == null ? 'stat extension not enabled' : undefined}
        />
        <StatCard
          label="Cache hit"
          value={cache_hit_ratio == null ? '—' : `${Math.round(cache_hit_ratio * 100)}%`}
          sub="lifetime"
        />
        <StatCard
          label="Commits / rollbacks"
          value={`${xact_commit.toLocaleString()} / ${xact_rollback.toLocaleString()}`}
          sub="cumulative since stats reset"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="opacity-50">
          <StatCard label="CPU" value="—" />
        </div>
        <div className="opacity-50">
          <StatCard label="Memory" value="—" />
        </div>
      </div>
      <p className="mt-2 text-xs text-white/40">
        CPU &amp; memory — coming next, needs the Supabase metrics endpoint.
      </p>
    </>
  );
}

/**
 * Live database-health section for /internal/weight. Owns its own loading/error states so a health
 * failure never breaks the rest of the Weight page. The connection scale-up alert lives here because it
 * needs the live `health` data. CPU/RAM are placeholder cards until the Supabase metrics endpoint lands.
 */
export function DbHealthSection({ health, isLoading, isError }: DbHealthSectionProps) {
  return (
    <section className="mb-6">
      <SectionHeading>Database health</SectionHeading>
      <p className="mb-3 text-sm text-white/60">
        Live from the database (pg_stat). Connections are pooler-fronted — see the capacity note.
      </p>

      {isLoading && !health ? (
        <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
          <Spinner />
        </div>
      ) : isError || !health ? (
        <ErrorCard message="Live health unavailable — apply the db-health migration, or check internal access." />
      ) : (
        <HealthBody health={health} />
      )}
    </section>
  );
}
