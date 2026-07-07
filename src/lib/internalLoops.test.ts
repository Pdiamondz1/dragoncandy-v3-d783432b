import { describe, it, expect } from 'vitest';
import {
  routineHealth,
  playbookHealth,
  relativeTime,
  composeLoops,
  ROUTINES,
  type ComposeInput,
} from './internalLoops';

const NOW = new Date('2026-07-07T12:00:00Z');
const iso = (d: string) => new Date(d).toISOString();

describe('routineHealth', () => {
  it('is "none" when the routine has never produced output', () => {
    expect(routineHealth(1, null, NOW)).toBe('none');
    expect(routineHealth(30, null, NOW)).toBe('none');
  });

  it('is "ok" when output is within ~2 cadences', () => {
    expect(routineHealth(1, iso('2026-07-07T00:00:00Z'), NOW)).toBe('ok'); // 0.5d, daily
    expect(routineHealth(30, iso('2026-06-20T00:00:00Z'), NOW)).toBe('ok'); // ~17d, monthly
  });

  it('is "quiet" when output is well past the cadence', () => {
    expect(routineHealth(1, iso('2026-07-01T00:00:00Z'), NOW)).toBe('quiet'); // ~6d, daily
    expect(routineHealth(30, iso('2026-04-01T00:00:00Z'), NOW)).toBe('quiet'); // ~97d, monthly
  });
});

describe('playbookHealth', () => {
  it('is "never" with no run', () => {
    expect(playbookHealth(null, null, null)).toBe('never');
  });
  it('is "running" only while fresh, "stale" once past STALE_RUN_MS', () => {
    expect(playbookHealth('running', null, 60_000)).toBe('running'); // 1 min
    expect(playbookHealth('running', null, 20 * 60_000)).toBe('stale'); // 20 min > 15
  });
  it('maps failed directly', () => {
    expect(playbookHealth('failed', null, null)).toBe('error');
  });
  it('uses the done-check verdict on a completed run', () => {
    expect(playbookHealth('completed', true, null)).toBe('ok');
    expect(playbookHealth('completed', false, null)).toBe('attention');
    expect(playbookHealth('completed', null, null)).toBe('ok'); // no verdict block → neutral pass
  });
});

describe('relativeTime', () => {
  it('handles the buckets', () => {
    expect(relativeTime(null, NOW)).toBe('never');
    expect(relativeTime(iso('2026-07-07T11:59:40Z'), NOW)).toBe('just now');
    expect(relativeTime(iso('2026-07-07T11:30:00Z'), NOW)).toBe('30m ago');
    expect(relativeTime(iso('2026-07-07T09:00:00Z'), NOW)).toBe('3h ago');
    expect(relativeTime(iso('2026-07-01T12:00:00Z'), NOW)).toBe('6d ago');
    expect(relativeTime(iso('2026-05-07T12:00:00Z'), NOW)).toBe('2mo ago');
    expect(relativeTime(iso('2025-05-07T12:00:00Z'), NOW)).toBe('1y ago');
  });
  it('clamps a future timestamp to "just now"', () => {
    expect(relativeTime(iso('2026-07-08T12:00:00Z'), NOW)).toBe('just now');
  });
});

describe('composeLoops', () => {
  const base: ComposeInput = {
    findings: [
      { source: 'bug-sweep-agent', created_at: iso('2026-07-06T07:00:00Z'), last_seen_at: iso('2026-07-06T07:00:00Z') },
      { source: 'bug-sweep-agent', created_at: iso('2026-07-01T07:00:00Z'), last_seen_at: iso('2026-07-01T07:00:00Z') },
      // re-filed fingerprint: old created_at, fresh last_seen_at (the ingest bumps last_seen_at only)
      { source: 'loop-scout', created_at: iso('2026-06-01T08:00:00Z'), last_seen_at: iso('2026-07-07T08:00:00Z') },
    ],
    playbooks: [
      { id: 'p1', slug: 'dezzy-outreach', title: 'Dezzy — Outreach', status: 'active' },
      { id: 'p2', slug: 'never-run', title: 'Never Run', status: 'active' },
      { id: 'p3', slug: 'archived-one', title: 'Archived', status: 'archived' },
      { id: 'p4', slug: 'stuck-run', title: 'Stuck', status: 'active' },
    ],
    runs: [
      { playbook_id: 'p1', status: 'completed', done_check: { done: true }, started_at: iso('2026-06-28T00:00:00Z'), finished_at: iso('2026-06-28T00:05:00Z') },
      { playbook_id: 'p1', status: 'completed', done_check: { done: false }, started_at: iso('2026-06-20T00:00:00Z'), finished_at: iso('2026-06-20T00:05:00Z') },
      // a `running` row started 60 min before NOW → past STALE_RUN_MS, must read as stale
      { playbook_id: 'p4', status: 'running', done_check: null, started_at: iso('2026-07-07T11:00:00Z'), finished_at: null },
    ],
    latestBriefingAt: iso('2026-07-06T07:04:00Z'),
  };

  it('maps every registry routine and picks the newest finding per source', () => {
    const { routines } = composeLoops(base, NOW);
    expect(routines).toHaveLength(ROUTINES.length);
    const bug = routines.find((r) => r.key === 'bug-sweep-agent')!;
    expect(bug.lastOutputAt).toBe(iso('2026-07-06T07:00:00Z')); // newest of the two
    expect(bug.health).toBe('ok');
    const scout = routines.find((r) => r.key === 'loop-scout-agent')!;
    expect(scout.lastOutputAt).toBe(iso('2026-07-07T08:00:00Z')); // last_seen_at wins over old created_at
    expect(scout.health).toBe('ok');
    const weekly = routines.find((r) => r.key === 'weekly-brief-agent')!;
    expect(weekly.lastOutputAt).toBe(iso('2026-07-06T07:04:00Z')); // from briefings, not findings
    const strat = routines.find((r) => r.key === 'strategy-library-audit-agent')!;
    expect(strat.lastOutputAt).toBeNull(); // no strategy-audit findings
    expect(strat.health).toBe('none');
  });

  it('uses the newest run for playbook health and counts runs', () => {
    const { playbooks } = composeLoops(base, NOW);
    const p1 = playbooks.find((p) => p.slug === 'dezzy-outreach')!;
    expect(p1.runCount).toBe(2);
    expect(p1.lastRunAt).toBe(iso('2026-06-28T00:05:00Z')); // finished_at of newest
    expect(p1.done).toBe(true); // newest run's verdict, not the older false
    expect(p1.health).toBe('ok');
    const p2 = playbooks.find((p) => p.slug === 'never-run')!;
    expect(p2.runCount).toBe(0);
    expect(p2.health).toBe('never');
    const p3 = playbooks.find((p) => p.slug === 'archived-one')!;
    expect(p3.archived).toBe(true);
    const p4 = playbooks.find((p) => p.slug === 'stuck-run')!;
    expect(p4.lastRunStatus).toBe('running');
    expect(p4.health).toBe('stale'); // running >15min before NOW → reaped, not live
  });

  it('always returns the static skill loops', () => {
    expect(composeLoops(base, NOW).skillLoops.map((s) => s.name)).toContain('knowledge-sync');
  });
});
