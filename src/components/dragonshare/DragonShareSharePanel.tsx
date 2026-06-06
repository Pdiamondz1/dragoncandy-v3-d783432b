import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, CalendarDays } from 'lucide-react';
import { DragonCandyOutstandProvider, useOutstandConfig } from '@/integrations/outstand/Provider';
import { useAccounts } from '@outstand-so/ui';
import { SocialAccountAvatar } from '../outstand/SocialAccountAvatar';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { MediaPreviewGrid } from '@/components/outstand/MediaPreviewGrid';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isVideoPost } from '@/types/dragonshare';
import type { DragonSharePostWithRelations } from '@/types/dragonshare';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: DragonSharePostWithRelations;
  creatorName?: string;
  businessName?: string;
}

function SharePanelInner({ open, onOpenChange, post, creatorName, businessName }: Props) {
  const { user } = useAuth();
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const crossPost = useCrossPost();

  const [caption, setCaption] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  const mediaUrl = post.content_file_path ?? '';
  const isVid = isVideoPost(post);

  // default-select all accounts when opened
  useEffect(() => {
    if (open && accounts && accounts.length > 0) {
      setSelectedAccountIds((prev) => (prev.length === 0 ? accounts.map((a) => a.id) : prev));
    }
  }, [open, accounts]);

  // generate caption on open (once)
  useEffect(() => {
    let active = true;
    if (open && !caption && user?.id) {
      setGenLoading(true);
      supabase.functions.invoke('social-caption', {
        body: {
          campaign_title: post.caption || 'Great content',
          campaign_description: '',
          content_type: isVid ? 'video_reel' : 'photo',
          party_role: 'restaurant',
          platform: accounts?.[0]?.network ?? 'instagram',
          user_id: user.id,
          source: 'dragonshare',
          context: { creator_name: creatorName, business_name: businessName },
        },
      }).then((res) => {
        if (!active) return;
        const c = (res.data as { caption?: string; hashtags?: string[] }) || {};
        const text = [c.caption, (c.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
        setCaption(text || 'Check out this content! #DragonDashed');
      }).catch(() => { if (active) setCaption('Check out this content! #DragonDashed'); })
        .finally(() => { if (active) setGenLoading(false); });
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const toggleAccount = (id: string) =>
    setSelectedAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canPost = selectedAccountIds.length > 0 && !!mediaUrl && !crossPost.isPending;

  const submitPost = (scheduledAt?: string) =>
    crossPost.mutate(
      { caption, mediaUrls: [mediaUrl], accountIds: selectedAccountIds, scheduledAt },
      { onSuccess: () => onOpenChange(false) },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogTitle className="text-dc-text">Share to your channels</DialogTitle>
        <div className="space-y-4">
          {mediaUrl && (
            <MediaPreviewGrid
              items={[{
                url: mediaUrl,
                filename: mediaUrl.split('/').pop()?.split('?')[0] || 'content',
                mimeType: isVid ? 'video/mp4' : 'image/jpeg',
              }]}
            />
          )}

          {/* Caption */}
          <div>
            <label className="text-[11px] uppercase tracking-wide font-medium text-dc-text-muted block mb-1.5">Caption</label>
            {genLoading ? (
              <div className="flex items-center gap-2 text-sm text-dc-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating caption…
              </div>
            ) : (
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className="rounded-xl" />
            )}
          </div>

          {/* Account selection */}
          <div>
            <label className="text-[11px] uppercase tracking-wide font-medium text-dc-text-muted block mb-1.5">Post to</label>
            {(!accounts || accounts.length === 0) ? (
              <p className="text-xs text-dc-text-muted">
                No connected accounts. <a href="/settings/social" className="text-dc-teal underline">Connect</a>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const sel = selectedAccountIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAccount(a.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium border ${sel ? 'bg-dc-teal-btn text-white border-dc-teal-btn' : 'bg-white text-dc-text border-dc-teal/30'}`}
                    >
                      <SocialAccountAvatar
                        network={a.network}
                        profilePictureUrl={a.profile_picture_url}
                        name={a.nickname}
                        sizeClass="w-6 h-6"
                      />
                      {a.username ?? a.network}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Schedule (optional) */}
          {scheduleOpen && (
            <div>
              <label className="text-[11px] uppercase tracking-wide font-medium text-dc-text-muted block mb-1.5">Schedule for</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="rounded-xl border border-dc-teal/30 px-3 py-2 text-sm w-full"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              disabled={!canPost}
              onClick={() => submitPost()}
              className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold"
            >
              {crossPost.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting…</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />Post now</>
              )}
            </Button>
            {!scheduleOpen ? (
              <Button variant="outline" className="w-full rounded-full" onClick={() => setScheduleOpen(true)}>
                <CalendarDays className="mr-2 h-4 w-4" />Schedule instead
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={!canPost || !scheduleAt}
                className="w-full rounded-full"
                onClick={() => submitPost(new Date(scheduleAt).toISOString())}
              >
                <CalendarDays className="mr-2 h-4 w-4" />Schedule post
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DragonShareSharePanel(props: Props) {
  return (
    <DragonCandyOutstandProvider>
      <SharePanelInner {...props} />
    </DragonCandyOutstandProvider>
  );
}
