import { useMemo, useState } from 'react';
import { useInternalDocs, useInternalDoc } from '@/hooks/internal/useInternalDocs';
import { ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { ExportToDocButton } from '@/components/internal/ExportToDocButton';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';

const InternalStrategy = () => {
  const docs = useInternalDocs();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const doc = useInternalDoc(selectedId);

  const filtered = useMemo(() => {
    const list = docs.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.title.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [docs.data, filter]);

  if (docs.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (docs.isError || !docs.data) {
    return <ErrorCard message="Strategy docs failed to load." />;
  }

  if (docs.data.length === 0) {
    return (
      <ErrorCard message="No internal docs synced yet — run supabase/scripts/sync-internal-docs.mjs to populate the library." />
    );
  }

  return (
    <PageContainer size="xl">
      <PageHeader
        title="Strategy library"
        subtitle="Playbooks, briefings, and wiki knowledge — synced from the repo."
      />
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-80 lg:shrink-0">
          <Input
            placeholder="Filter by title or tag"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-3"
          />
          <nav className="max-h-64 overflow-y-auto rounded-2xl border border-dc-teal/25 bg-white/[0.04] backdrop-blur-sm lg:max-h-[60vh]">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`block w-full border-b border-white/10 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                selectedId === d.id
                  ? 'bg-dc-teal/15 font-semibold text-dc-teal'
                  : 'text-white/80 hover:bg-white/[0.06]'
              }`}
            >
              {d.title}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-4 text-sm text-white/50">No docs match that filter.</p>
          )}
        </nav>
      </aside>

      <article className="min-w-0 flex-1">
        {!selectedId ? (
          <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm">
            <h2 className="font-bold text-white">Pick a document</h2>
            <p className="text-sm text-white/60">
              Strategy briefing, GTM playbook, KPI scorecard, and the full knowledge wiki live here.
            </p>
          </div>
        ) : doc.isLoading ? (
          <div className="flex min-h-[20vh] items-center justify-center">
            <Spinner className="h-8 w-8 border-teal-400" />
          </div>
        ) : doc.isError || !doc.data ? (
          <ErrorCard message="This document failed to load." />
        ) : (
          <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs text-white/40">
                {doc.data.path} · updated {new Date(doc.data.updated_at).toLocaleDateString()}
              </p>
              <ExportToDocButton title={doc.data.title} markdown={doc.data.content_md} />
            </div>
            <MarkdownProse>{doc.data.content_md}</MarkdownProse>
          </div>
        )}
        </article>
      </div>
    </PageContainer>
  );
};

export default InternalStrategy;
