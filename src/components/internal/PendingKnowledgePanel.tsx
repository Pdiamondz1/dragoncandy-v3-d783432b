import { useState } from 'react';
import { GitPullRequest, ExternalLink, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePendingKnowledgePrs,
  usePreviewKnowledgePr,
  useMergeKnowledgePr,
} from '@/hooks/internal/usePendingKnowledge';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';

export const PendingKnowledgePanel = () => {
  const prs = usePendingKnowledgePrs();
  const [expanded, setExpanded] = useState<number | null>(null);
  const preview = usePreviewKnowledgePr(expanded);
  const merge = useMergeKnowledgePr();

  if (prs.isLoading) return <div className="flex justify-center py-6"><Spinner className="h-6 w-6" /></div>;
  if (prs.isError) return <p className="text-sm text-dc-pink-accent">Could not load pending knowledge PRs.</p>;
  if (!prs.data?.length) return null; // nothing pending → no clutter

  const onMerge = (n: number) =>
    merge.mutate(n, {
      onSuccess: (data) => {
        if (data.state === 'not_mergeable_yet') return toast.message('Checks still running — try again in a moment.');
        if (data.state === 'not_mergeable') return toast.error('GitHub says this PR is not mergeable.');
        if (data.error) return toast.error(data.error);
        toast.success('Merged & synced into Donny’s knowledge.');
        if (expanded === n) setExpanded(null);
      },
      onError: () => toast.error('Merge failed — try again.'),
    });

  return (
    <section className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-5 backdrop-blur-sm">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-white">
        <GitPullRequest className="h-4 w-4 text-dc-teal" /> Pending knowledge
      </h2>
      <p className="mb-4 text-sm text-white/60">
        Review and merge knowledge PRs here — they sync into Donny's brain on merge. No GitHub trip needed.
      </p>
      <ul className="space-y-2">
        {prs.data.map((pr) => (
          <li key={pr.number} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setExpanded(expanded === pr.number ? null : pr.number)}
                className="min-w-0 flex-1 text-left text-sm font-semibold text-white hover:text-dc-teal"
              >
                {pr.title}
                <span className="block truncate font-mono text-xs font-normal text-white/40">{pr.paths.join(', ')}</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <a href={pr.html_url} target="_blank" rel="noopener" className="rounded-full p-1.5 text-white/40 hover:text-white" aria-label="View diff on GitHub">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  disabled={merge.isPending}
                  onClick={() => onMerge(pr.number)}
                  className="flex items-center gap-1 rounded-full bg-dc-teal px-3 py-1.5 text-xs font-bold text-dc-dark hover:bg-dc-teal-dark disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Merge &amp; sync
                </button>
              </div>
            </div>
            {expanded === pr.number && (
              <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-white/10 bg-dc-dark/40 p-3">
                {preview.isLoading ? (
                  <Spinner className="h-5 w-5" />
                ) : preview.data ? (
                  <MarkdownProse>{preview.data.markdown}</MarkdownProse>
                ) : (
                  <p className="text-sm text-dc-pink-accent">Preview unavailable.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
