import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, FileEdit } from 'lucide-react';

interface SocialPostStatusProps {
  campaignId: string;
  socialManagerPath: string; // e.g. '/dashboard/business/social' or '/dashboard/creator/social'
}

export function SocialPostStatus({ campaignId, socialManagerPath }: SocialPostStatusProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: posts } = useQuery({
    queryKey: ['social-post-status', campaignId, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('donny_scheduled_posts')
        .select('id, status, platform, scheduled_for')
        .eq('user_id', user.id)
        .eq('campaign_id', campaignId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!campaignId,
    staleTime: 30_000,
  });

  if (!posts || posts.length === 0) return null;

  const draftCount = posts.filter(p => p.status === 'draft').length;
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const allPosted = draftCount === 0 && scheduledCount === 0 && publishedCount > 0;

  return (
    <div className="bg-white border border-teal-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-dc-text">Social Posts</p>
      <div className="flex items-center gap-4 text-xs">
        {publishedCount > 0 && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> {publishedCount} posted
          </span>
        )}
        {scheduledCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-600">
            <Clock className="h-3.5 w-3.5" /> {scheduledCount} scheduled
          </span>
        )}
        {draftCount > 0 && (
          <span className="flex items-center gap-1 text-dc-text-muted">
            <FileEdit className="h-3.5 w-3.5" /> {draftCount} drafts
          </span>
        )}
      </div>
      {allPosted ? (
        <p className="text-xs text-emerald-600 font-medium">All posted!</p>
      ) : draftCount > 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full text-xs border-dc-teal text-dc-teal"
          onClick={() => navigate(`${socialManagerPath}?tab=drafts`)}
        >
          Review Drafts
        </Button>
      ) : null}
    </div>
  );
}
