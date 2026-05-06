import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
  executeAction: (nudgeId: string, action: NudgeAction) => void;
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

  // Existing chat hook
  const donny = useDonny({ campaignContext });

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

  // Execute a nudge action
  const executeAction = useCallback(
    (nudgeId: string, action: NudgeAction) => {
      // Mark the nudge as acted on
      actOnNudge(nudgeId);

      // Handle the action — for now, send the action as a message to Donny
      // so the chat edge function can execute it via tool calls
      const actionMessage = `Execute action: ${action.action} with ${JSON.stringify(action.payload)}`;
      donny.sendMessage(actionMessage);
    },
    [actOnNudge, donny]
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
      openDonnyWithContext,
    ]
  );

  return <DonnyContext.Provider value={value}>{children}</DonnyContext.Provider>;
}
