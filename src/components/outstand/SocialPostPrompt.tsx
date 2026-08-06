import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, CalendarDays, Edit3, Loader2, RefreshCw } from 'lucide-react';
import { DragonDashRushButton } from './DragonDashRushButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@outstand-so/ui';
import { SocialAccountAvatar } from './SocialAccountAvatar';
import { useOutstandConfig, DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { DonnyCaptionRewriter } from './DonnyCaptionRewriter';
import { MediaPreviewGrid, type MediaItem } from './MediaPreviewGrid';
import { DeliverableScheduleReview, type DeliverableSlot } from './DeliverableScheduleReview';
import { ScheduleConfirmation, type ScheduledPostInfo } from './ScheduleConfirmation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { toDbContentType } from '@/lib/contentType';

export interface SocialPostPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  campaignTitle: string;
  creatorName?: string;
  restaurantName?: string;
  mediaUrls: string[];
  mediaItems?: MediaItem[];
  originalCaption: string;
  userRole: 'restaurant' | 'creator' | 'brand';
}

type SchedulingState = 'composing' | 'multi-review' | 'scheduling' | 'confirmed';

function formatSuggestedTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return 'auto-pick';
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'soon';
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'tomorrow';
  return `in ${diffDays} days`;
}

function getValidScheduleTime(suggestedTime: string | null): string {
  const MIN_FUTURE_MS = 10 * 60 * 1000;
  const FALLBACK_MS = 24 * 60 * 60 * 1000;

  if (suggestedTime) {
    const suggested = new Date(suggestedTime);
    if (!isNaN(suggested.getTime()) && suggested.getTime() > Date.now() + MIN_FUTURE_MS) {
      return suggested.toISOString();
    }
  }
  return new Date(Date.now() + FALLBACK_MS).toISOString();
}

function stripTrailingHashtags(text: string): string {
  return text.replace(/(\n\n|\n)?(#\w+[\s]*)+$/g, '').trimEnd();
}

function getGenericCaption(userRole: string, campaignTitle: string): { text: string; tags: string[] } {
  const tags = ['#DragonDashed'];
  switch (userRole) {
    case 'restaurant':
      return { text: 'Check out what we\'ve been cooking up!', tags };
    case 'creator':
      return { text: 'Loved creating this content!', tags };
    default:
      return { text: campaignTitle, tags };
  }
}

function SocialPostPromptInner({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  creatorName: _creatorName,
  restaurantName: _restaurantName,
  mediaUrls,
  mediaItems: mediaItemsProp,
  originalCaption,
  userRole,
}: SocialPostPromptProps) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const crossPost = useCrossPost();
  const { user } = useAuth();
  const { toast } = useToast();
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState<string | null>(null);
  const [loadingCaption, setLoadingCaption] = useState(false);
  const [captionError, setCaptionError] = useState(false);
  const [refreshingCaption, setRefreshingCaption] = useState(false);
  const [schedulingState, setSchedulingState] = useState<SchedulingState>('composing');
  const [confirmedPosts, setConfirmedPosts] = useState<ScheduledPostInfo[]>([]);
  const [deliverableSlots, setDeliverableSlots] = useState<DeliverableSlot[]>([]);
  const [sameDay, setSameDay] = useState(false);

  const resolvedItems: MediaItem[] = mediaItemsProp ?? mediaUrls.map((url) => ({ url }));
  const captionLoadedRef = useRef<string | null>(null);
  const schedulingFlowRef = useRef<'single' | 'multi' | null>(null);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const generateCaption = useCallback(async (opts?: {
    deliverableNumber?: number;
    totalDeliverables?: number;
    filename?: string;
  }): Promise<{ text: string; tags: string[] } | null> => {
    if (!campaignId || !user?.id) return null;
    try {
      const { data, error } = await supabase.functions.invoke('social-caption', {
        body: {
          campaign_title: campaignTitle,
          campaign_description: originalCaption,
          content_type: 'video_reel',
          party_role: userRole === 'restaurant' ? 'restaurant' : userRole,
          platform: accountsRef.current[0]?.network ?? 'instagram',
          user_id: user.id,
          deliverable_number: opts?.deliverableNumber,
          total_deliverables: opts?.totalDeliverables,
          filename: opts?.filename,
        },
      });
      if (error) throw error;
      const rawCaption = data?.caption ?? data?.text ?? '';
      const tags: string[] = data?.hashtags ?? [];
      return { text: stripTrailingHashtags(rawCaption), tags };
    } catch {
      return null;
    }
  }, [campaignId, campaignTitle, originalCaption, userRole, user?.id]);

  useEffect(() => {
    if (!open) {
      setSchedulingState('composing');
      setConfirmedPosts([]);
      setDeliverableSlots([]);
      setSameDay(false);
      captionLoadedRef.current = null;
      schedulingFlowRef.current = null;
      return;
    }

    const loadKey = `${campaignId}-${user?.id}`;
    if (captionLoadedRef.current === loadKey) return;
    captionLoadedRef.current = loadKey;

    setIsEditing(false);
    setCaptionError(false);

    if (campaignId && user?.id) {
      setLoadingCaption(true);
      const loadDraft = async () => {
        try {
          const { data: draft } = await supabase
            .from('donny_scheduled_posts')
            .select('caption, hashtags, scheduled_at, ai_reasoning')
            .eq('campaign_id', campaignId)
            .eq('user_id', user.id)
            .eq('status', 'draft')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (draft?.caption) {
            setCaption(stripTrailingHashtags(draft.caption));
            setHashtags(draft.hashtags?.length ? (draft.hashtags as string[]) : []);
          } else {
            const aiResult = await generateCaption();
            if (aiResult) {
              setCaption(aiResult.text);
              setHashtags(aiResult.tags);
            } else {
              const fallback = getGenericCaption(userRole, campaignTitle);
              setCaption(fallback.text);
              setHashtags(fallback.tags);
              setCaptionError(true);
            }
          }
          if (draft?.scheduled_at) {
            setSuggestedTime(draft.scheduled_at);
          } else {
            setSuggestedTime(null);
          }
        } catch {
          const fallback = getGenericCaption(userRole, campaignTitle);
          setCaption(fallback.text);
          setHashtags(fallback.tags);
          setCaptionError(true);
        } finally {
          setLoadingCaption(false);
        }
      };
      loadDraft();
    } else {
      const fallback = getGenericCaption(userRole, campaignTitle);
      setCaption(fallback.text);
      setHashtags(fallback.tags);
      setSuggestedTime(null);
    }
  }, [open, campaignId, user?.id, campaignTitle, originalCaption, userRole, generateCaption]);

  useEffect(() => {
    if (open && accounts.length > 0) {
      setSelectedAccountIds((prev) => prev.length === 0 ? accounts.map((a) => a.id) : prev);
    }
  }, [open, accounts]);

  const handleRefreshCaption = async () => {
    setRefreshingCaption(true);
    setCaptionError(false);
    const aiResult = await generateCaption();
    if (aiResult) {
      setCaption(aiResult.text);
      setHashtags(aiResult.tags);
    } else {
      setCaptionError(true);
    }
    setRefreshingCaption(false);
  };

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const fullCaption = hashtags.length > 0
    ? `${caption}\n\n${hashtags.join(' ')}`
    : caption;

  const syncScheduledPost = async (
    scheduleTime: string,
    outstandPostId?: string | null,
    socialAccountIds?: string[],
    status: 'scheduled' | 'published' = 'scheduled',
  ) => {
    if (!user?.id || !campaignId) return;
    if (outstandPostId == null) {
      // useCrossPost couldn't extract an Outstand post id from the response
      // (useCrossPost.ts:56 returns null). We're about to write
      // outstand_post_id: null below, which the webhook can never match — the
      // post is live but permanently unmeasurable, and nothing else says so.
      console.warn('[SocialPostPrompt] outstand_post_id is null — this post will never be matched by the webhook and will not be measured.');
    }
    const platforms = accounts
      .filter((a) => selectedAccountIds.includes(a.id))
      .map((a) => a.network ?? 'unknown');

    // Post Now has no future schedule — it published the instant crossPost
    // resolved, so scheduleTime IS the publish time in that call.
    const publishedAt = status === 'published' ? scheduleTime : undefined;

    const insertNewRow = async () => {
      const { error: scheduleError } = await supabase
        .from('donny_scheduled_posts')
        .insert({
          user_id: user.id,
          campaign_id: campaignId,
          platform: platforms[0] ?? 'instagram',
          content_type: toDbContentType('video_reel'),
          caption,
          hashtags,
          media_urls: mediaUrls,
          scheduled_at: scheduleTime,
          ...(publishedAt ? { published_at: publishedAt } : {}),
          status,
          ai_suggested_time: status === 'scheduled' && !!suggestedTime,
          ai_reasoning: status === 'scheduled' && suggestedTime ? 'Donny picked the optimal posting time' : null,
          metadata: {
            outstand_post_id: outstandPostId ?? null,
            social_account_ids: socialAccountIds ?? selectedAccountIds,
          },
        });

      if (scheduleError) {
        // The post is already live on the platform at this point (crossPost's
        // onSuccess already fired before syncScheduledPost was called), so a
        // failure here means published but unrecorded — invisible to
        // scheduling and to every analytics surface downstream.
        console.error('[SocialPostPrompt] Failed to record scheduled post:', scheduleError);
        toast({
          variant: 'destructive',
          title: 'Post published, but not recorded',
          description: 'It went live, but we could not save it for scheduling or analytics.',
        });
      }
    };

    // Post Now must NEVER adopt an existing draft row: a user with any saved
    // draft on this campaign who hits Post Now on different content would
    // otherwise have that unrelated draft silently overwritten with the
    // just-posted content and marked published — losing the draft, and
    // attaching the measurement row to the wrong scheduled-post record. Only
    // the scheduling paths (status === 'scheduled', where the draft
    // genuinely becomes the scheduled post) may adopt — so Post Now skips the
    // draft lookup entirely and always inserts a fresh row.
    if (status === 'published') {
      await insertNewRow();
      return;
    }

    const existing = await supabase
      .from('donny_scheduled_posts')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.data?.id) {
      const { error: scheduleError } = await supabase
        .from('donny_scheduled_posts')
        .update({
          status,
          scheduled_at: scheduleTime,
          caption,
          hashtags,
          media_urls: mediaUrls,
          platform: platforms[0] ?? 'instagram',
          metadata: {
            outstand_post_id: outstandPostId ?? null,
            social_account_ids: socialAccountIds ?? selectedAccountIds,
          },
        })
        .eq('id', existing.data.id);

      if (scheduleError) {
        // The post is already live on the platform at this point (crossPost's
        // onSuccess already fired before syncScheduledPost was called), so a
        // failure here means published but unrecorded — invisible to
        // scheduling and to every analytics surface downstream.
        console.error('[SocialPostPrompt] Failed to record scheduled post:', scheduleError);
        toast({
          variant: 'destructive',
          title: 'Post published, but not recorded',
          description: 'It went live, but we could not save it for scheduling or analytics.',
        });
      }
    } else {
      await insertNewRow();
    }
  };

  const handleScheduleForBestTime = async () => {
    if (selectedAccountIds.length === 0) return;
    const scheduleTime = getValidScheduleTime(suggestedTime);

    if (resolvedItems.length > 1) {
      schedulingFlowRef.current = 'multi';
      const baseTime = new Date(scheduleTime).getTime();
      const DAY_MS = 24 * 60 * 60 * 1000;

      setSchedulingState('scheduling');
      const captionPromises = resolvedItems.map((item, i) => {
        const fname = item.filename ?? item.url.split('/').pop()?.split('?')[0] ?? `file-${i + 1}`;
        return generateCaption({
          deliverableNumber: i + 1,
          totalDeliverables: resolvedItems.length,
          filename: decodeURIComponent(fname),
        });
      });
      const captionResults = await Promise.all(captionPromises);

      const slots: DeliverableSlot[] = resolvedItems.map((item, i) => ({
        mediaUrl: item.url,
        mediaItem: item,
        scheduledAt: new Date(baseTime + i * DAY_MS).toISOString(),
        caption: captionResults[i]?.text ?? caption,
        hashtags: captionResults[i]?.tags ?? hashtags,
      }));
      setDeliverableSlots(slots);
      setSameDay(false);
      setSchedulingState('multi-review');
      return;
    }

    schedulingFlowRef.current = 'single';
    const platforms = accounts
      .filter((a) => selectedAccountIds.includes(a.id))
      .map((a) => a.network ?? 'unknown');

    setSchedulingState('scheduling');
    crossPost.mutate(
      { caption: fullCaption, mediaUrls, accountIds: selectedAccountIds, scheduledAt: scheduleTime },
      {
        onSuccess: async (data) => {
          if (schedulingFlowRef.current !== 'single') return;
          const outstandPostId = data?._outstandPostId ?? null;
          await syncScheduledPost(scheduleTime, outstandPostId, selectedAccountIds);
          setConfirmedPosts([{
            scheduledAt: scheduleTime,
            platformNames: platforms,
            fileCount: mediaUrls.length,
            aiSuggested: true,
          }]);
          setSchedulingState('confirmed');
        },
        onError: () => {
          setSchedulingState('composing');
        },
      },
    );
  };

  const handleScheduleAllDeliverables = async () => {
    if (selectedAccountIds.length === 0 || deliverableSlots.length === 0) return;
    if (!user?.id || !campaignId) return;
    const platforms = accounts
      .filter((a) => selectedAccountIds.includes(a.id))
      .map((a) => a.network ?? 'unknown');

    setSchedulingState('scheduling');

    await supabase
      .from('donny_scheduled_posts')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .eq('status', 'draft');

    const succeededUrls = new Set<string>();
    try {
      for (const slot of deliverableSlots) {
        const slotCaption = sameDay
          ? fullCaption
          : (slot.hashtags?.length
              ? `${slot.caption}\n\n${slot.hashtags.join(' ')}`
              : slot.caption ?? fullCaption);

        const result = await crossPost.mutateAsync({
          caption: slotCaption,
          mediaUrls: [slot.mediaUrl],
          accountIds: selectedAccountIds,
          scheduledAt: slot.scheduledAt,
          silent: true,
        });

        if (result?._outstandPostId == null) {
          // Same unmatchable-null situation as syncScheduledPost above, but this
          // write path builds its own insert rather than going through
          // syncScheduledPost.
          console.warn('[SocialPostPrompt] outstand_post_id is null — this post will never be matched by the webhook and will not be measured.');
        }

        const { error: scheduleError } = await supabase.from('donny_scheduled_posts').insert({
          user_id: user.id,
          campaign_id: campaignId,
          platform: platforms[0] ?? 'instagram',
          content_type: toDbContentType('video_reel'),
          caption,
          hashtags,
          media_urls: [slot.mediaUrl],
          scheduled_at: slot.scheduledAt,
          status: 'scheduled' as string,
          ai_suggested_time: false,
          metadata: {
            outstand_post_id: result?._outstandPostId ?? null,
            social_account_ids: selectedAccountIds,
          },
        });

        if (scheduleError) {
          // crossPost.mutateAsync above already succeeded, so this slot is
          // already live on the platform. Don't let this fall into the catch
          // block below's "failed, retry" path — retrying would re-publish an
          // already-live post. Surface it and still count the slot as done.
          console.error('[SocialPostPrompt] Failed to record scheduled post:', scheduleError);
          toast({
            variant: 'destructive',
            title: 'Post published, but not recorded',
            description: 'It went live, but we could not save it for scheduling or analytics.',
          });
        }

        succeededUrls.add(slot.mediaUrl);
      }

      if (schedulingFlowRef.current !== 'multi') return;
      setConfirmedPosts(deliverableSlots.map(slot => ({
        scheduledAt: slot.scheduledAt,
        platformNames: platforms,
        fileCount: 1,
        aiSuggested: false,
      })));
      setSchedulingState('confirmed');
    } catch {
      if (succeededUrls.size > 0) {
        const remaining = deliverableSlots.filter(s => !succeededUrls.has(s.mediaUrl));
        setDeliverableSlots(remaining);
        toast({
          variant: 'destructive',
          title: 'Partial scheduling failure',
          description: `${succeededUrls.size} posted, ${remaining.length} failed. Retry the remaining.`,
        });
      }
      setSchedulingState('multi-review');
    }
  };

  const handlePostNow = () => {
    if (selectedAccountIds.length === 0) return;
    crossPost.mutate(
      { caption: fullCaption, mediaUrls, accountIds: selectedAccountIds },
      {
        onSuccess: async (data) => {
          const outstandPostId = data?._outstandPostId ?? null;
          if (outstandPostId == null) {
            // Same unmatchable-null situation as syncScheduledPost, but here an
            // unrecorded row is strictly worse than no row: the webhook's
            // post.published handler can only ever match on
            // metadata->>outstand_post_id, so a row with a null id can never be
            // matched and would just be dead weight sitting in 'published'
            // status forever. Skip the write entirely.
            console.warn('[SocialPostPrompt] outstand_post_id is null — this Post Now post will never be matched by the webhook and will not be measured.');
          } else {
            // Post Now has no schedule row from an earlier flow to attach to —
            // mirror syncScheduledPost's own insert-or-update-draft shape so the
            // webhook has the same trusted artifact (metadata.outstand_post_id)
            // every other publish path produces. See docs/wiki/raw/sessions/
            // 2026-08-05-outstand-cross-tenant-metric-read.md for why the webhook
            // cannot fall back to matching by account instead.
            await syncScheduledPost(new Date().toISOString(), outstandPostId, selectedAccountIds, 'published');
          }
          onOpenChange(false);
        },
      },
    );
  };

  const connectedCount = accounts?.length ?? 0;
  const platformNames = accounts
    .filter((a) => selectedAccountIds.includes(a.id))
    .map((a) => (a.network ?? '').charAt(0).toUpperCase() + (a.network ?? '').slice(1))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const confirmedContent = schedulingState === 'confirmed' && confirmedPosts.length > 0 ? (
    <ScheduleConfirmation
      posts={confirmedPosts}
      campaignTitle={campaignTitle}
      onDone={() => onOpenChange(false)}
    />
  ) : null;

  const multiReviewContent = schedulingState === 'multi-review' ? (
    <DeliverableScheduleReview
      slots={deliverableSlots}
      onSlotsChange={setDeliverableSlots}
      sameDay={sameDay}
      onSameDayChange={setSameDay}
      onScheduleAll={handleScheduleAllDeliverables}
      isScheduling={false}
    />
  ) : schedulingState === 'scheduling' && deliverableSlots.length > 1 ? (
    <DeliverableScheduleReview
      slots={deliverableSlots}
      onSlotsChange={setDeliverableSlots}
      sameDay={sameDay}
      onSameDayChange={setSameDay}
      onScheduleAll={handleScheduleAllDeliverables}
      isScheduling={true}
    />
  ) : null;

  const composingContent = (
    <div className="space-y-4">
      {connectedCount === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-800 font-medium">No connected social accounts</p>
          <p className="text-xs text-amber-700 mt-1">
            Connect your social accounts in Settings to share content.
          </p>
        </div>
      ) : (
        <>
          <MediaPreviewGrid items={resolvedItems} />

          <div className="bg-dc-teal/[0.04] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide">
                Post to ({selectedAccountIds.length} of {connectedCount})
              </p>
              {platformNames.length > 0 && (
                <p className="text-[10px] text-dc-teal font-medium">
                  {platformNames.join(' · ')}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => {
                const selected = selectedAccountIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => toggleAccount(account.id)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold pl-1 pr-3 py-1 rounded-full border transition-colors ${
                      selected
                        ? 'bg-dc-teal text-white border-dc-teal'
                        : 'bg-white text-gray-500 border-dc-teal/20'
                    }`}
                  >
                    <SocialAccountAvatar
                      network={account.network}
                      profilePictureUrl={account.profile_picture_url}
                      name={account.nickname}
                      sizeClass="w-6 h-6"
                    />
                    {account.username ?? account.network}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-dc-teal/[0.04] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase text-dc-teal tracking-wide">
                AI Caption
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRefreshCaption}
                  disabled={refreshingCaption || loadingCaption}
                  className="flex items-center gap-1 text-[10px] font-semibold text-dc-teal hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingCaption ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-[10px] font-semibold text-dc-pink-accent hover:underline"
                >
                  {isEditing ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>
            {loadingCaption || refreshingCaption ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-dc-teal" />
                <p className="text-xs text-gray-400">
                  {refreshingCaption ? 'Refreshing caption...' : 'Donny is writing your caption...'}
                </p>
              </div>
            ) : isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full text-sm text-gray-700 bg-white border border-dc-teal/20 rounded-lg p-2 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-dc-teal"
                  autoFocus
                />
                <input
                  type="text"
                  value={hashtags.join(' ')}
                  onChange={(e) => setHashtags(e.target.value.split(/\s+/).filter(Boolean))}
                  placeholder="#hashtags"
                  className="w-full text-xs text-dc-teal bg-white border border-dc-teal/20 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-dc-teal"
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
                {hashtags.length > 0 && (
                  <p className="text-xs text-dc-teal font-medium mt-2">{hashtags.join(' ')}</p>
                )}
                {captionError && (
                  <p className="text-[10px] text-dc-text-muted mt-2">
                    Caption generation unavailable — edit to customize.
                  </p>
                )}
              </>
            )}
          </div>

          {user?.id && userRole === 'creator' && (
            <DonnyCaptionRewriter
              originalCaption={fullCaption}
              platform={selectedAccountIds[0] ?? 'social'}
              creatorId={user.id}
              onAccept={(rewritten) => {
                setCaption(stripTrailingHashtags(rewritten));
              }}
            />
          )}

          <DragonDashRushButton
            platformCount={selectedAccountIds.length}
            campaignId={campaignId}
            onRushComplete={() => onOpenChange(false)}
          />

          {crossPost.isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-800 font-medium">Post failed</p>
              <p className="text-xs text-red-700 mt-1">{crossPost.error?.message}</p>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleScheduleForBestTime}
              disabled={schedulingState === 'scheduling' || selectedAccountIds.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-dc-teal-btn text-white text-sm font-bold py-3.5 rounded-full hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" />
              {schedulingState === 'scheduling' ? 'Scheduling...' : 'Schedule for Best Time'}
              {suggestedTime && schedulingState !== 'scheduling' && (
                <span className="text-xs font-normal opacity-80">
                  ({formatSuggestedTime(suggestedTime)})
                </span>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handlePostNow}
                disabled={crossPost.isPending || selectedAccountIds.length === 0}
                className="flex items-center justify-center gap-1.5 bg-white text-gray-700 text-sm font-semibold py-3 rounded-full border border-dc-teal/15 hover:bg-dc-teal/5 transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Post Now
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center justify-center gap-1.5 bg-white text-dc-pink-accent text-sm font-semibold py-3 rounded-full border border-dc-teal/15 hover:bg-dc-teal/5 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                {isEditing ? 'Done' : 'Edit Caption'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const content = confirmedContent ?? multiReviewContent ?? composingContent;

  const dialogTitle = schedulingState === 'confirmed'
    ? confirmedPosts.length > 1 ? 'Posts Scheduled' : 'Post Scheduled'
    : schedulingState === 'multi-review' || (schedulingState === 'scheduling' && deliverableSlots.length > 1)
      ? 'Schedule Deliverables'
      : 'Ready to Share';

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8 max-h-[85vh] flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-sm font-bold text-gray-900">
              {dialogTitle}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 overflow-y-auto flex-1 min-h-0">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm font-bold text-gray-900">
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0">{content}</div>
      </DialogContent>
    </Dialog>
  );
}

export const SocialPostPrompt: React.FC<SocialPostPromptProps> = (props) => (
  <DragonCandyOutstandProvider>
    <SocialPostPromptInner {...props} />
  </DragonCandyOutstandProvider>
);
