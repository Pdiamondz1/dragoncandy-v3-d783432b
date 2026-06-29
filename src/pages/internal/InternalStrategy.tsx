import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useInternalDocs, useInternalDoc } from '@/hooks/internal/useInternalDocs';
import { useArchiveDoc, useUnarchiveDoc } from '@/hooks/internal/useArchiveDoc';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';
import { ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { ExportToDocButton } from '@/components/internal/ExportToDocButton';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const InternalStrategy = () => {
  const [showArchived, setShowArchived] = useState(false);
  const docs = useInternalDocs({ archived: showArchived });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const doc = useInternalDoc(selectedId);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const archiveDoc = useArchiveDoc();
  const unarchiveDoc = useUnarchiveDoc();
  const { isAdmin } = useInternalAccess();

  const filtered = useMemo(() => {
    const list = docs.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.title.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [docs.data, filter]);

  const switchMode = (archived: boolean) => {
    setShowArchived(archived);
    setSelectedId(null);
  };

  const onArchive = () => {
    if (!doc.data) return;
    archiveDoc.mutate(
      { path: doc.data.path, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Document archived — removed from Donny, Dezzy, and this library.');
          setArchiveOpen(false);
          setReason('');
          setSelectedId(null);
        },
        onError: (e) => toast.error((e as Error).message || 'Archive failed'),
      },
    );
  };

  const onUnarchive = () => {
    if (!doc.data) return;
    unarchiveDoc.mutate(doc.data.path, {
      onSuccess: () => {
        toast.success('Document un-archived — it returns to Donny on the next sync.');
        setSelectedId(null);
      },
      onError: (e) => toast.error((e as Error).message || 'Un-archive failed'),
    });
  };

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

  return (
    <PageContainer size="xl">
      <PageHeader
        title="Strategy library"
        subtitle="Playbooks, briefings, and wiki knowledge — synced from the repo."
      />

      <div className="mb-4 inline-flex rounded-full border border-dc-teal/25 bg-white/[0.04] p-1 text-sm">
        <button
          onClick={() => switchMode(false)}
          className={`rounded-full px-4 py-1.5 transition-colors ${!showArchived ? 'bg-dc-teal/20 font-semibold text-dc-teal' : 'text-white/70 hover:text-white'}`}
        >
          Active
        </button>
        <button
          onClick={() => switchMode(true)}
          className={`rounded-full px-4 py-1.5 transition-colors ${showArchived ? 'bg-dc-teal/20 font-semibold text-dc-teal' : 'text-white/70 hover:text-white'}`}
        >
          Archived
        </button>
      </div>

      {docs.data.length === 0 ? (
        <ErrorCard
          message={showArchived ? 'No archived documents.' : 'No internal docs synced yet — run supabase/scripts/sync-internal-docs.mjs to populate the library.'}
        />
      ) : (
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
                  className={`flex w-full items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                    selectedId === d.id ? 'bg-dc-teal/15 font-semibold text-dc-teal' : 'text-white/80 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="min-w-0 truncate">{d.title}</span>
                  {d.is_core && (
                    <span className="shrink-0 rounded-full bg-dc-pink/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dc-pink">
                      Core
                    </span>
                  )}
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
                  <div className="flex items-center gap-2">
                    <ExportToDocButton title={doc.data.title} markdown={doc.data.content_md} />
                    {doc.data.is_core ? (
                      <span className="rounded-full bg-dc-pink/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-dc-pink">
                        Core · protected
                      </span>
                    ) : isAdmin && doc.data.archived_at ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onUnarchive}
                        disabled={unarchiveDoc.isPending}
                      >
                        {unarchiveDoc.isPending ? 'Un-archiving…' : 'Un-archive'}
                      </Button>
                    ) : isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchiveOpen(true)}
                        disabled={archiveDoc.isPending}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </div>
                </div>
                {doc.data.archived_at && (
                  <p className="mb-3 rounded-lg border border-dc-pink/25 bg-dc-pink/10 px-3 py-2 text-xs text-white/70">
                    Archived {new Date(doc.data.archived_at).toLocaleDateString()}
                    {doc.data.archive_reason ? ` — ${doc.data.archive_reason}` : ''}. Hidden from Donny &amp; Dezzy;
                    un-archive to restore it (returns to Donny on the next sync).
                  </p>
                )}
                <MarkdownProse>{doc.data.content_md}</MarkdownProse>
              </div>
            )}
          </article>
        </div>
      )}

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this document?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from Donny&apos;s knowledge, Dezzy&apos;s tools, and this library. Reversible —
              you can un-archive it later. Core documents cannot be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason (optional) — e.g. superseded by docs/wiki/concepts/…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onArchive} disabled={archiveDoc.isPending}>
              {archiveDoc.isPending ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default InternalStrategy;
