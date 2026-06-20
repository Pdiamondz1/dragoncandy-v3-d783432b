import type { PlaybookRun } from '@/hooks/internal/usePlaybooks';

// Matches the runner's STALE_RUN_MS: a 'running' row older than this is a
// dead/killed run the server will reap on the next invocation — show it as timed
// out rather than perpetually "Running…".
const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * Three-state run outcome chip (plus running/timed-out/failed). A null done_check
 * means the run produced no parseable self-assessment — rendered as a neutral
 * chip, not a pass/fail (spec §5).
 */
export const PlaybookDoneChip = ({ run }: { run: PlaybookRun }) => {
  let label: string;
  let cls: string;

  const isStale =
    run.status === 'running' && Date.now() - new Date(run.started_at).getTime() > STALE_RUN_MS;

  if (isStale) {
    label = 'Timed out';
    cls = 'bg-dc-pink-accent text-white';
  } else if (run.status === 'running') {
    label = 'Running…';
    cls = 'bg-dc-yellow/80 text-dc-dark';
  } else if (run.status === 'failed') {
    label = 'Failed';
    cls = 'bg-dc-pink-accent text-white';
  } else if (run.done_check == null) {
    label = 'No self-assessment';
    cls = 'bg-white/10 text-white/70';
  } else if (run.done_check.done) {
    label = 'Done';
    cls = 'bg-dc-teal text-dc-dark';
  } else {
    label = 'Incomplete';
    cls = 'bg-dc-yellow/80 text-dc-dark';
  }

  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{label}</span>
  );
};
