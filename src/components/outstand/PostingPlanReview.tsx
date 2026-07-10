import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Loader2, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { VideoFrameThumbnail } from '@/components/content/VideoFrameThumbnail';
import { ScheduleConfirmation } from './ScheduleConfirmation';
import { toDatetimeLocal } from '@/lib/dateUtils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PostingPlanMediaItem {
  url: string;
  fileId?: string;
  mimeType?: string;
  filename?: string;
  storedThumbnailUrl?: string;
}

export interface PostingPlanReviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  campaignDescription?: string;
  mediaItems: PostingPlanMediaItem[];
  userRole: 'restaurant' | 'creator' | 'brand';
}

interface PlannedPost {
  content_type: string;
  platform: string;
  caption: string;
  hashtags: string[];
  media_urls: string[];
  scheduled_at: string;
  ai_reasoning: string;
  plan_order: number;
  purpose: string;
}

interface PostingPlan {
  plan_id: string;
  posts: PlannedPost[];
  strategy_summary: string;
}

type ViewState = 'loading' | 'review' | 'scheduling' | 'confirmed' | 'error';

const PLATFORM_STYLES: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-600 via-red-500 to-orange-400 text-white',
  tiktok: 'bg-black text-white',
  facebook: 'bg-[#1877F2] text-white',
  x: 'bg-gray-800 text-white',
  youtube: 'bg-red-600 text-white',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video_reel: 'Reel',
  story: 'Story',
  carousel: 'Carousel',
  photo: 'Post',
  tiktok: 'TikTok',
  youtube_short: 'Short',
};

function formatPostTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (d.toDateString() === now.toDateString()) return `Today at ${timeStr}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow at ${timeStr}`;
  return `${dateStr} at ${timeStr}`;
}

function PostingPlanReviewInner({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  campaignDescription,
  mediaItems,
  userRole: _userRole,
}: PostingPlanReviewProps) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const crossPost = useCrossPost();
  const { user } = useAuth();
  const { toast } = useToast();

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [plan, setPlan] = useState<PostingPlan | null>(null);
  const [posts, setPosts] = useState<PlannedPost[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [_confirmedPlanId, setConfirmedPlanId] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const generatePlan = useCallback(async () => {
    if (!user?.id || !campaignId) return;
    setViewState('loading');
    setErrorMsg('');

    try {
      const { data: accts } = await supabase
        .from('business_outstand_accounts')
        .select('platform, platform_handle')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (!accts?.length) {
        setErrorMsg('No connected social accounts found. Connect an account in Settings first.');
        setViewState('error');
        return;
      }

      const { data: campaignRow } = await supabase
        .from('campaigns')
        .select('ai_analysis, campaign_type, deadline')
        .eq('id', campaignId)
        .single();

      const contentStrategy = campaignRow?.ai_analysis?.content_strategy ?? null;

      const deliverables = mediaItems.map(item => ({
        url: item.url,
        mime_type: item.mimeType ?? (item.url.match(/\.(mp4|mov|webm)$/i) ? 'video/mp4' : 'image/jpeg'),
        filename: item.filename,
        file_id: item.fileId,
      }));

      const { data, error } = await supabase.functions.invoke('content-posting-plan', {
        body: {
          deliverables,
          content_strategy: contentStrategy,
          connected_platforms: accts.map(a => ({
            platform: a.platform,
            platform_handle: a.platform_handle,
          })),
          campaign: {
            id: campaignId,
            title: campaignTitle,
            type: campaignRow?.campaign_type ?? 'ugc_content',
            deadline: campaignRow?.deadline,
            description: campaignDescription,
            key_messages: campaignRow?.ai_analysis?.key_messages,
            hashtags: campaignRow?.ai_analysis?.hashtags,
          },
          user_id: user.id,
        },
      });

      if (error) throw new Error(error.message ?? 'Failed to generate posting plan');
      if (data?.error) throw new Error(data.error);

      setPlan(data);
      setPosts(data.posts ?? []);
      setViewState('review');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setErrorMsg(msg);
      setRetryCount(prev => prev + 1);
      setViewState('error');
    }
  }, [user?.id, campaignId, campaignTitle, campaignDescription, mediaItems]);

  useEffect(() => {
    if (open && viewState === 'loading') {
      generatePlan();
    }
  }, [open, generatePlan, viewState]);

  const handleRemovePost = (index: number) => {
    setPosts(prev => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, plan_order: i + 1 })));
  };

  const handleUpdateCaption = (index: number, newCaption: string) => {
    setPosts(prev => prev.map((p, i) => i === index ? { ...p, caption: newCaption } : p));
  };

  const handleUpdateTime = (index: number, newTime: string) => {
    setPosts(prev => prev.map((p, i) => i === index ? { ...p, scheduled_at: new Date(newTime).toISOString() } : p));
  };

  const handleRegenerate = () => {
    if (posts.length > 0) {
      const confirmed = window.confirm('This will replace your edits with a new plan. Continue?');
      if (!confirmed) return;
    }
    setRetryCount(0);
    setPlan(null);
    setPosts([]);
    setViewState('loading');
    generatePlan();
  };

  const handleScheduleAll = async () => {
    if (!plan || posts.length === 0 || !accounts?.length) return;
    setViewState('scheduling');

    try {
      const planGroupId = plan.plan_id;
      const accountIds = accounts.map((a: { id: string }) => a.id);

      for (const post of posts) {
        const fullCaption = post.hashtags.length > 0
          ? `${post.caption}\n\n${post.hashtags.join(' ')}`
          : post.caption;

        const result = await crossPost.mutateAsync({
          caption: fullCaption,
          mediaUrls: post.media_urls,
          accountIds,
          scheduledAt: post.scheduled_at,
        });

        const outstandPostId = result?._outstandPostId ?? null;

        await supabase.from('donny_scheduled_posts').insert({
          user_id: user!.id,
          campaign_id: campaignId,
          content_type: post.content_type,
          platform: post.platform,
          caption: post.caption,
          hashtags: post.hashtags,
          media_urls: post.media_urls,
          scheduled_at: post.scheduled_at,
          status: 'scheduled',
          plan_group_id: planGroupId,
          plan_order: post.plan_order,
          metadata: {
            outstand_post_id: outstandPostId,
            social_account_ids: accountIds,
          },
        });
      }

      setConfirmedPlanId(planGroupId);
      setViewState('confirmed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scheduling failed';
      toast({ variant: 'destructive', title: 'Scheduling Error', description: msg });
      setViewState('review');
    }
  };

  const renderContent = () => {
    if (viewState === 'loading') {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
          <p className="text-sm text-dc-text-muted">Donny is building your posting plan…</p>
        </div>
      );
    }

    if (viewState === 'error') {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-sm text-red-600 text-center px-4">{errorMsg}</p>
          {retryCount < 2 ? (
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-dc-teal text-white text-sm font-semibold hover:bg-teal-500 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </button>
          ) : (
            <p className="text-xs text-dc-text-muted">Unable to generate plan. Close and try the single-post flow instead.</p>
          )}
        </div>
      );
    }

    if (viewState === 'confirmed') {
      const confirmedPosts = posts.map(p => ({
        scheduledAt: p.scheduled_at,
        platformNames: [p.platform],
        fileCount: p.media_urls.length,
      }));
      return (
        <ScheduleConfirmation
          posts={confirmedPosts}
          campaignTitle={campaignTitle}
          onDone={() => onOpenChange(false)}
        />
      );
    }

    if (viewState === 'scheduling') {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
          <p className="text-sm text-dc-text-muted">Scheduling {posts.length} posts…</p>
        </div>
      );
    }

    // review state
    return (
      <div className="flex flex-col h-full">
        {/* Strategy summary */}
        {plan?.strategy_summary && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-3">
            <p className="text-xs text-dc-teal font-semibold">Donny's Strategy</p>
            <p className="text-[11px] text-dc-text-muted mt-0.5">{plan.strategy_summary}</p>
          </div>
        )}

        {/* Post list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2.5">
          {posts.map((post, index) => {
            const isExpanded = expandedIndex === index;
            const isEditingThis = editingCaption === index;
            const mediaItem = mediaItems.find(m => m.url === post.media_urls[0]);
            const isVideo = mediaItem?.mimeType?.startsWith('video/') ||
              post.content_type === 'video_reel' || post.content_type === 'tiktok' || post.content_type === 'youtube_short';

            return (
              <div key={`${post.plan_order}-${index}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Post header */}
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="w-full flex items-center gap-2.5 p-3 text-left"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    {isVideo && post.media_urls[0] ? (
                      <VideoFrameThumbnail
                        fileId={mediaItem?.fileId ?? ''}
                        videoUrl={post.media_urls[0]}
                        storedThumbnailUrl={mediaItem?.storedThumbnailUrl ?? null}
                        mimeType={mediaItem?.mimeType ?? 'video/mp4'}
                        filename={mediaItem?.filename ?? ''}
                      />
                    ) : post.media_urls[0] ? (
                      <img src={post.media_urls[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No media</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-dc-teal/15 text-dc-teal">
                        {CONTENT_TYPE_LABELS[post.content_type] ?? post.content_type}
                      </span>
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${PLATFORM_STYLES[post.platform] ?? 'bg-gray-600 text-white'}`}>
                        {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                      </span>
                    </div>
                    <p className="text-[11px] text-dc-text-muted truncate">{formatPostTime(post.scheduled_at)}</p>
                  </div>

                  {/* Expand/remove */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemovePost(index); }}
                      className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-gray-100 pt-2.5 space-y-2">
                    {/* Caption */}
                    {isEditingThis ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={post.caption}
                          onChange={e => handleUpdateCaption(index, e.target.value)}
                          className="w-full text-xs text-dc-text border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-dc-teal"
                          rows={4}
                        />
                        <button
                          onClick={() => setEditingCaption(null)}
                          className="text-[10px] font-semibold text-dc-teal hover:underline"
                        >
                          Done editing
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-dc-text whitespace-pre-wrap line-clamp-3">{post.caption}</p>
                        <button
                          onClick={() => setEditingCaption(index)}
                          className="text-[10px] font-semibold text-dc-teal hover:underline mt-1"
                        >
                          Edit caption
                        </button>
                      </div>
                    )}

                    {/* Hashtags */}
                    {post.hashtags.length > 0 && (
                      <p className="text-[10px] text-dc-teal font-medium">{post.hashtags.join(' ')}</p>
                    )}

                    {/* Time picker */}
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 text-dc-teal flex-shrink-0" />
                      <input
                        type="datetime-local"
                        value={toDatetimeLocal(new Date(post.scheduled_at))}
                        onChange={e => handleUpdateTime(index, e.target.value)}
                        className="text-[11px] text-dc-text border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-dc-teal"
                      />
                    </div>

                    {/* AI reasoning */}
                    {post.ai_reasoning && (
                      <p className="text-[10px] text-dc-text-muted italic">{post.ai_reasoning}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="pt-3 space-y-2 flex-shrink-0">
          <button
            onClick={handleScheduleAll}
            disabled={posts.length === 0 || !accounts?.length}
            className="w-full flex items-center justify-center gap-2 bg-dc-teal text-white text-sm font-bold py-3.5 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CalendarDays className="h-4 w-4" />
            Schedule All ({posts.length})
          </button>
          <button
            onClick={handleRegenerate}
            className="w-full py-3 rounded-full bg-white text-dc-text-muted text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5 inline mr-1.5" />
            Let Donny Decide
          </button>
        </div>
      </div>
    );
  };

  const content = (
    <div className="max-h-[85vh] flex flex-col">
      {renderContent()}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85svh] flex flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="pb-2 flex-shrink-0">
            <SheetTitle className="text-sm font-bold text-dc-text">Donny's Posting Plan</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-4">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-sm font-bold text-dc-text">Donny's Posting Plan</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export function PostingPlanReview(props: PostingPlanReviewProps) {
  if (!props.open) return null;
  return <PostingPlanReviewInner {...props} />;
}
