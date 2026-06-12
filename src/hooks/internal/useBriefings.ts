import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useExportToDoc } from '@/hooks/internal/useGoogleWorkspace';

export interface BriefingKpi {
  key: string;
  label: string;
  value: string;
  target?: string;
  status?: 'on_track' | 'at_risk' | 'off_track' | string;
}

export interface Briefing {
  id: string;
  week_start: string;
  title: string;
  body_md: string;
  kpis: BriefingKpi[];
  generated_by: string;
  published_at: string | null;
  created_at: string;
  gdoc_id: string | null;
  gdoc_owner_user_id: string | null;
}

export interface PublishResult {
  published: boolean;
  exported: boolean;
  link?: string;
}

/** Weekly operating briefs. RLS: admins see drafts; stakeholders see published only. */
export function useBriefings() {
  return useQuery({
    queryKey: ['aios', 'briefings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aios_briefings')
        .select(
          'id, week_start, title, body_md, kpis, generated_by, published_at, created_at, gdoc_id, gdoc_owner_user_id'
        )
        .order('week_start', { ascending: false });
      if (error) {
        console.error('aios_briefings list failed:', error);
        throw error;
      }
      return (data ?? []) as unknown as Briefing[];
    },
  });
}

/**
 * Admin-only publish gate toggle (RLS rejects non-admins). Publishing also
 * exports the brief to the publisher's Google Drive, best-effort — the same
 * week's doc is overwritten in place via gdoc_id; export failure never blocks
 * the publish itself.
 */
export function usePublishBriefing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const exportDoc = useExportToDoc();

  return useMutation({
    mutationFn: async ({ briefing, publish }: { briefing: Briefing; publish: boolean }): Promise<PublishResult> => {
      const { error } = await supabase
        .from('aios_briefings')
        .update({ published_at: publish ? new Date().toISOString() : null })
        .eq('id', briefing.id);
      if (error) throw error;
      if (!publish) return { published: false, exported: false };

      try {
        // Only reuse the stored doc when the publisher owns it — drive.file
        // tokens are per-user, so another admin's doc can't be updated.
        const docId = briefing.gdoc_owner_user_id === user?.id ? briefing.gdoc_id ?? undefined : undefined;
        const file = await exportDoc.mutateAsync({
          title: briefing.title,
          markdown: briefing.body_md,
          docId,
        });
        const { error: persistError } = await supabase
          .from('aios_briefings')
          .update({ gdoc_id: file.id, gdoc_owner_user_id: user?.id ?? null })
          .eq('id', briefing.id);
        if (persistError) console.error('gdoc_id persist failed:', persistError);
        return { published: true, exported: true, link: file.webViewLink };
      } catch (err) {
        console.error('Brief → Doc export failed:', err);
        return { published: true, exported: false };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'briefings'] });
    },
  });
}
