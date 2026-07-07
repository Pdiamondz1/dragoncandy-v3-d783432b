import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { composeLoops, ROUTINES, type ComposeInput, type DoneCheck, type LoopsData } from '@/lib/internalLoops';

type FindingRow = { source: string; created_at: string; last_seen_at: string | null };
type PlaybookRow = { id: string; slug: string; title: string; status: string };
type RunRow = {
  playbook_id: string;
  status: string;
  done_check: DoneCheck | null;
  started_at: string;
  finished_at: string | null;
};

/**
 * Mission-control view of every AIOS loop (admin-only via RLS). There is no
 * central loop-runs table, so we read each loop's *output*. Queries are
 * **per-entity** (latest finding per source, latest run + exact count per
 * playbook) rather than one global `.order().limit()` — a global fetch is capped
 * at 1000 rows by PostgREST, which would silently drop older sources / undercount
 * runs once the tables grow. Bounded by the routine/playbook count, not table size.
 */
export function useLoops() {
  return useQuery<LoopsData>({
    queryKey: ['aios', 'loops'],
    queryFn: async () => {
      const findingSources = ROUTINES.filter((r) => r.signal.type === 'findings').map(
        (r) => (r.signal as { type: 'findings'; source: string }).source,
      );

      // Wave 1: latest finding per source, latest briefing, and the playbook list — all independent.
      const [findingResults, briefingRes, playbooksRes] = await Promise.all([
        Promise.all(
          findingSources.map((src) =>
            supabase
              .from('aios_findings')
              .select('source, created_at, last_seen_at')
              .eq('source', src)
              .order('last_seen_at', { ascending: false })
              .limit(1),
          ),
        ),
        supabase.from('aios_briefings').select('created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('aios_playbooks').select('id, slug, title, status').order('slug', { ascending: true }),
      ]);

      if (briefingRes.error) throw briefingRes.error;
      if (playbooksRes.error) throw playbooksRes.error;
      for (const r of findingResults) if (r.error) throw r.error;

      const playbookRows = (playbooksRes.data ?? []) as PlaybookRow[];

      // Wave 2: per playbook, the latest run row + the EXACT total run count (head+count).
      const runResults = await Promise.all(
        playbookRows.map((p) =>
          supabase
            .from('aios_playbook_runs')
            .select('playbook_id, status, done_check, started_at, finished_at', { count: 'exact' })
            .eq('playbook_id', p.id)
            .order('started_at', { ascending: false })
            .limit(1),
        ),
      );
      for (const r of runResults) if (r.error) throw r.error;

      const input: ComposeInput = {
        findings: findingResults.flatMap((r) => (r.data ?? []) as FindingRow[]),
        playbooks: playbookRows,
        runs: runResults.flatMap((r) => (r.data ?? []) as RunRow[]),
        runCountByPlaybook: Object.fromEntries(
          playbookRows.map((p, i) => [p.id, runResults[i].count ?? 0]),
        ),
        latestBriefingAt: briefingRes.data?.[0]?.created_at ?? null,
      };

      return composeLoops(input, new Date());
    },
  });
}
