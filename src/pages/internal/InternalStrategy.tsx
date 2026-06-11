import { useMemo, useState } from 'react';
import { useInternalDocs, useInternalDoc } from '@/hooks/internal/useInternalDocs';
import { ErrorCard } from '@/components/internal/stats';
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
    <div className="flex max-w-6xl flex-col gap-6 lg:flex-row">
      <aside className="lg:w-80 lg:shrink-0">
        <h1 className="text-2xl font-bold text-dc-text">Strategy library</h1>
        <p className="mb-4 text-sm text-dc-text-muted">
          Playbooks, briefings, and wiki knowledge — synced from the repo.
        </p>
        <Input
          placeholder="Filter by title or tag"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-3"
        />
        <nav className="max-h-[60vh] overflow-y-auto rounded-2xl border border-teal-300 bg-dc-card">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`block w-full border-b border-teal-300/40 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                selectedId === d.id
                  ? 'bg-dc-teal/12 font-semibold text-dc-teal-btn'
                  : 'text-dc-text hover:bg-dc-teal/12'
              }`}
            >
              {d.title}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-4 text-sm text-dc-text-muted">No docs match that filter.</p>
          )}
        </nav>
      </aside>

      <article className="min-w-0 flex-1">
        {!selectedId ? (
          <div className="rounded-2xl border border-teal-300 bg-dc-card p-6">
            <h2 className="font-bold text-dc-text">Pick a document</h2>
            <p className="text-sm text-dc-text-muted">
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
          <div className="rounded-2xl border border-teal-300 bg-dc-card p-6">
            <p className="mb-4 text-xs text-dc-text-muted">
              {doc.data.path} · updated {new Date(doc.data.updated_at).toLocaleDateString()}
            </p>
            <MarkdownProse>{doc.data.content_md}</MarkdownProse>
          </div>
        )}
      </article>
    </div>
  );
};

export default InternalStrategy;
