import { useState } from 'react';
import { toast } from 'sonner';
import { useBriefings, usePublishBriefing, type BriefingKpi } from '@/hooks/internal/useBriefings';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';
import { ErrorCard } from '@/components/internal/stats';
import { ExportToDocButton } from '@/components/internal/ExportToDocButton';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';

const KPI_STATUS_STYLES: Record<string, string> = {
  on_track: 'bg-dc-teal/15 text-dc-teal border-dc-teal/50',
  at_risk: 'bg-dc-yellow/15 text-dc-yellow border-dc-yellow/50',
  off_track: 'bg-dc-pink-accent/15 text-dc-pink border-dc-pink-accent/50',
};

const KpiChip = ({ kpi }: { kpi: BriefingKpi }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
      KPI_STATUS_STYLES[kpi.status ?? ''] ?? 'border-white/20 bg-white/[0.04] text-white/80'
    }`}
  >
    {kpi.label}: {kpi.value}
    {kpi.target && <span className="font-normal opacity-70">/ {kpi.target}</span>}
  </span>
);

const InternalBriefings = () => {
  const briefings = useBriefings();
  const { isAdmin } = useInternalAccess();
  const publishMutation = usePublishBriefing();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (briefings.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (briefings.isError || !briefings.data) {
    return <ErrorCard message="Briefings failed to load." />;
  }

  const list = briefings.data;
  const selected = list.find((b) => b.id === selectedId) ?? list[0] ?? null;

  if (list.length === 0) {
    return (
      <div className="max-w-2xl rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm">
        <h1 className="text-xl font-bold text-white">WEEKLY BRIEFINGS</h1>
        <p className="mt-2 text-sm text-white/60">
          No briefings yet. The weekly operating brief agent runs Monday mornings and files its
          report here; admins review drafts and publish them for stakeholders.
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6 lg:flex-row">
      <aside className="lg:w-80 lg:shrink-0">
        <h1 className="text-2xl font-bold text-white">Weekly briefings</h1>
        <p className="mb-4 text-sm text-white/60">
          Monday operating briefs — KPIs vs targets, scaling forecast, marketing recommendations.
        </p>
        <nav className="max-h-[60vh] overflow-y-auto rounded-2xl border border-dc-teal/25 bg-white/[0.04] backdrop-blur-sm">
          {list.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              className={`block w-full border-b border-white/10 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                selected?.id === b.id
                  ? 'bg-dc-teal/15 font-semibold text-dc-teal'
                  : 'text-white/80 hover:bg-white/[0.06]'
              }`}
            >
              <span className="block">{b.title}</span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-white/50">
                Week of {new Date(`${b.week_start}T00:00:00`).toLocaleDateString()}
                {!b.published_at && (
                  <span className="rounded-full bg-dc-yellow/20 px-2 py-0.5 font-semibold text-dc-yellow">
                    Draft
                  </span>
                )}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 flex-1">
        {selected && (
          <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.title}</h2>
                <p className="text-xs text-white/50">
                  Week of {new Date(`${selected.week_start}T00:00:00`).toLocaleDateString()} ·{' '}
                  {selected.generated_by}
                  {selected.published_at
                    ? ` · published ${new Date(selected.published_at).toLocaleDateString()}`
                    : ' · draft'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExportToDocButton title={selected.title} markdown={selected.body_md} />
                {isAdmin && (
                  <button
                    type="button"
                    disabled={publishMutation.isPending}
                    onClick={() =>
                      publishMutation.mutate(
                        { briefing: selected, publish: !selected.published_at },
                        {
                          onSuccess: (result) => {
                            if (result.published && result.exported) {
                              toast.success('Brief published — Google Doc updated', {
                                action: result.link
                                  ? {
                                      label: 'Open',
                                      onClick: () => window.open(result.link, '_blank', 'noopener'),
                                    }
                                  : undefined,
                              });
                            } else if (result.published) {
                              toast.warning(
                                'Brief published — Doc export skipped (is Google connected on the Workspace page?)'
                              );
                            }
                          },
                        }
                      )
                    }
                    className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                      selected.published_at
                        ? 'bg-dc-pink-accent-btn text-white hover:bg-dc-pink-accent'
                        : 'bg-dc-teal text-dc-dark hover:bg-dc-teal-dark'
                    }`}
                  >
                    {selected.published_at ? 'Unpublish' : 'Publish to stakeholders'}
                  </button>
                )}
              </div>
            </div>

            {selected.kpis.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                {selected.kpis.map((kpi) => (
                  <KpiChip key={kpi.key} kpi={kpi} />
                ))}
              </div>
            )}

            <MarkdownProse>{selected.body_md}</MarkdownProse>
          </div>
        )}
      </article>
    </div>
  );
};

export default InternalBriefings;
