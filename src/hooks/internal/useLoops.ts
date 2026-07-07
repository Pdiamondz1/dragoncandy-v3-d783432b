import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { composeLoops, type ComposeInput, type DoneCheck, type LoopsData } from '@/lib/internalLoops';

/**
 * Mission-control view of every AIOS loop (admin-only via RLS). There is no
 * central loop-runs table, so we read each loop's *output* — findings by source,
 * playbook runs + verdicts, the latest briefing — and compose the view with the
 * pure `composeLoops` helper. See src/lib/internalLoops.ts for the honesty caveats.
 */
export function useLoops() {
  return useQuery<LoopsData>({
    queryKey: ['aios', 'loops'],
    queryFn: async () => {
      const [findingsRes, playbooksRes, runsRes, briefingRes] = await Promise.all([
        supabase
          .from('aios_findings')
          .select('source, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('aios_playbooks')
          .select('id, slug, title, status')
          .order('slug', { ascending: true }),
        supabase
          .from('aios_playbook_runs')
          .select('playbook_id, status, done_check, started_at, finished_at')
          .order('started_at', { ascending: false }),
        supabase
          .from('aios_briefings')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      for (const [label, res] of [
        ['aios_findings', findingsRes],
        ['aios_playbooks', playbooksRes],
        ['aios_playbook_runs', runsRes],
        ['aios_briefings', briefingRes],
      ] as const) {
        if (res.error) {
          console.error(`loops: ${label} query failed:`, res.error);
          throw res.error;
        }
      }

      const input: ComposeInput = {
        findings: (findingsRes.data ?? []) as { source: string; created_at: string }[],
        playbooks: (playbooksRes.data ?? []) as {
          id: string;
          slug: string;
          title: string;
          status: string;
        }[],
        runs: (runsRes.data ?? []) as {
          playbook_id: string;
          status: string;
          done_check: DoneCheck | null;
          started_at: string;
          finished_at: string | null;
        }[],
        latestBriefingAt: briefingRes.data?.[0]?.created_at ?? null,
      };

      return composeLoops(input, new Date());
    },
  });
}
