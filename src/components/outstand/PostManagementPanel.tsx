import React, { useState, useEffect } from 'react';
import type { Post } from '@outstand-so/ui';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, Trash2, RefreshCw, Pencil, ExternalLink, Loader2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { VideoFrameThumbnail } from '@/components/content/VideoFrameThumbnail';
import { isScheduled } from '@/lib/outstandUtils';
import logo from '@/assets/Transparent_DragonCandy_logo.webp';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PostManagementPanelProps {
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  campaignLink?: string;
}

const PLATFORM_STYLES: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-600 via-red-500 to-orange-400 text-white',
  tiktok: 'bg-black text-white',
  facebook: 'bg-[#1877F2] text-white',
  x: 'bg-gray-800 text-white',
  youtube: 'bg-red-600 text-white',
};

export const PostManagementPanel: React.FC<PostManagementPanelProps> = ({
  post,
  open,
  onOpenChange,
  onChanged,
  campaignLink,
}) => {
  const isMobile = useIsMobile();
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();
  const { user } = useAuth();

  const [editingCaption, setEditingCaption] = useState(false);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDateTime, setNewDateTime] = useState('');
  const [cancellingPlan, setCancellingPlan] = useState(false);
  const [heroMediaError, setHeroMediaError] = useState(false);

  // Look up plan context from donny_scheduled_posts by matching scheduled time
  const postScheduledAt = post?.scheduledAt;
  const { data: planContext } = useQuery({
    queryKey: ['plan-context', postScheduledAt, user?.id],
    queryFn: async () => {
      if (!user || !postScheduledAt) return null;
      const schedDate = new Date(postScheduledAt);
      const windowStart = new Date(schedDate.getTime() - 60_000).toISOString();
      const windowEnd = new Date(schedDate.getTime() + 60_000).toISOString();

      const { data: match } = await supabase
        .from('donny_scheduled_posts')
        .select('plan_group_id, campaign_id, media_urls')
        .eq('user_id', user.id)
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd)
        .not('plan_group_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!match?.plan_group_id) return null;

      const { data: siblings } = await supabase
        .from('donny_scheduled_posts')
        .select('id, status')
        .eq('plan_group_id', match.plan_group_id)
        .neq('status', 'cancelled');

      return {
        planGroupId: match.plan_group_id as string,
        siblingCount: siblings?.length ?? 0,
        mediaUrls: match.media_urls as string[] | null,
      };
    },
    enabled: !!user && !!postScheduledAt && open,
    staleTime: 60_000,
  });

  const handleCancelPlan = async () => {
    if (!planContext?.planGroupId || !user) return;
    const confirmed = window.confirm(`Cancel all ${planContext.siblingCount} posts in this plan?`);
    if (!confirmed) return;

    setCancellingPlan(true);
    try {
      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('plan_group_id', planContext.planGroupId)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success(`Plan cancelled (${planContext.siblingCount} posts)`);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ['outstand'] });
      qc.invalidateQueries({ queryKey: ['draft-posts'] });
      qc.invalidateQueries({ queryKey: ['plan-context'] });
      onChanged?.();
    } catch {
      toast.error('Failed to cancel plan');
    } finally {
      setCancellingPlan(false);
    }
  };

  useEffect(() => {
    if (post && open) {
      setCaption(post.containers?.[0]?.content ?? '');
      setEditingCaption(false);
      setRescheduling(false);
      setHeroMediaError(false);
      if (post.scheduledAt) {
        const d = new Date(post.scheduledAt);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        setNewDateTime(local.toISOString().slice(0, 16));
      }
    }
  }, [post, open, planContext?.mediaUrls]);

  if (!post) return null;

  const scheduled = isScheduled(post);
  const scheduledDate = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const platforms = post.socialAccounts?.map((sa) => sa.network) ?? [];
  const mediaFiles = post.containers?.[0]?.media ?? [];
  const heroMedia = mediaFiles[0];
  const localMediaUrl = planContext?.mediaUrls?.[0];
  const displayUrl = localMediaUrl ?? heroMedia?.url;
  const isVideo = heroMedia?.contentType?.startsWith('video/')
    || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(displayUrl ?? '');

  const handleSaveCaption = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/posts/${post.id}`, {
        containers: [{ ...post.containers[0], content: caption }],
      });
      if (!res.success) throw new Error(res.error || 'Failed to update');
      toast.success('Caption updated');
      setEditingCaption(false);
      qc.invalidateQueries({ queryKey: ['outstand'] });
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async () => {
    if (!newDateTime) return;
    setSaving(true);
    try {
      const newDate = new Date(newDateTime).toISOString();
      const res = await api.patch(`/posts/${post.id}`, { scheduledAt: newDate });
      if (!res.success) throw new Error(res.error || 'Reschedule failed');
      toast.success('Post rescheduled');
      setRescheduling(false);
      qc.invalidateQueries({ queryKey: ['outstand'] });
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reschedule failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await api.delete(`/posts/${post.id}`);
      if (!res.success) throw new Error(res.error || 'Delete failed');
      toast.success('Post removed');
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ['outstand'] });
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setRemoving(false);
    }
  };

  const content = (
    <div className="space-y-4 overflow-y-auto max-h-[70vh]">
      {/* Hero media preview */}
      {displayUrl && (
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-gray-100 max-w-[200px] mx-auto lg:max-w-[240px]">
          {heroMediaError ? (
            <div className="w-full h-full bg-gradient-to-br from-dc-teal via-dc-pink/40 to-dc-teal-dark flex items-center justify-center">
              <img src={logo} alt="Dragon Candy" className="w-12 h-12 opacity-70" />
            </div>
          ) : isVideo ? (
            <VideoFrameThumbnail
              fileId={heroMedia?.id ?? post.id}
              videoUrl={displayUrl}
              storedThumbnailUrl={null}
              mimeType={heroMedia?.contentType ?? 'video/mp4'}
              filename={heroMedia?.filename ?? 'video'}
              onError={() => setHeroMediaError(true)}
            />
          ) : (
            <img
              src={displayUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setHeroMediaError(true)}
            />
          )}
        </div>
      )}

      {/* Schedule info */}
      {scheduled && scheduledDate && (
        <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl p-3">
          <Clock className="h-4 w-4 text-dc-teal flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-dc-text">
              {scheduledDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at{' '}
              {scheduledDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </p>
            <p className="text-[10px] text-dc-teal font-medium">Scheduled by Donny</p>
          </div>
        </div>
      )}

      {/* Plan context */}
      {planContext && planContext.siblingCount > 1 && (
        <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl p-3">
          <Layers className="h-4 w-4 text-purple-500 flex-shrink-0" />
          <p className="text-[11px] text-purple-700 font-medium">
            Part of a posting plan ({planContext.siblingCount} posts)
          </p>
        </div>
      )}

      {/* Platform badges */}
      {platforms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {platforms.map((name) => (
            <span
              key={name}
              className={`text-[9px] font-semibold px-2.5 py-1 rounded-full ${
                PLATFORM_STYLES[name.toLowerCase()] ?? 'bg-gray-600 text-white'
              }`}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </span>
          ))}
        </div>
      )}

      {/* Caption */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">Caption</span>
          {!editingCaption && scheduled && (
            <button
              type="button"
              onClick={() => setEditingCaption(true)}
              className="text-dc-teal hover:text-teal-600 p-1"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {editingCaption ? (
          <div className="space-y-2">
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="min-h-[80px] text-sm resize-none"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveCaption}
                disabled={saving}
                className="rounded-full bg-dc-teal hover:bg-teal-500 text-white text-xs"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCaption(post.containers?.[0]?.content ?? '');
                  setEditingCaption(false);
                }}
                className="rounded-full text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-dc-text-muted whitespace-pre-wrap line-clamp-4">
            {post.containers?.[0]?.content || 'No caption'}
          </p>
        )}
      </div>

      {/* Actions */}
      {scheduled && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          {/* Reschedule */}
          {rescheduling ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700">New date & time</label>
              <input
                type="datetime-local"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dc-teal"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleReschedule}
                  disabled={saving || !newDateTime}
                  className="rounded-full bg-dc-teal hover:bg-teal-500 text-white text-xs flex-1"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Calendar className="h-3 w-3 mr-1" />}
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRescheduling(false)}
                  className="rounded-full text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setRescheduling(true)}
              className="w-full rounded-full border-dc-teal text-dc-teal font-semibold text-sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reschedule
            </Button>
          )}

          {/* Remove */}
          <Button
            variant="outline"
            onClick={handleRemove}
            disabled={removing}
            className="w-full rounded-full border-red-300 text-red-600 hover:bg-red-50 font-semibold text-sm"
          >
            {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Remove from Schedule
          </Button>

          {/* Cancel Plan */}
          {planContext && planContext.siblingCount > 1 && (
            <Button
              variant="outline"
              onClick={handleCancelPlan}
              disabled={cancellingPlan}
              className="w-full rounded-full border-purple-300 text-purple-600 hover:bg-purple-50 font-semibold text-sm"
            >
              {cancellingPlan ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Layers className="h-4 w-4 mr-2" />}
              Cancel Plan ({planContext.siblingCount} posts)
            </Button>
          )}
        </div>
      )}

      {/* Campaign link */}
      {campaignLink && (
        <a
          href={campaignLink}
          className="flex items-center gap-2 text-sm text-dc-teal hover:text-teal-600 font-medium pt-2 border-t border-gray-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Campaign
        </a>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="pb-3">
            <SheetTitle className="text-sm font-bold text-gray-900">Manage Post</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-gray-900">Manage Post</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
