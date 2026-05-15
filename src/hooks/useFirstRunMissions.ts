import { useCallback, useEffect } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  type UserRole,
  type RoleMissions,
  parseFirstRunMissions,
  getInitialMissions,
  areMissionsComplete,
} from '@/types/firstRun';

export function useFirstRunMissions() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const role = profile?.role as UserRole | undefined;

  const { data: missions, isLoading } = useQuery({
    queryKey: ['first-run-missions', user?.id],
    queryFn: async () => {
      if (!user?.id || !role) return null;
      const { data } = await (supabase
        .from('profiles')
        .select('first_run_missions')
        .eq('id', user.id)
        .single() as unknown as Promise<{ data: { first_run_missions: unknown } | null }>);
      return parseFirstRunMissions(
        (data?.first_run_missions ?? null) as Parameters<typeof parseFirstRunMissions>[0],
        role,
      );
    },
    enabled: !!user?.id && !!role,
  });

  const updateMutation = useMutation({
    mutationFn: async (updated: RoleMissions) => {
      if (!user?.id) throw new Error('No user');
      const { error } = await (supabase
        .from('profiles')
        .update({ first_run_missions: updated as unknown as Record<string, unknown> })
        .eq('id', user.id) as unknown as Promise<{ error: Error | null }>);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['first-run-missions', user?.id] });
    },
    onError: (err) => { console.error('Failed to update missions:', err); },
  });

  // Initialize missions on first dashboard visit if null
  useEffect(() => {
    if (!user?.id || !role || isLoading) return;
    if (missions === null) {
      const initial = getInitialMissions(role);
      updateMutation.mutate(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role, missions, isLoading]);

  const completeMission = useCallback(
    (key: string) => {
      if (!missions || missions.completed_at) return;
      const updated = { ...missions, [key]: true };
      if (areMissionsComplete(updated as RoleMissions)) {
        (updated as Record<string, unknown>).completed_at = new Date().toISOString();
      }
      updateMutation.mutate(updated as RoleMissions);

      // Track analytics — fire-and-forget
      supabase.from('analytics_events').insert({
        event_type: areMissionsComplete(updated as RoleMissions)
          ? 'first_run_all_complete'
          : 'first_run_mission_complete',
        user_id: user!.id,
        event_data: { role, mission_key: key },
        page_url: window.location.pathname,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missions, user?.id, role],
  );

  const skipMissions = useCallback(() => {
    if (!user?.id) return;
    const skipped = {
      ...(missions ?? getInitialMissions(role!)),
      completed_at: new Date().toISOString(),
    };
    updateMutation.mutate(skipped as RoleMissions);
    // Track analytics — fire-and-forget
    supabase.from('analytics_events').insert({
      event_type: 'first_run_skipped',
      user_id: user.id,
      event_data: { role },
      page_url: window.location.pathname,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, user?.id, role]);

  const isFirstRun = !!missions && !missions.completed_at;

  return {
    missions,
    isFirstRun,
    isLoading,
    completeMission,
    skipMissions,
  };
}
