/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDonny } from '@/hooks/useDonny';
import { useDonnyNudges } from '@/hooks/useDonnyNudges';
import { useDonnyQuickChips } from '@/hooks/useDonnyQuickChips';
import type { DonnyStage, DonnyNudge, NudgeAction, QuickChip } from '@/types/donnyNudge';
import type { DonnyMessage, DonnyConversation, DonnyAvatarState } from '@/types/donny';
import type { UserRole } from '@/types/user';

interface DonnyContextValue {
  // UI state
  stage: DonnyStage;
  open: () => void;
  expand: () => void;
  collapse: () => void;
  close: () => void;

  // Nudges
  nudges: DonnyNudge[];
  unreadCount: number;
  executeAction: (nudgeId: string, action: NudgeAction) => void | Promise<void>;
  dismissNudge: (nudgeId: string) => void;

  // Chat
  messages: DonnyMessage[];
  conversation: DonnyConversation | null;
  avatarState: DonnyAvatarState;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  sendMessage: (msg: string) => void;
  retry: () => void;
  clearChat: () => Promise<void>;
  publishDraft: (scheduledPostId: string) => Promise<void>;

  // Context
  currentPage: string;
  userRole: UserRole;
  quickChips: QuickChip[];
  campaignContext: { campaign_id: string; title: string; status: string } | null;
  openDonnyWithContext: (query: string) => void;
}

const DonnyContext = createContext<DonnyContextValue | null>(null);

export function useDonnyContext() {
  const ctx = useContext(DonnyContext);
  if (!ctx) throw new Error('useDonnyContext must be used within DonnyProvider');
  return ctx;
}

interface DonnyProviderProps {
  children: ReactNode;
  userRole: UserRole;
}

export function DonnyProvider({ children, userRole }: DonnyProviderProps) {
  const [stage, setStage] = useState<DonnyStage>('closed');
  const location = useLocation();

  const campaignMatch = location.pathname.match(/\/campaigns\/([a-f0-9-]+)/);
  const campaignIdFromUrl = campaignMatch?.[1] ?? null;

  const [campaignContext, setCampaignContext] = useState<{
    campaign_id: string;
    title: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    if (!campaignIdFromUrl) {
      setCampaignContext(null);
      return;
    }

    const fetchCampaign = async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('id, title, status')
        .eq('id', campaignIdFromUrl)
        .single();

      if (data) {
        setCampaignContext({
          campaign_id: data.id,
          title: data.title,
          status: data.status,
        });
      }
    };

    fetchCampaign();
  }, [campaignIdFromUrl]);

  // Existing chat hook — only fires queries when the panel is open
  const donny = useDonny({ campaignContext, enabled: stage !== 'closed' });

  // Nudges
  const {
    nudges,
    unreadCount,
    actOnNudge,
    dismissNudge: dismissNudgeMutation,
    markAllRead,
  } = useDonnyNudges();

  // Quick chips
  const quickChips = useDonnyQuickChips(userRole);

  // Stage transitions
  const open = useCallback(() => {
    setStage('tray');
    markAllRead();
  }, [markAllRead]);

  const expand = useCallback(() => setStage('chat'), []);
  const collapse = useCallback(() => setStage('tray'), []);
  const close = useCallback(() => setStage('closed'), []);

  const publishDraft = useCallback(async (scheduledPostId: string) => {
    try {
      const postId = scheduledPostId;

      const { data: draft, error: draftErr } = await supabase
        .from('donny_scheduled_posts')
        .select('caption, media_urls, platform, content_type, campaign_id, metadata')
        .eq('id', postId)
        .single();

      if (draftErr || !draft) throw new Error('Could not load draft post');

      const { data: publishData, error: publishErr } = await supabase.functions.invoke(
        'outstand-proxy',
        {
          body: {
            path: '/v1/posts',
            method: 'POST',
            payload: {
              caption: draft.caption,
              media_urls: draft.media_urls,
              platform: draft.platform,
              content_type: draft.content_type,
            },
          },
        },
      );

      if (publishErr) throw publishErr;

      const outstandPostId = publishData?.id ?? publishData?.post_id ?? 'unknown';

      const draftMetadata = (draft.metadata ?? null) as Record<string, unknown> | null;
      const sourceToPostType: Record<string, string> = {
        campaign_social_hook: 'campaign',
        promotion_social_hook: 'ugc_promotion',
        dragonshare_social_hook: 'dragonshare',
      };
      const postType = sourceToPostType[(draftMetadata?.source as string) ?? ''] || 'standalone';

      await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', postId);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('social_post_log').insert({
          user_id: user.id,
          campaign_id: draft.campaign_id,
          outstand_post_id: String(outstandPostId),
          platform: draft.platform,
          post_type: postType,
        });
      }

      toast.success(`Posted to ${draft.platform}!`);
    } catch (err) {
      console.error('[DonnyProvider] publishDraft failed:', err);
      toast.error('Failed to publish post. Please try again.');
    }
  }, []);

  const executeAction = useCallback(
    async (nudgeId: string, action: NudgeAction) => {
      actOnNudge(nudgeId);

      if (action.action === 'navigate' && action.payload?.route) {
        window.location.href = action.payload.route as string;
        return;
      }

      if (action.action === 'post_now' && action.payload?.scheduled_post_id) {
        await publishDraft(action.payload.scheduled_post_id as string);
        return;
      }

      const actionMessage = `Execute action: ${action.action} with ${JSON.stringify(action.payload)}`;
      donny.sendMessage(actionMessage);
    },
    [actOnNudge, donny, publishDraft],
  );

  const dismissNudge = useCallback(
    (nudgeId: string) => dismissNudgeMutation(nudgeId),
    [dismissNudgeMutation]
  );

  const sendMessage = useCallback(
    (msg: string) => {
      donny.sendMessage(msg);
    },
    [donny]
  );

  const openDonnyWithContext = useCallback((query: string) => {
    open();
    setTimeout(() => {
      expand();
      setTimeout(() => {
        sendMessage(query);
      }, 100);
    }, 100);
  }, [open, expand, sendMessage]);

  const value = useMemo<DonnyContextValue>(
    () => ({
      stage,
      open,
      expand,
      collapse,
      close,
      nudges,
      unreadCount,
      executeAction,
      dismissNudge,
      messages: donny.messages,
      conversation: donny.conversation ?? null,
      avatarState: donny.avatarState,
      isStreaming: donny.isStreaming,
      streamingContent: donny.streamingContent,
      error: donny.error,
      sendMessage,
      retry: donny.retry,
      clearChat: donny.clearChat,
      publishDraft,
      currentPage: location.pathname,
      userRole,
      quickChips,
      campaignContext,
      openDonnyWithContext,
    }),
    [
      stage, open, expand, collapse, close,
      nudges, unreadCount, executeAction, dismissNudge,
      donny.messages, donny.conversation, donny.avatarState, donny.isStreaming, donny.error, donny.streamingContent, donny.retry, donny.clearChat,
      sendMessage, location.pathname, userRole, quickChips, campaignContext,
      openDonnyWithContext, publishDraft,
    ]
  );

  return <DonnyContext.Provider value={value}>{children}</DonnyContext.Provider>;
}
