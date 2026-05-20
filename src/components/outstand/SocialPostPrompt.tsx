import React, { useState, useEffect } from 'react';
import { Send, CalendarDays, Edit3, Loader2 } from 'lucide-react';
import { DragonDashRushButton } from './DragonDashRushButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig, DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { DonnyCaptionRewriter } from './DonnyCaptionRewriter';
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
  originalCaption: string;
  userRole: 'restaurant' | 'creator' | 'brand';
}

function getDefaultCaption(
  userRole: string,
  campaignTitle: string,
  originalCaption: string,
): string {
  switch (userRole) {
    case 'restaurant':
      return originalCaption
        ? `${originalCaption}\n\n#DragonDashed`
        : `${campaignTitle} — see what our creators captured!\n\n#DragonDashed`;
    case 'creator':
      return originalCaption
        ? `${originalCaption}\n\n#DragonDashed`
        : `Loved creating content for ${campaignTitle}!\n\n#DragonDashed`;
    default:
      return originalCaption || campaignTitle;
  }
}

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

function SocialPostPromptInner({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  creatorName: _creatorName,
  restaurantName: _restaurantName,
  mediaUrls,
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
  const [loadingDraft, setLoadingDraft] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!open) return;

    setIsEditing(false);
    setSelectedAccountIds(accounts.map((a) => a.id));

    if (campaignId && user?.id) {
      setLoadingDraft(true);
      supabase
        .from('donny_scheduled_posts')
        .select('caption, hashtags, scheduled_at, ai_reasoning')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data: draft }) => {
          if (draft?.caption) {
            const hashtagStr = draft.hashtags?.length ? `\n\n${draft.hashtags.join(' ')}` : '';
            setCaption(`${draft.caption}${hashtagStr}`);
          } else {
            setCaption(getDefaultCaption(userRole, campaignTitle, originalCaption));
          }
          if (draft?.scheduled_at) {
            setSuggestedTime(draft.scheduled_at);
          } else {
            setSuggestedTime(null);
          }
          setLoadingDraft(false);
        })
        .catch(() => {
          setCaption(getDefaultCaption(userRole, campaignTitle, originalCaption));
          setLoadingDraft(false);
        });
    } else {
      setCaption(getDefaultCaption(userRole, campaignTitle, originalCaption));
      setSuggestedTime(null);
    }
  }, [open, campaignId, user?.id, campaignTitle, originalCaption, userRole, accounts]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleScheduleForBestTime = () => {
    if (selectedAccountIds.length === 0) return;
    const scheduleTime = suggestedTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    crossPost.mutate(
      { caption, mediaUrls, accountIds: selectedAccountIds, scheduledAt: scheduleTime },
      { onSuccess: () => onOpenChange(false) },
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

  const content = (
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
          {mediaUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {mediaUrls.slice(0, 3).map((url, i) => (
                <img key={i} src={url} alt="" className="h-20 w-20 rounded-xl object-cover flex-shrink-0" />
              ))}
            </div>
          )}

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
              <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide">
                Caption Preview
              </p>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="text-[10px] font-semibold text-dc-pink-accent hover:underline"
              >
                {isEditing ? 'Done' : 'Edit'}
              </button>
            </div>
            {loadingDraft ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-dc-teal" />
                <p className="text-xs text-gray-400">Loading AI caption...</p>
              </div>
            ) : isEditing ? (
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-2 min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-dc-teal"
                autoFocus
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
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
              disabled={crossPost.isPending || selectedAccountIds.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-dc-teal text-white text-sm font-bold py-3.5 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" />
              {crossPost.isPending ? 'Scheduling...' : 'Schedule for Best Time'}
              {suggestedTime && !crossPost.isPending && (
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

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle className="text-sm font-bold text-gray-900">
              Ready to Share
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-gray-900">
            Ready to Share
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export const SocialPostPrompt: React.FC<SocialPostPromptProps> = (props) => (
  <DragonCandyOutstandProvider>
    <SocialPostPromptInner {...props} />
  </DragonCandyOutstandProvider>
);
