import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Share2, Eye } from 'lucide-react';

interface SocialNudgeBannerProps {
  campaignId: string;
  socialManagerPath: string;
}

export function SocialNudgeBanner({ campaignId, socialManagerPath }: SocialNudgeBannerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: nudge } = useQuery({
    queryKey: ['social-nudge', campaignId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('donny_nudges')
        .select('id, nudge_type, source_table, metadata')
        .eq('user_id', user.id)
        .eq('source_table', 'campaign_social_hooks')
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data?.metadata && (data.metadata as Record<string, unknown>).campaign_id === campaignId) {
        return data;
      }
      return null;
    },
    enabled: !!user && !!campaignId,
    staleTime: 30_000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (nudgeId: string) => {
      const { error } = await supabase
        .from('donny_nudges')
        .update({ status: 'dismissed' })
        .eq('id', nudgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-nudge', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['donny-nudges'] });
    },
  });

  if (!nudge) return null;

  return (
    <div className="bg-gradient-to-r from-teal-50 to-pink-50 border border-teal-200 rounded-2xl p-4 relative">
      <button
        className="absolute top-2 right-2 text-dc-text-muted hover:text-dc-text"
        onClick={() => dismissMutation.mutate(nudge.id)}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="font-semibold text-dc-text text-sm mb-2">
        Your content is ready to share!
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white text-xs font-bold flex-1"
          onClick={() => navigate(`${socialManagerPath}?tab=compose`)}
        >
          <Share2 className="h-3 w-3 mr-1" /> Post Now
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-dc-teal text-dc-teal text-xs font-semibold flex-1"
          onClick={() => navigate(`${socialManagerPath}?tab=drafts`)}
        >
          <Eye className="h-3 w-3 mr-1" /> Review Draft
        </Button>
      </div>
    </div>
  );
}
