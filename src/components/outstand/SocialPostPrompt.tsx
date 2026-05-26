import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, CalendarDays, Edit3, Loader2, RefreshCw } from 'lucide-react';
import { DragonDashRushButton } from './DragonDashRushButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig, DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { DonnyCaptionRewriter } from './DonnyCaptionRewriter';
import { MediaPreviewGrid, type MediaItem } from './MediaPreviewGrid';
import { ScheduleConfirmation } from './ScheduleConfirmation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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

type SchedulingState = 'composing' | 'scheduling' | 'confirmed';

function formatSuggestedTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'soon';
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'tomorrow';
  return `in ${diffDays} days`;
}

function getGenericCaption(userRole: string, campaignTitle: string): string {
  switch (userRole) {
    case 'restaurant':
      return `Check out what we've been cooking up!\n\n#DragonDashed`;
    case 'creator':
      return `Loved creating this content!\n\n#DragonDashed`;
    default:
      return `${campaignTitle}\n\n#DragonDashed`;
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
  const [caption, setCaption] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState<string | null>(null);
  const [loadingCaption, setLoadingCaption] = useState(false);
  const [captionError, setCaptionError] = useState(false);
  const [refreshingCaption, setRefreshingCaption] = useState(false);
  const [schedulingState, setSchedulingState] = useState<SchedulingState>('composing');
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [confirmedPlatforms, setConfirmedPlatforms] = useState<string[]>([]);

  const resolvedItems: MediaItem[] = mediaItemsProp ?? mediaUrls.map((url) => ({ url }));
  const captionLoadedRef = useRef<string | null>(null);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const generateCaption = useCallback(async () => {
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
        },
      });
      if (error) throw error;
      const captionText = data?.caption ?? data?.text ?? '';
      const hashtags = data?.hashtags ?? [];
      const hashtagStr = hashtags.length ? `\n\n${hashtags.join(' ')}` : '';
      return `${captionText}${hashtagStr}`;
    } catch {
      return null;
    }
  }, [campaignId, campaignTitle, originalCaption, userRole, user?.id]);

  useEffect(() => {
    if (!open) {
      setSchedulingState('composing');
      setConfirmedAt(null);
      setConfirmedPlatforms([]);
      captionLoadedRef.current = null;
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
            const hashtagStr = draft.hashtags?.length ? `\n\n${(draft.hashtags as string[]).join(' ')}` : '';
            setCaption(`${draft.caption}${hashtagStr}`);
          } else {
            const aiCaption = await generateCaption();
            if (aiCaption) {
              setCaption(aiCaption);
            } else {
              setCaption(getGenericCaption(userRole, campaignTitle));
              setCaptionError(true);
            }
          }
          if (draft?.scheduled_at) {
            setSuggestedTime(draft.scheduled_at);
          } else {
            setSuggestedTime(null);
          }
        } catch {
          setCaption(getGenericCaption(userRole, campaignTitle));
          setCaptionError(true);
        } finally {
          setLoadingCaption(false);
        }
      };
      loadDraft();
    } else {
      setCaption(getGenericCaption(userRole, campaignTitle));
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
    const aiCaption = await generateCaption();
    if (aiCaption) {
      setCaption(aiCaption);
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

  const syncScheduledPost = async (scheduleTime: string) => {
    if (!user?.id || !campaignId) return;
    const platforms = accounts
      .filter((a) => selectedAccountIds.includes(a.id))
      .map((a) => a.network ?? 'unknown');

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
      await supabase
        .from('donny_scheduled_posts')
        .update({
          status: 'scheduled' as string,
          scheduled_at: scheduleTime,
          caption,
          media_urls: mediaUrls,
          platform: platforms[0] ?? 'instagram',
        })
        .eq('id', existing.data.id);
    } else {
      await supabase
        .from('donny_scheduled_posts')
        .insert({
          user_id: user.id,
          campaign_id: campaignId,
          platform: platforms[0] ?? 'instagram',
          content_type: 'video_reel',
          caption,
          media_urls: mediaUrls,
          scheduled_at: scheduleTime,
          status: 'scheduled' as string,
          ai_suggested_time: !!suggestedTime,
          ai_reasoning: suggestedTime ? 'Donny picked the optimal posting time' : null,
        });
    }
  };

  const handleScheduleForBestTime = () => {
    if (selectedAccountIds.length === 0) return;
    const scheduleTime = suggestedTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const platforms = accounts
      .filter((a) => selectedAccountIds.includes(a.id))
      .map((a) => a.network ?? 'unknown');

    setSchedulingState('scheduling');
    crossPost.mutate(
      { caption, mediaUrls, accountIds: selectedAccountIds, scheduledAt: scheduleTime },
      {
        onSuccess: async () => {
          await syncScheduledPost(scheduleTime);
          setConfirmedAt(scheduleTime);
          setConfirmedPlatforms(platforms);
          setSchedulingState('confirmed');
        },
        onError: () => {
          setSchedulingState('composing');
        },
      },
    );
  };

  const handlePostNow = () => {
    if (selectedAccountIds.length === 0) return;
    crossPost.mutate(
      { caption, mediaUrls, accountIds: selectedAccountIds },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const connectedCount = accounts?.length ?? 0;
  const platformNames = accounts
    .filter((a) => selectedAccountIds.includes(a.id))
    .map((a) => (a.network ?? '').charAt(0).toUpperCase() + (a.network ?? '').slice(1))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const confirmedContent = schedulingState === 'confirmed' && confirmedAt ? (
    <ScheduleConfirmation
      scheduledAt={confirmedAt}
      platformNames={confirmedPlatforms}
      campaignTitle={campaignTitle}
      fileCount={mediaUrls.length}
      onDone={() => onOpenChange(false)}
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

          <div className="bg-teal-50/50 rounded-xl p-3">
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
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      selected
                        ? 'bg-dc-teal text-white border-dc-teal'
                        : 'bg-white text-gray-500 border-gray-200'
                    }`}
                  >
                    {account.username ?? account.network}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-teal-50/50 rounded-xl p-3">
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
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-2 min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-dc-teal"
                autoFocus
              />
            ) : (
              <>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
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
              originalCaption={caption}
              platform={selectedAccountIds[0] ?? 'social'}
              creatorId={user.id}
              onAccept={(rewritten) => setCaption(rewritten)}
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
              className="w-full flex items-center justify-center gap-2 bg-dc-teal text-white text-sm font-bold py-3.5 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
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
                className="flex items-center justify-center gap-1.5 bg-white text-gray-700 text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Post Now
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center justify-center gap-1.5 bg-white text-dc-pink-accent text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
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

  const content = confirmedContent ?? composingContent;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8 max-h-[85vh] flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-sm font-bold text-gray-900">
              {schedulingState === 'confirmed' ? 'Post Scheduled' : 'Ready to Share'}
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
            {schedulingState === 'confirmed' ? 'Post Scheduled' : 'Ready to Share'}
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
