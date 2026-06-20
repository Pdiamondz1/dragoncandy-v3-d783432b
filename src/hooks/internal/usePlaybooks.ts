import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlaybookStatus = 'active' | 'archived';
export type ProposalTarget = 'dashboard_setting' | 'strategy_doc';
export type RunStatus = 'running' | 'completed' | 'failed';

export interface DoneCheck {
  done: boolean;
  checklist?: Array<{ criterion: string; met: boolean }>;
  missing?: string[];
}

export interface Playbook {
  id: string;
  slug: string;
  title: string;
  task_md: string;
  preferences_md: string;
  done_criteria_md: string;
  allowed_proposals: ProposalTarget[];
  status: PlaybookStatus;
  source_finding_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaybookRun {
  id: string;
  playbook_id: string;
  triggered_by: string | null;
  trigger: 'manual' | 'donny';
  status: RunStatus;
  result_summary_md: string | null;
  done_check: DoneCheck | null;
  correction_ids: string[];
  error_md: string | null;
  started_at: string;
  finished_at: string | null;
}

const PLAYBOOK_COLS =
  'id, slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals, status, source_finding_id, created_by, created_at, updated_at';

/** All playbooks (admin-only via RLS), newest first. */
export function usePlaybooks() {
  return useQuery({
    queryKey: ['aios', 'playbooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aios_playbooks')
        .select(PLAYBOOK_COLS)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('aios_playbooks list failed:', error);
        throw error;
      }
      return (data ?? []) as unknown as Playbook[];
    },
  });
}

/** A single playbook by slug (for the detail page). */
export function usePlaybook(slug: string | undefined) {
  return useQuery({
    queryKey: ['aios', 'playbook', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aios_playbooks')
        .select(PLAYBOOK_COLS)
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Playbook | null;
    },
  });
}

/** Run history for one playbook, newest first. */
export function usePlaybookRuns(playbookId: string | undefined) {
  return useQuery({
    queryKey: ['aios', 'playbook-runs', playbookId],
    enabled: !!playbookId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aios_playbook_runs')
        .select(
          'id, playbook_id, triggered_by, trigger, status, result_summary_md, done_check, correction_ids, error_md, started_at, finished_at',
        )
        .eq('playbook_id', playbookId!)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PlaybookRun[];
    },
  });
}

export interface UpsertPlaybookInput {
  id?: string;
  slug: string;
  title: string;
  task_md: string;
  preferences_md: string;
  done_criteria_md: string;
  allowed_proposals: ProposalTarget[];
  source_finding_id?: string | null;
}

/** Create or edit a playbook (admin-only via RLS). */
export function useUpsertPlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertPlaybookInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        slug: input.slug,
        title: input.title,
        task_md: input.task_md,
        preferences_md: input.preferences_md,
        done_criteria_md: input.done_criteria_md,
        allowed_proposals: input.allowed_proposals,
        source_finding_id: input.source_finding_id ?? null,
      };
      if (input.id) {
        const { error } = await supabase.from('aios_playbooks').update(row).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('aios_playbooks')
          .insert({ ...row, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['aios', 'playbook', vars.slug] });
    },
  });
}

/** Archive or reactivate a playbook. */
export function useSetPlaybookStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PlaybookStatus }) => {
      const { error } = await supabase.from('aios_playbooks').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aios', 'playbooks'] }),
  });
}

export interface RunPlaybookResult {
  success?: boolean;
  run_id?: string;
  status?: RunStatus;
  result_summary_md?: string;
  done_check?: DoneCheck | null;
  correction_ids?: string[];
  error?: string;
}

/**
 * Run a playbook via the aios-playbook-run edge function. The function executes
 * the saved definition report-only + propose; the report and any proposed
 * corrections come back, proposals also landing in /internal/corrections.
 */
export function useRunPlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<RunPlaybookResult> => {
      // functions.invoke uses the configured client URL/anon-key (which carry the
      // prod fallback when VITE_SUPABASE_URL is unset) and attaches the session
      // token automatically — so this works in fallback-env builds too.
      const { data, error } = await supabase.functions.invoke<RunPlaybookResult>(
        'aios-playbook-run',
        { body: { slug, trigger: 'manual' } },
      );
      if (error) {
        // On a non-2xx the server's { error } body is in error.context (a Response).
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = (await ctx.json().catch(() => null)) as RunPlaybookResult | null;
          if (body?.error) message = body.error;
        }
        throw new Error(message);
      }
      return (data ?? {}) as RunPlaybookResult;
    },
    onSuccess: (_d, slug) => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['aios', 'playbook-runs'] });
      // A run may have proposed corrections.
      queryClient.invalidateQueries({ queryKey: ['aios', 'corrections'] });
      void slug;
    },
  });
}
