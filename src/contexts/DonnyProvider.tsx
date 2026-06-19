/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
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
  archiveConversation: () => Promise<void>;
  publishDraft: (scheduledPostId: string) => Promise<void>;

  // Context
  currentPage: string;
  userRole: UserRole;
  quickChips: QuickChip[];
  campaignContext: { campaign_id: string; title: string; status: string } | null;
  openDonnyWithContext: (query: string) => void;
}

const DonnyContext = createContext<DonnyContextValue | null>(null);

const noop = () => {};
const asyncNoop = async () => {};
const DONNY_FALLBACK: DonnyContextValue = {
  stage: 'closed' as DonnyStage,
  open: noop,
  expand: noop,
  collapse: noop,
  close: noop,
  nudges: [],
  unreadCount: 0,
  executeAction: noop,
  dismissNudge: noop,
  messages: [],
  conversation: null,
  avatarState: 'idle' as DonnyAvatarState,
  isStreaming: false,
  streamingContent: '',
  error: null,
  sendMessage: noop,
  retry: noop,
  clearChat: asyncNoop,
  archiveConversation: asyncNoop,
  publishDraft: asyncNoop,
  currentPage: '/',
  userRole: 'content_creator' as UserRole,
  quickChips: [],
  campaignContext: null,
  openDonnyWithContext: noop,
};

export function useDonnyContext() {
  const ctx = useContext(DonnyContext);
  if (!ctx) {
    console.warn('[DonnyProvider] useDonnyContext called outside provider — using fallback');
    return DONNY_FALLBACK;
  }
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
      const { data: draft, error: draftErr } = await supabase
        .from('donny_scheduled_posts')
        .select('caption, media_urls, platform, content_type, campaign_id, metadata')
        .eq('id', scheduledPostId)
        .single();

      if (draftErr || !draft) throw new Error('Could not load draft post');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { data: connectedAccounts, error: acctErr } = await supabase
        .from('business_outstand_accounts')
        .select('outstand_social_account_id')
        .eq('user_id', session.user.id)
        .neq('status', 'revoked');

      if (acctErr) throw acctErr;
      const accountIds = (connectedAccounts ?? []).map(
        (a: { outstand_social_account_id: string }) => a.outstand_social_account_id,
      );
      if (accountIds.length === 0) throw new Error('No connected social accounts');

      const container: Record<string, unknown> = { content: draft.caption ?? '' };
      if (draft.media_urls && (draft.media_urls as string[]).length > 0) {
        container.media = (draft.media_urls as string[]).map((url: string, i: number) => ({
          id: `media-${i}`,
          url,
          filename: url.split('/').pop() || `upload-${i}`,
        }));
      }

      const proxyUrl = `${SUPABASE_URL}/functions/v1/outstand-proxy/posts/`;
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accounts: accountIds, containers: [container] }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errDetail = Array.isArray(errBody.error)
          ? (errBody.error as Array<{ message?: string }>)[0]?.message ?? JSON.stringify(errBody.error)
          : (errBody.error as string) || `Outstand API returned ${res.status}`;
        throw new Error(errDetail);
      }

      const publishData = await res.json() as Record<string, unknown>;
      const dataObj = publishData?.data as Record<string, unknown> | undefined;
      const postObj = dataObj?.post as Record<string, unknown> | undefined;
      const outstandPostId = postObj?.id ?? publishData?.id ?? 'unknown';

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
        .eq('id', scheduledPostId);

      if (session.user) {
        const { error: logError } = await supabase.from('social_post_log').insert({
          user_id: session.user.id,
          campaign_id: draft.campaign_id,
          outstand_post_id: String(outstandPostId),
          platform: draft.platform,
          post_type: postType,
          dragonshare_post_id:
            draftMetadata?.source === 'dragonshare_social_hook'
              ? ((draftMetadata?.post_id as string) ?? null)
              : null,
        });
        if (logError) console.error('[DonnyProvider] Failed to log social post:', logError);
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
      archiveConversation: donny.archiveConversation,
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
      donny.messages, donny.conversation, donny.avatarState, donny.isStreaming, donny.error, donny.streamingContent, donny.retry, donny.clearChat, donny.archiveConversation,
      sendMessage, location.pathname, userRole, quickChips, campaignContext,
      openDonnyWithContext, publishDraft,
    ]
  );

  return <DonnyContext.Provider value={value}>{children}</DonnyContext.Provider>;
}
