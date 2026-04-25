// Avatar animation states
export type DonnyAvatarState = 'idle' | 'thinking' | 'celebrating' | 'error' | 'action_needed';

// Message roles
export type DonnyMessageRole = 'user' | 'assistant' | 'tool';

// Rich card types — discriminated union
export type DonnyRichCardType =
  | 'creator_profile'
  | 'campaign_summary'
  | 'payment_confirmation'
  | 'application_summary'
  | 'onboarding_step';

export interface DonnyRichCardCreatorProfile {
  type: 'creator_profile';
  data: {
    id: string;
    name: string;
    avatar_url: string | null;
    profile_slug: string | null;
    platforms: string[];
    niche: string;
    rating: number;
    project_count: number;
  };
}

export interface DonnyRichCardCampaignSummary {
  type: 'campaign_summary';
  data: {
    id: string;
    title: string;
    budget_min: number;
    budget_max: number;
    platform: string;
    application_count: number;
    status: string;
  };
}

export interface DonnyRichCardPaymentConfirmation {
  type: 'payment_confirmation';
  data: {
    collaboration_id: string;
    amount: number;
    recipient_name: string;
    description: string;
    payment_url: string;
  };
}

export interface DonnyRichCardApplicationSummary {
  type: 'application_summary';
  data: {
    id: string;
    campaign_title: string;
    creator_name: string;
    pitch: string;
    proposed_rate: number;
    status: string;
  };
}

export interface DonnyRichCardOnboardingStep {
  type: 'onboarding_step';
  data: {
    step_number: number;
    total_steps: number;
    field: string;
    options?: string[];
  };
}

export type DonnyRichCard =
  | DonnyRichCardCreatorProfile
  | DonnyRichCardCampaignSummary
  | DonnyRichCardPaymentConfirmation
  | DonnyRichCardApplicationSummary
  | DonnyRichCardOnboardingStep;

// Tool call from GPT-4o
export interface DonnyToolCall {
  id: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// Stored message
export interface DonnyMessage {
  id: string;
  conversation_id: string;
  role: DonnyMessageRole;
  content: string | null;
  tool_calls: DonnyToolCall[] | null;
  tool_result: Record<string, unknown> | null;
  rich_card: DonnyRichCard | null;
  created_at: string;
}

// Conversation
export interface DonnyConversation {
  id: string;
  user_id: string;
  created_at: string;
  last_message_at: string;
  context_snapshot: Record<string, unknown>;
}

// Tool execution audit record
export interface DonnyToolExecution {
  id: string;
  message_id: string;
  user_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  created_at: string;
}

// Creator automation preferences
export type AutomationLevel = 'notify' | 'suggest' | 'auto_pilot';

export interface CreatorAutomationPreferences {
  id: string;
  user_id: string;
  automation_level: AutomationLevel;
  auto_apply_criteria: {
    budget_min?: number;
    niches?: string[];
    platforms?: string[];
  };
  updated_at: string;
}

// Quick action chip
export interface DonnyQuickChip {
  label: string;
  message: string; // What gets sent to Donny when tapped
}

// Dashboard card suggestion
export interface DonnySuggestion {
  message: string;
  primary_action: {
    label: string;
    message: string; // What gets sent to Donny when tapped
  };
  dismiss_label: string;
}

// Hook state
export interface DonnyState {
  conversation: DonnyConversation | null;
  messages: DonnyMessage[];
  isStreaming: boolean;
  streamingContent: string;
  avatarState: DonnyAvatarState;
  error: string | null;
}
