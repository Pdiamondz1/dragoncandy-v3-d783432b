export interface NudgeAction {
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
  action: string;
  payload: Record<string, unknown>;
}

export interface DonnyNudge {
  id: string;
  type: 'application' | 'content' | 'milestone' | 'payment' | 'invitation' | 'match';
  rawData: Record<string, unknown>;
  summary: string;
  priority: 'high' | 'medium' | 'low';
  actions: NudgeAction[];
  createdAt: string;
  readAt: string | null;
  actedAt: string | null;
  dismissedAt: string | null;
}

export interface QuickChip {
  label: string;
  message: string;
  variant: 'teal' | 'pink';
  requiresChat: boolean;
}

export type DonnyStage = 'closed' | 'tray' | 'chat';
