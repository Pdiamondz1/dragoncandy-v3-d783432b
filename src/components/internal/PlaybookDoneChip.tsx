import type { PlaybookRun } from '@/hooks/internal/usePlaybooks';

/**
 * Three-state run outcome chip (plus running/failed). A null done_check means the
 * run produced no parseable self-assessment — rendered as a neutral chip, not a
 * pass/fail (spec §5).
 */
export const PlaybookDoneChip = ({ run }: { run: PlaybookRun }) => {
  let label: string;
  let cls: string;

  if (run.status === 'running') {
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
