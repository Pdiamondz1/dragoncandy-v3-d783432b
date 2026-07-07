import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { useLoops } from '@/hooks/internal/useLoops';
import {
  relativeTime,
  type RoutineStatus,
  type PlaybookStatus,
  type RoutineHealth,
  type PlaybookHealth,
} from '@/lib/internalLoops';

const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold';

const ROUTINE_CHIP: Record<RoutineHealth, { label: string; cls: string }> = {
  ok: { label: 'Active', cls: 'border-dc-teal/40 bg-dc-teal/15 text-dc-teal' },
  quiet: { label: 'Quiet', cls: 'border-dc-yellow/40 bg-dc-yellow/15 text-dc-yellow' },
  none: { label: 'No output yet', cls: 'border-white/15 bg-white/[0.06] text-white/50' },
};

const PLAYBOOK_CHIP: Record<PlaybookHealth, { label: string; cls: string }> = {
  ok: { label: 'Done ✓', cls: 'border-dc-teal/40 bg-dc-teal/15 text-dc-teal' },
  attention: { label: 'Needs attention', cls: 'border-dc-yellow/40 bg-dc-yellow/15 text-dc-yellow' },
  error: { label: 'Failed', cls: 'border-dc-pink-accent/50 bg-dc-pink-accent/15 text-dc-pink' },
  running: { label: 'Running…', cls: 'border-dc-teal/40 bg-dc-teal/10 text-dc-teal' },
  never: { label: 'Never run', cls: 'border-white/15 bg-white/[0.06] text-white/50' },
};

function Chip({ label, cls }: { label: string; cls: string }) {
  return <span className={`${CHIP} ${cls}`}>{label}</span>;
}

function RoutineCard({ r, now }: { r: RoutineStatus; now: Date }) {
  const chip = ROUTINE_CHIP[r.health];
  return (
    <Link
      to={r.link}
      className="group block rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm transition-colors hover:border-dc-teal/50 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{r.name}</p>
          <p className="mt-0.5 text-xs text-white/45">{r.cadenceLabel}</p>
        </div>
        <Chip {...chip} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-white/60">
        <span>
          {r.outputLabel} {relativeTime(r.lastOutputAt, now)}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/30 transition-colors group-hover:text-dc-teal" />
      </div>
      {r.note && <p className="mt-2 text-[11px] leading-snug text-white/40">{r.note}</p>}
    </Link>
  );
}

function PlaybookCard({ p, now }: { p: PlaybookStatus; now: Date }) {
  const chip = PLAYBOOK_CHIP[p.health];
  return (
    <Link
      to={`/internal/playbooks/${p.slug}`}
      className="group block rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm transition-colors hover:border-dc-teal/50 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{p.title}</p>
          <p className="mt-0.5 font-mono text-[11px] text-white/40">{p.slug}</p>
        </div>
        <Chip {...chip} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-white/60">
        <span>
          {p.runCount === 0
            ? 'No runs yet'
            : `Last run ${relativeTime(p.lastRunAt, now)} · ${p.runCount} run${p.runCount === 1 ? '' : 's'}`}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/30 transition-colors group-hover:text-dc-teal" />
      </div>
      {p.archived && <p className="mt-2 text-[11px] text-white/40">Archived</p>}
    </Link>
  );
}

export default function InternalLoops() {
  const loops = useLoops();

  if (loops.isLoading) {
    return (
      <PageContainer size="xl">
        <PageHeader title="Loops" />
        <p className="text-sm text-white/50">Loading loops…</p>
      </PageContainer>
    );
  }

  if (loops.isError || !loops.data) {
    return (
      <PageContainer size="xl">
        <PageHeader title="Loops" />
        <ErrorCard message="Loops failed to load. Check your access and try again." />
      </PageContainer>
    );
  }

  const now = new Date();
  const { routines, playbooks, skillLoops } = loops.data;

  // Playbooks: ones that have run first (newest run first), never-run last (by title).
  const sortedPlaybooks = [...playbooks].sort((a, b) => {
    if (!a.lastRunAt && !b.lastRunAt) return a.title.localeCompare(b.title);
    if (!a.lastRunAt) return 1;
    if (!b.lastRunAt) return -1;
    return new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime();
  });

  const routinesActive = routines.filter((r) => r.health === 'ok').length;
  const routinesQuiet = routines.filter((r) => r.health === 'quiet').length;
  const routinesSilent = routines.filter((r) => r.health === 'none').length;
  const playbooksRun = playbooks.filter((p) => p.health !== 'never').length;
  const playbooksAttention = playbooks.filter(
    (p) => p.health === 'attention' || p.health === 'error',
  ).length;

  return (
    <PageContainer size="xl">
      <PageHeader
        title="Loops"
        subtitle="Every automated loop in the AIOS — scheduled routines, Founder Playbooks, and skill loops — and when each last produced output."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Scheduled routines"
          value={routines.length}
          sub={`${routinesActive} active · ${routinesQuiet} quiet · ${routinesSilent} silent`}
        />
        <StatCard
          label="Founder Playbooks"
          value={playbooks.length}
          sub={`${playbooksRun} run · ${playbooks.length - playbooksRun} never run`}
        />
        <StatCard
          label="Needs attention"
          value={playbooksAttention}
          sub="playbooks with a failed / unmet run"
          accent="pink"
        />
        <StatCard label="Skill loops" value={skillLoops.length} sub="MEMORY.md-tracked" />
      </div>

      <SectionHeading>Scheduled routines</SectionHeading>
      <div className="mb-3 rounded-xl border border-dc-teal/15 bg-white/[0.03] p-3 text-xs leading-snug text-white/50">
        There is no central run log — a routine's time is its <span className="text-white/70">last output</span>,
        not a guaranteed last run. These report-only routines file nothing on a clean run, so
        <span className="text-dc-yellow"> Quiet</span> means "no output in a while" (maybe running clean,
        maybe stopped — worth a check), never "failed".
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {routines.map((r) => (
          <RoutineCard key={r.key} r={r} now={now} />
        ))}
      </div>

      <SectionHeading>Founder Playbooks</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-2">
        {sortedPlaybooks.map((p) => (
          <PlaybookCard key={p.slug} p={p} now={now} />
        ))}
      </div>

      <SectionHeading>Skill loops</SectionHeading>
      <p className="mb-3 text-xs text-white/50">
        Interactive loop skills — their state lives in each skill's <span className="font-mono">MEMORY.md</span> and
        git, not the database, so they aren't run-tracked here.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {skillLoops.map((s) => (
          <div
            key={s.name}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <p className="font-mono text-sm font-semibold text-dc-teal">{s.name}</p>
            <p className="mt-1 text-xs text-white/55">{s.desc}</p>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
