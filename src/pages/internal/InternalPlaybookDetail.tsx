import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Play } from 'lucide-react';
import {
  usePlaybook,
  usePlaybookRuns,
  useRunPlaybook,
  type PlaybookRun,
} from '@/hooks/internal/usePlaybooks';
import { PlaybookDoneChip } from '@/components/internal/PlaybookDoneChip';
import { ErrorCard } from '@/components/internal/stats';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';

const RunCard = ({ run }: { run: PlaybookRun }) => (
  <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-white/50">
        {new Date(run.started_at).toLocaleString()} · {run.trigger}
      </p>
      <PlaybookDoneChip run={run} />
    </div>

    {run.status === 'failed' && run.error_md && (
      <p className="mt-2 rounded-xl border border-dc-pink-accent/30 bg-dc-pink-accent/[0.06] p-3 text-xs text-dc-pink">
        {run.error_md}
      </p>
    )}

    {run.result_summary_md && (
      <div className="mt-3">
        <MarkdownProse>{run.result_summary_md}</MarkdownProse>
      </div>
    )}

    {run.done_check?.checklist && run.done_check.checklist.length > 0 && (
      <ul className="mt-3 space-y-1">
        {run.done_check.checklist.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-white/70">
            <span className={c.met ? 'text-dc-teal' : 'text-dc-pink'}>{c.met ? '✓' : '✗'}</span>
            <span>{c.criterion}</span>
          </li>
        ))}
      </ul>
    )}

    {run.correction_ids.length > 0 && (
      <p className="mt-3 text-xs text-white/60">
        Proposed {run.correction_ids.length} correction
        {run.correction_ids.length > 1 ? 's' : ''} —{' '}
        <Link to="/internal/corrections" className="text-dc-teal hover:underline">
          review at Corrections
        </Link>
        .
      </p>
    )}
  </div>
);

const DefinitionBlock = ({ label, body }: { label: string; body: string }) =>
  body.trim() ? (
    <div>
      <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-white/40">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-white/70">{body}</p>
    </div>
  ) : null;

const InternalPlaybookDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const playbook = usePlaybook(slug);
  const runs = usePlaybookRuns(playbook.data?.id);
  const run = useRunPlaybook();

  if (playbook.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (playbook.isError) return <ErrorCard message="Playbook failed to load." />;
  if (!playbook.data) {
    return (
      <div className="max-w-3xl">
        <Link to="/internal/playbooks" className="text-sm text-dc-teal hover:underline">
          ← Playbooks
        </Link>
        <ErrorCard message={`No playbook with slug '${slug}'.`} />
      </div>
    );
  }

  const pb = playbook.data;
  const handleRun = () =>
    run.mutate(pb.slug, {
      onSuccess: () => toast.success('Playbook run complete.'),
      onError: (e) => toast.error(`Run failed — ${(e as Error)?.message ?? 'try again.'}`),
    });

  return (
    <div className="max-w-3xl">
      <Link
        to="/internal/playbooks"
        className="flex items-center gap-1 text-sm text-dc-teal hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Playbooks
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">{pb.title}</h1>
          <p className="mt-1 font-mono text-xs text-white/50">{pb.slug}</p>
        </div>
        {pb.status === 'active' && (
          <button
            type="button"
            onClick={handleRun}
            disabled={run.isPending}
            className="flex items-center gap-1.5 rounded-full bg-dc-teal px-5 py-1.5 text-sm font-bold text-dc-dark transition-colors hover:bg-dc-teal/80 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {run.isPending ? 'Running…' : 'Run now'}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
        <DefinitionBlock label="Task" body={pb.task_md} />
        <DefinitionBlock label="Preferences & constraints" body={pb.preferences_md} />
        <DefinitionBlock label="Definition of done" body={pb.done_criteria_md} />
        <p className="text-xs text-white/50">
          {pb.allowed_proposals.length === 0
            ? 'Report-only — proposes nothing.'
            : `May propose: ${pb.allowed_proposals.join(', ')} (you approve at Corrections).`}
        </p>
      </div>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-white/60">Run history</h2>
      <div className="mt-3 space-y-3">
        {runs.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-8 w-8 border-teal-400" />
          </div>
        ) : !runs.data || runs.data.length === 0 ? (
          <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 text-sm text-white/60 backdrop-blur-sm">
            No runs yet — hit Run now.
          </div>
        ) : (
          runs.data.map((r) => <RunCard key={r.id} run={r} />)
        )}
      </div>
    </div>
  );
};

export default InternalPlaybookDetail;
