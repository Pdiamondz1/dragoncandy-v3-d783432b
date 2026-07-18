import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface UpcomingPost {
  id: string;
  campaign_id: string | null;
  platform: string;
  caption: string | null;
  scheduled_at: string;
  media_urls: string[] | null;
}

const PLATFORM_STYLES: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-600 via-red-500 to-orange-400 text-white',
  tiktok: 'bg-black text-white',
  facebook: 'bg-[#1877F2] text-white',
  x: 'bg-gray-800 text-white',
  youtube: 'bg-red-600 text-white',
};

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Soon';
  if (diffHours < 24) return `In ${diffHours}h`;
  if (diffDays === 1) return 'Tomorrow';
  return `In ${diffDays} days`;
}

export const UpcomingPostsWidget: React.FC = () => {
  const { user } = useAuth();

  const { data: posts, isLoading } = useQuery<UpcomingPost[]>({
    queryKey: ['upcoming-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('donny_scheduled_posts')
        .select('id, campaign_id, platform, caption, scheduled_at, media_urls')
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  if (isLoading || !posts || posts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-dc-teal/15 shadow-dc-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-dc-teal" />
          <h3 className="text-sm font-bold text-gray-900">Upcoming Posts</h3>
        </div>
        <Link
          to="/calendar"
          className="text-xs font-semibold text-dc-teal hover:text-teal-600 flex items-center gap-0.5"
        >
          See Full Calendar
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {posts.map((post) => (
          <div
            key={post.id}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-dc-teal/5 border border-dc-teal/10"
          >
            {/* Thumbnail */}
            <div className="w-10 h-10 rounded-lg bg-dc-teal/10 flex-shrink-0 overflow-hidden">
              {post.media_urls?.[0] ? (
                <img
                  src={post.media_urls[0]}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <CalendarDays className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-900 font-medium truncate">
                {post.caption?.slice(0, 50) || 'Scheduled post'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock className="h-3 w-3 text-dc-text-muted" />
                <span className="text-[10px] text-dc-text-muted">{formatRelativeTime(post.scheduled_at)}</span>
              </div>
            </div>

            {/* Platform badge */}
            <span
              className={`text-[8px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                PLATFORM_STYLES[post.platform?.toLowerCase()] ?? 'bg-dc-teal-btn text-white'
              }`}
            >
              {post.platform?.charAt(0).toUpperCase()}{post.platform?.slice(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
