import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
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
  sendMessage: (msg: string) => void;

  // Context
  currentPage: string;
  userRole: UserRole;
  quickChips: QuickChip[];
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

  // Existing chat hook
  const donny = useDonny();

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
      sendMessage,
      currentPage: location.pathname,
      userRole,
      quickChips,
    }),
    [
      stage, open, expand, collapse, close,
      nudges, unreadCount, executeAction, dismissNudge,
      donny.messages, donny.conversation, donny.avatarState, donny.isStreaming,
      sendMessage, location.pathname, userRole, quickChips,
    ]
  );

  return <DonnyContext.Provider value={value}>{children}</DonnyContext.Provider>;
}
