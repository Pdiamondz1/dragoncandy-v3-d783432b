/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDonny } from '@/hooks/useDonny';
import { useDonnyNudges } from '@/hooks/useDonnyNudges';
import { useDonnyQuickChips } from '@/hooks/useDonnyQuickChips';
import { resolvePostType } from '@/lib/postType';
import { extractOutstandPostId } from '@/lib/outstandPostId';
import { nextStage } from '@/lib/donny/donnyStage';
import type { DonnyStage, DonnyNudge, NudgeAction, QuickChip } from '@/types/donnyNudge';
import type { DonnyMessage, DonnyConversation, DonnyAvatarState } from '@/types/donny';
import type { UserRole } from '@/types/user';
import { composeCaption } from '@/lib/composeCaption';

interface DonnyContextValue {
  // UI state
  stage: DonnyStage;
  open: () => void;
  expand: () => void;
  collapse: () => void;
  close: () => void;
  setInline: () => void;
  exitInline: () => void;
  registerInlineComposer: (el: HTMLTextAreaElement | null) => void;
  focusInlineComposer: () => void;
  /**
   * Resolves once the write lands. `useDonnyNudges` returns a promise here and
   * the fallback returns void — callers that care about failure should route
   * through `Promise.resolve(...)`, which covers both.
   */
  markAllRead: () => void | Promise<void>;

  // Nudges
  nudges: DonnyNudge[];
  unreadCount: number;
  executeAction: (nudgeId: string, action: NudgeAction) => void | Promise<void>;
  dismissNudge: (nudgeId: string) => void;

  // Chat
  messages: DonnyMessage[];
  /**
   * Ids of the `donny_messages` rows this browser session wrote, oldest first.
   * Both halves of an exchange appear here (the client writes both rows;
   * donny-orchestrator writes none), which is what lets the inline canvas scope
   * its thread to "this visit" without counting rows it may not have fetched
   * yet. See `DonnyCanvas`.
   */
  clientMessageIds: string[];
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
  setInline: noop,
  exitInline: noop,
  registerInlineComposer: noop,
  focusInlineComposer: noop,
  markAllRead: noop,
  nudges: [],
  unreadCount: 0,
  executeAction: noop,
  dismissNudge: noop,
  messages: [],
  clientMessageIds: [],
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
  // The inline dashboard composer, registered by DonnyCanvas while it is mounted.
  const inlineComposerRef = useRef<HTMLTextAreaElement | null>(null);
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

  // Stage transitions — every rule lives in nextStage(); these only bind side effects.
  const open = useCallback(() => {
    // Guarded here rather than inside the updater: markAllRead is a side effect,
    // and React may invoke a state updater twice under StrictMode.
    if (stage === 'inline') return;
    setStage((s) => nextStage(s, 'open'));
    markAllRead();
  }, [stage, markAllRead]);

  const expand = useCallback(() => setStage((s) => nextStage(s, 'expand')), []);
  const collapse = useCallback(() => setStage((s) => nextStage(s, 'collapse')), []);
  const close = useCallback(() => setStage((s) => nextStage(s, 'close')), []);
  const setInline = useCallback(() => setStage((s) => nextStage(s, 'inline')), []);
  const exitInline = useCallback(() => setStage((s) => nextStage(s, 'exitInline')), []);

  const registerInlineComposer = useCallback((el: HTMLTextAreaElement | null) => {
    inlineComposerRef.current = el;
  }, []);

  const focusInlineComposer = useCallback(() => {
    const el = inlineComposerRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
  }, []);

  const publishDraft = useCallback(async (scheduledPostId: string) => {
    try {
      const { data: draft, error: draftErr } = await supabase
        .from('donny_scheduled_posts')
        .select('caption, hashtags, media_urls, platform, content_type, campaign_id, metadata')
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

      // Hashtags are stored in their own `text[]` column and were NEVER sent —
      // this posted `caption` alone, so every tag Donny generated (and now
      // every tag edited in the Drafts dialog) was silently dropped at publish.
      // composeCaption is the same join the DragonShare prefill uses, so the
      // published text matches what the draft card shows.
      const container: Record<string, unknown> = {
        content: composeCaption(draft.caption, draft.hashtags as string[] | null),
      };
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
      // No 'unknown' fallback: social_post_log.outstand_post_id is NOT NULL and
      // carries the UNIQUE (outstand_post_id, platform) key -- a placeholder
      // here would leave the first such row permanently unmatchable by the
      // webhook, and a later unresolved publish on the same platform would
      // collide with it.
      //
      // Routed through the one shared reader (2026-08-06). This site's own union
      // was `data.post.id ?? id` -- it worked, but only because outstand-proxy's
      // normalizer always produces `data.post`; it carried no link for the RAW
      // `{success, post}` shape, so it would have broken silently if that
      // normalizer were ever removed. The shared helper covers both.
      const outstandPostId = extractOutstandPostId(publishData);

      const draftMetadata = (draft.metadata ?? null) as Record<string, unknown> | null;
      const postType = resolvePostType(draftMetadata?.source as string | null, draft.campaign_id);

      if (outstandPostId == null) {
        // Neither write below can honestly happen: donny_scheduled_posts.metadata
        // would tell outstand-webhook's recordPublishedPost this row is matchable
        // when it isn't, and social_post_log.outstand_post_id is NOT NULL with no
        // safe placeholder value. The publish itself already succeeded and the
        // status/published_at update below still records that -- only the
        // measurement plumbing is skipped, visibly.
        console.warn(
          `[DonnyProvider] Could not resolve an Outstand post id from the response for schedule row ${scheduledPostId} (platform ${draft.platform}); skipping the metadata.outstand_post_id update and the social_post_log write. Post is published but will not be measured.`,
        );
      }

      // Merge outstand_post_id into the existing metadata (never clobber — a
      // DragonShare draft's source/post_id lives here too). outstand-webhook's
      // recordPublishedPost matches schedule rows on metadata->>outstand_post_id;
      // without this, a schedule row that DID publish looks identical to one
      // that never existed, which is what grew the no-schedule-row fallback.
      // status/published_at update unconditionally -- the post did publish --
      // the metadata key is only included when there's a real id to put in it.
      const { error: scheduleUpdateError } = await supabase
        .from('donny_scheduled_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          ...(outstandPostId != null
            ? { metadata: { ...(draftMetadata ?? {}), outstand_post_id: outstandPostId } }
            : {}),
        })
        .eq('id', scheduledPostId);

      if (scheduleUpdateError) {
        // The post already published — this only affects whether the webhook
        // can match this schedule row. Published but unmatchable, not lost: the
        // direct social_post_log insert below still records it (when an id was
        // resolved), and the no-schedule-row fallback can still stamp it if an
        // owner resolves.
        console.error(
          '[DonnyProvider] Failed to record outstand_post_id on schedule row (post published but unmatchable by webhook):',
          scheduleUpdateError,
        );
      }

      if (session.user && outstandPostId != null) {
        const { error: logError } = await supabase.from('social_post_log').insert({
          user_id: session.user.id,
          campaign_id: draft.campaign_id,
          outstand_post_id: outstandPostId,
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
      setInline,
      exitInline,
      registerInlineComposer,
      focusInlineComposer,
      markAllRead,
      nudges,
      unreadCount,
      executeAction,
      dismissNudge,
      messages: donny.messages,
      clientMessageIds: donny.clientMessageIds,
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
      setInline, exitInline, registerInlineComposer, focusInlineComposer, markAllRead,
      nudges, unreadCount, executeAction, dismissNudge,
      donny.messages, donny.clientMessageIds, donny.conversation, donny.avatarState, donny.isStreaming, donny.error, donny.streamingContent, donny.retry, donny.clearChat, donny.archiveConversation,
      sendMessage, location.pathname, userRole, quickChips, campaignContext,
      openDonnyWithContext, publishDraft,
    ]
  );

  return <DonnyContext.Provider value={value}>{children}</DonnyContext.Provider>;
}
