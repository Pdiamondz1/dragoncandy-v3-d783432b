# Donny AI Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Donny, DragonCandy's AI concierge chatbot — a GPT-4o-powered edge function agent with function-calling, accessible on every page via a bottom nav button and proactive dashboard card.

**Architecture:** Supabase Edge Function wraps GPT-4o with function-calling. User messages POST to the edge function, which loads user context, calls GPT-4o with tool definitions, executes tool calls against Supabase, and saves the response. The client uses Supabase Realtime subscriptions on `donny_messages` to detect new messages and refresh the UI. v1 uses request/response (not token-level streaming) for simplicity — typing indicator shows while waiting. Frontend uses a `useDonny()` hook and three UI surfaces: DonnyCard (dashboard), DonnyNavButton (bottom nav), and DonnyChatSheet (slide-up chat).

**Tech Stack:** React 18 + TypeScript, Supabase (Postgres, Edge Functions, Realtime), OpenAI GPT-4o (function-calling + streaming), TanStack React Query, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-23-donny-ai-chatbot-design.md`

---

## File Structure

### New Files

```
src/
├── components/donny/
│   ├── DonnyAvatar.tsx            # Animated avatar with state prop (idle/thinking/celebrating/error/action_needed)
│   ├── DonnyCard.tsx              # Dashboard proactive suggestion card
│   ├── DonnyNavButton.tsx         # Bottom nav center button with notification badge
│   ├── DonnyChatSheet.tsx         # Slide-up chat sheet (main conversation UI)
│   ├── DonnyMessage.tsx           # Individual message bubble (text + rich cards + tool status)
│   ├── DonnyRichCard.tsx          # Inline card renderer (creator profiles, campaign summaries, payment confirmations)
│   ├── DonnyQuickChips.tsx        # Quick action chip row above input
│   └── DonnyTypingIndicator.tsx   # Typing dots shown while streaming
├── hooks/
│   ├── useDonny.ts                # Core hook: send messages, subscribe to Realtime, manage conversation state
│   └── useDonnyDashboard.ts       # Hook: fetch proactive suggestion for dashboard card
├── types/
│   └── donny.ts                   # TypeScript types for Donny messages, tools, rich cards, avatar states

supabase/
├── functions/donny-chat/
│   └── index.ts                   # Edge function: context loading, GPT-4o call, tool execution, streaming
├── migrations/
│   └── 20260323_donny_tables.sql  # New tables: donny_conversations, donny_messages, donny_tool_executions, creator_automation_preferences
```

### Modified Files

```
src/
├── components/MobileBottomNav.tsx  # Replace center + button with DonnyNavButton
├── lib/navConfig.ts                # Update center nav item to Donny for all roles
├── pages/BusinessDashboard.tsx     # Add DonnyCard at top
├── pages/CreatorDashboard.tsx      # Add DonnyCard at top
├── pages/BrandDashboard.tsx        # Add DonnyCard at top
├── integrations/supabase/types.ts  # Add generated types for new Donny tables
```

---

## Task 1: Database Migration — Donny Tables

**Files:**
- Create: `supabase/migrations/20260323_donny_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Donny Conversations
CREATE TABLE donny_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  context_snapshot jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_donny_conversations_user_id ON donny_conversations(user_id);

ALTER TABLE donny_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conversations"
  ON donny_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON donny_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON donny_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Donny Messages
CREATE TABLE donny_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES donny_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text,
  tool_calls jsonb,
  tool_result jsonb,
  rich_card jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_donny_messages_conversation_id ON donny_messages(conversation_id);
CREATE INDEX idx_donny_messages_created_at ON donny_messages(created_at);

ALTER TABLE donny_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own messages"
  ON donny_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM donny_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own messages"
  ON donny_messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM donny_conversations WHERE user_id = auth.uid()
    )
  );

-- Donny Tool Executions
CREATE TABLE donny_tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES donny_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_donny_tool_executions_user_id ON donny_tool_executions(user_id);
CREATE INDEX idx_donny_tool_executions_message_id ON donny_tool_executions(message_id);

ALTER TABLE donny_tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tool executions"
  ON donny_tool_executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert tool executions"
  ON donny_tool_executions FOR INSERT
  WITH CHECK (true);

-- Creator Automation Preferences
CREATE TABLE creator_automation_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  automation_level text NOT NULL DEFAULT 'notify' CHECK (automation_level IN ('notify', 'suggest', 'auto_pilot')),
  auto_apply_criteria jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE creator_automation_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON creator_automation_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON creator_automation_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON creator_automation_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable Realtime on donny_messages for streaming
ALTER PUBLICATION supabase_realtime ADD TABLE donny_messages;
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor if not using CLI locally)

Verify: All 4 tables exist with RLS policies enabled. Check in Supabase dashboard → Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260323_donny_tables.sql
git commit -m "feat(donny): add database tables for conversations, messages, tool executions, and creator automation preferences"
```

---

## Task 2: TypeScript Types for Donny

**Files:**
- Create: `src/types/donny.ts`

- [ ] **Step 1: Define all Donny types**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types/donny.ts
git commit -m "feat(donny): add TypeScript types for messages, rich cards, tools, and state"
```

---

## Task 3: DonnyAvatar Component

**Files:**
- Create: `src/components/donny/DonnyAvatar.tsx`

- [ ] **Step 1: Build the animated avatar component**

```typescript
import { cn } from '@/lib/utils';
import type { DonnyAvatarState } from '@/types/donny';

interface DonnyAvatarProps {
  state?: DonnyAvatarState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-sm',
  md: 'w-10 h-10 text-xl',
  lg: 'w-14 h-14 text-3xl',
};

const stateStyles: Record<DonnyAvatarState, string> = {
  idle: 'bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] animate-[breathe_3s_ease-in-out_infinite]',
  thinking: 'bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] animate-[pulse_1s_ease-in-out_infinite]',
  celebrating: 'bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] animate-[bounce_0.5s_ease-in-out_3]',
  error: 'bg-gradient-to-br from-[#F9A8D4] to-[#EC4899] animate-[shake_0.3s_ease-in-out_2]',
  action_needed: 'bg-gradient-to-br from-[#FACC15] to-[#F59E0B] animate-[pulse_1.5s_ease-in-out_infinite]',
};

export function DonnyAvatar({ state = 'idle', size = 'md', className }: DonnyAvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0',
        sizeClasses[size],
        stateStyles[state],
        className
      )}
    >
      🐉
    </div>
  );
}
```

- [ ] **Step 2: Add custom keyframes to tailwind.config.ts**

Open `tailwind.config.ts` and add these keyframes and animations inside the `theme.extend` block:

```typescript
keyframes: {
  // ... existing keyframes ...
  breathe: {
    '0%, 100%': { transform: 'scale(1)', opacity: '1' },
    '50%': { transform: 'scale(1.03)', opacity: '0.95' },
  },
  shake: {
    '0%, 100%': { transform: 'translateX(0)' },
    '25%': { transform: 'translateX(-3px)' },
    '75%': { transform: 'translateX(3px)' },
  },
},
animation: {
  // ... existing animations ...
  breathe: 'breathe 3s ease-in-out infinite',
  shake: 'shake 0.3s ease-in-out 2',
},
```

- [ ] **Step 3: Verify component renders**

Import and render `<DonnyAvatar state="idle" />` temporarily in any existing page. Confirm the teal gradient circle with 🐉 renders and gently pulses. Remove the temporary usage.

- [ ] **Step 4: Commit**

```bash
git add src/components/donny/DonnyAvatar.tsx tailwind.config.ts
git commit -m "feat(donny): add animated DonnyAvatar component with 5 states"
```

---

## Task 4: DonnyMessage and DonnyRichCard Components

**Files:**
- Create: `src/components/donny/DonnyMessage.tsx`
- Create: `src/components/donny/DonnyRichCard.tsx`

- [ ] **Step 1: Build DonnyRichCard**

```typescript
import { Button } from '@/components/ui/button';
import type { DonnyRichCard as RichCardType } from '@/types/donny';
import { useNavigate } from 'react-router-dom';

interface DonnyRichCardProps {
  card: RichCardType;
}

export function DonnyRichCard({ card }: DonnyRichCardProps) {
  const navigate = useNavigate();

  switch (card.type) {
    case 'creator_profile':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="flex gap-2 items-center">
            <div className="w-10 h-10 rounded-full bg-gray-200 ring-2 ring-teal-400 overflow-hidden flex-shrink-0">
              {card.data.avatar_url ? (
                <img src={card.data.avatar_url} alt={card.data.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                  {card.data.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-[#111]">{card.data.name}</div>
              <div className="text-xs text-[#555]">{card.data.platforms.join(' · ')} · {card.data.niche}</div>
              <div className="text-xs text-[#EC4899]">⭐ {card.data.rating} · {card.data.project_count} projects</div>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              className="flex-1 rounded-full bg-[#4DD9C0] hover:bg-[#3cc5ad] text-white text-xs"
              onClick={() => navigate(`/profile/creator/${card.data.id}`)}
            >
              View Portfolio
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-full border-[#EC4899] text-[#EC4899] text-xs"
            >
              Invite
            </Button>
          </div>
        </div>
      );

    case 'campaign_summary':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="text-sm font-bold text-[#111]">{card.data.title}</div>
          <div className="text-xs text-[#555] mt-1">
            {card.data.platform} · ${card.data.budget_min}–${card.data.budget_max}
          </div>
          <div className="text-xs text-[#4DD9C0] mt-1">
            {card.data.application_count} applications · {card.data.status}
          </div>
          <Button
            size="sm"
            className="w-full rounded-full bg-[#4DD9C0] hover:bg-[#3cc5ad] text-white text-xs mt-2"
            onClick={() => navigate(`/dashboard/business/campaigns/${card.data.id}`)}
          >
            View Campaign
          </Button>
        </div>
      );

    case 'payment_confirmation':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-[#FACC15] mt-1.5">
          <div className="text-sm font-bold text-[#111]">Payment Ready</div>
          <div className="text-xs text-[#555] mt-1">
            ${card.data.amount} to {card.data.recipient_name}
          </div>
          <div className="text-xs text-[#555]">{card.data.description}</div>
          <Button
            size="sm"
            className="w-full rounded-full bg-[#4DD9C0] hover:bg-[#3cc5ad] text-white text-xs mt-2"
            onClick={() => navigate(card.data.payment_url)}
          >
            Confirm Payment
          </Button>
        </div>
      );

    case 'application_summary':
      return (
        <div className="bg-white rounded-xl p-3 border-2 border-teal-300 mt-1.5">
          <div className="text-sm font-bold text-[#111]">{card.data.campaign_title}</div>
          <div className="text-xs text-[#555] mt-1">From: {card.data.creator_name}</div>
          <div className="text-xs text-[#555] italic mt-1">"{card.data.pitch}"</div>
          <div className="text-xs text-[#4DD9C0] mt-1">Proposed: ${card.data.proposed_rate}</div>
        </div>
      );

    case 'onboarding_step':
      return null; // Onboarding options rendered as quick chips, not cards

    default:
      return null;
  }
}
```

- [ ] **Step 2: Build DonnyMessage**

```typescript
import { DonnyAvatar } from './DonnyAvatar';
import { DonnyRichCard } from './DonnyRichCard';
import type { DonnyMessage as DonnyMessageType, DonnyAvatarState } from '@/types/donny';

interface DonnyMessageProps {
  message: DonnyMessageType;
  avatarState?: DonnyAvatarState;
  isLatestAssistant?: boolean;
}

export function DonnyMessage({ message, avatarState = 'idle', isLatestAssistant = false }: DonnyMessageProps) {
  if (message.role === 'tool') return null; // Tool messages are internal, not rendered

  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-[#4DD9C0] rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[75%]">
          <p className="text-sm text-white leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-2 items-end">
      <DonnyAvatar
        size="sm"
        state={isLatestAssistant ? avatarState : 'idle'}
      />
      <div className="max-w-[80%]">
        {message.content && (
          <div className="bg-[#F9A8D4] rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            <p className="text-sm text-[#111] leading-relaxed">{message.content}</p>
          </div>
        )}
        {message.rich_card && <DonnyRichCard card={message.rich_card} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/donny/DonnyMessage.tsx src/components/donny/DonnyRichCard.tsx
git commit -m "feat(donny): add DonnyMessage and DonnyRichCard components"
```

---

## Task 5: DonnyQuickChips and DonnyTypingIndicator Components

**Files:**
- Create: `src/components/donny/DonnyQuickChips.tsx`
- Create: `src/components/donny/DonnyTypingIndicator.tsx`

- [ ] **Step 1: Build DonnyQuickChips**

```typescript
import type { DonnyQuickChip } from '@/types/donny';

interface DonnyQuickChipsProps {
  chips: DonnyQuickChip[];
  onChipTap: (message: string) => void;
  disabled?: boolean;
}

export function DonnyQuickChips({ chips, onChipTap, disabled = false }: DonnyQuickChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap px-3 py-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onChipTap(chip.message)}
          disabled={disabled}
          className="bg-white border border-[#4DD9C0] text-[#4DD9C0] text-xs font-medium px-3 py-1.5 rounded-full hover:bg-[#4DD9C0] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build DonnyTypingIndicator**

```typescript
import { DonnyAvatar } from './DonnyAvatar';

export function DonnyTypingIndicator() {
  return (
    <div className="flex gap-2 items-end">
      <DonnyAvatar size="sm" state="thinking" />
      <div className="bg-[#F9A8D4] rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-[#111] rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" />
          <span className="w-1.5 h-1.5 bg-[#111] rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.15s]" style={{ animationDelay: '0.15s' }} />
          <span className="w-1.5 h-1.5 bg-[#111] rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.3s]" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/donny/DonnyQuickChips.tsx src/components/donny/DonnyTypingIndicator.tsx
git commit -m "feat(donny): add DonnyQuickChips and DonnyTypingIndicator components"
```

---

## Task 6: useDonny Hook — Core Chat Logic

**Files:**
- Create: `src/hooks/useDonny.ts`

- [ ] **Step 1: Build the useDonny hook**

This is the core hook that manages Donny conversations. It handles:
- Loading/creating conversations
- Sending messages to the `donny-chat` edge function
- Subscribing to Supabase Realtime for streamed responses
- Managing avatar state based on activity
- Providing contextual quick chips

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  DonnyMessage,
  DonnyConversation,
  DonnyState,
  DonnyAvatarState,
  DonnyQuickChip,
} from '@/types/donny';

const DEFAULT_QUICK_CHIPS: Record<string, DonnyQuickChip[]> = {
  business_client: [
    { label: 'Create Campaign', message: 'I want to create a new campaign' },
    { label: 'Find Creators', message: 'Help me find content creators' },
    { label: 'My Campaigns', message: 'Show me my active campaigns' },
  ],
  content_creator: [
    { label: 'Browse Campaigns', message: 'Show me campaigns I can apply to' },
    { label: 'My Projects', message: 'Show me my active projects' },
    { label: 'My Earnings', message: 'Show me my earnings' },
  ],
  brand: [
    { label: 'Find Creators', message: 'Help me find content creators' },
    { label: 'My Campaigns', message: 'Show me my campaigns' },
    { label: 'Analytics', message: 'Show me my campaign analytics' },
  ],
};

export function useDonny() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [streamingContent, setStreamingContent] = useState('');
  const [avatarState, setAvatarState] = useState<DonnyAvatarState>('idle');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load or create conversation
  const { data: conversation } = useQuery({
    queryKey: ['donny-conversation', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Try to get existing conversation
      const { data: existing, error: fetchError } = await supabase
        .from('donny_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (existing) return existing as DonnyConversation;

      // Create new conversation
      const { data: created, error: createError } = await supabase
        .from('donny_conversations')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (createError) throw createError;
      return created as DonnyConversation;
    },
    enabled: !!user,
  });

  // Load messages
  const { data: messages = [] } = useQuery({
    queryKey: ['donny-messages', conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];

      const { data, error: fetchError } = await supabase
        .from('donny_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      return (data ?? []) as DonnyMessage[];
    },
    enabled: !!conversation,
  });

  // Subscribe to Realtime for new messages (streamed from edge function)
  useEffect(() => {
    if (!conversation) return;

    const channel = supabase
      .channel(`donny-messages-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donny_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation.id] });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation, queryClient]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversation || !user) throw new Error('No active conversation');

      setIsStreaming(true);
      setAvatarState('thinking');
      setStreamingContent('');
      setError(null);

      // Insert user message locally first
      const { error: insertError } = await supabase
        .from('donny_messages')
        .insert({
          conversation_id: conversation.id,
          role: 'user',
          content,
        });

      if (insertError) throw insertError;

      // Call edge function — it handles GPT-4o + tool execution + saving assistant message
      const { data, error: fnError } = await supabase.functions.invoke('donny-chat', {
        body: {
          conversation_id: conversation.id,
          message: content,
        },
      });

      if (fnError) throw fnError;

      // Edge function saves the assistant message to DB.
      // Realtime subscription picks it up and invalidates the query.
      return data;
    },
    onSuccess: () => {
      setAvatarState('celebrating');
      setTimeout(() => setAvatarState('idle'), 2000);
      setIsStreaming(false);
      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation?.id] });
      queryClient.invalidateQueries({ queryKey: ['donny-dashboard', user?.id] });
    },
    onError: (err) => {
      setAvatarState('error');
      setTimeout(() => setAvatarState('idle'), 3000);
      setIsStreaming(false);
      setStreamingContent('');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    },
  });

  const sendMessage = useCallback(
    (content: string) => {
      sendMessageMutation.mutate(content);
    },
    [sendMessageMutation]
  );

  const clearChat = useCallback(async () => {
    if (!conversation) return;

    // Delete all messages in this conversation
    await supabase
      .from('donny_messages')
      .delete()
      .eq('conversation_id', conversation.id);

    queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation.id] });
  }, [conversation, queryClient]);

  const quickChips = DEFAULT_QUICK_CHIPS[profile?.role ?? 'business_client'] ?? [];

  const state: DonnyState = {
    conversation,
    messages,
    isStreaming,
    streamingContent,
    avatarState,
    error,
  };

  return {
    ...state,
    sendMessage,
    clearChat,
    quickChips,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDonny.ts
git commit -m "feat(donny): add useDonny hook for conversation management, messaging, and Realtime subscription"
```

---

## Task 7: useDonnyDashboard Hook

**Files:**
- Create: `src/hooks/useDonnyDashboard.ts`

- [ ] **Step 1: Build the dashboard suggestion hook**

This hook computes a proactive suggestion for the DonnyCard based on user activity.

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { DonnySuggestion } from '@/types/donny';

export function useDonnyDashboard() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['donny-dashboard', user?.id],
    queryFn: async (): Promise<DonnySuggestion> => {
      if (!user || !profile) {
        return {
          message: "Hey! 👋 I'm Donny, your content assistant. Tap here to get started!",
          primary_action: { label: 'Chat with Donny', message: 'Hi Donny!' },
          dismiss_label: 'Later',
        };
      }

      if (profile.role === 'business_client' || profile.role === 'brand') {
        // Check for new applications
        const { data: applications } = await supabase
          .from('campaign_applications')
          .select('id, campaigns!inner(user_id)')
          .eq('campaigns.user_id', user.id)
          .eq('status', 'pending')
          .limit(10);

        const pendingCount = applications?.length ?? 0;

        if (pendingCount > 0) {
          return {
            message: `You have ${pendingCount} new creator application${pendingCount > 1 ? 's' : ''}! Want me to show you the best matches? 🔥`,
            primary_action: { label: 'Show me', message: 'Show me my new applications' },
            dismiss_label: 'Later',
          };
        }

        // Check for campaigns without applications
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, title')
          .eq('user_id', user.id)
          .eq('status', 'published')
          .limit(5);

        if (!campaigns || campaigns.length === 0) {
          return {
            message: "Ready to find amazing creators for your brand? Let's create your first campaign! 🚀",
            primary_action: { label: 'Create Campaign', message: 'I want to create a new campaign' },
            dismiss_label: 'Maybe later',
          };
        }

        return {
          message: `Your ${campaigns.length} campaign${campaigns.length > 1 ? 's are' : ' is'} live! Need help with anything? 💪`,
          primary_action: { label: 'Check status', message: 'Show me my campaign status' },
          dismiss_label: 'All good',
        };
      }

      // Creator role
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('status', 'published')
        .limit(20);

      const availableCount = campaigns?.length ?? 0;

      if (availableCount > 0) {
        return {
          message: `There are ${availableCount} campaigns looking for creators like you! Want to browse? 🎯`,
          primary_action: { label: 'Show me', message: 'Show me campaigns I can apply to' },
          dismiss_label: 'Later',
        };
      }

      return {
        message: "Hey! 👋 No new campaigns right now, but I'll let you know as soon as one matches your style!",
        primary_action: { label: 'Update my profile', message: 'Help me update my creator profile' },
        dismiss_label: 'OK',
      };
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDonnyDashboard.ts
git commit -m "feat(donny): add useDonnyDashboard hook for proactive suggestions"
```

---

## Task 8: DonnyCard Component (Dashboard)

**Files:**
- Create: `src/components/donny/DonnyCard.tsx`

- [ ] **Step 1: Build the dashboard Donny card**

```typescript
import { DonnyAvatar } from './DonnyAvatar';
import { useDonnyDashboard } from '@/hooks/useDonnyDashboard';
import { useState } from 'react';

interface DonnyCardProps {
  onOpenChat: (initialMessage?: string) => void;
}

export function DonnyCard({ onOpenChat }: DonnyCardProps) {
  const { data: suggestion, isLoading } = useDonnyDashboard();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !suggestion || dismissed) return null;

  return (
    <div className="bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] rounded-2xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <DonnyAvatar size="lg" state="idle" />
        <div className="flex-1">
          <div className="text-sm font-bold text-white">Donny says...</div>
          <div className="text-sm text-white/90 mt-1 leading-relaxed">
            {suggestion.message}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 ml-[68px]">
        <button
          onClick={() => onOpenChat(suggestion.primary_action.message)}
          className="bg-white text-[#4DD9C0] text-sm font-bold px-4 py-1.5 rounded-full hover:bg-white/90 transition-colors"
        >
          {suggestion.primary_action.label}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="bg-white/20 text-white text-sm px-4 py-1.5 rounded-full hover:bg-white/30 transition-colors"
        >
          {suggestion.dismiss_label}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyCard.tsx
git commit -m "feat(donny): add DonnyCard dashboard component with proactive suggestions"
```

---

## Task 9: DonnyChatSheet Component

**Files:**
- Create: `src/components/donny/DonnyChatSheet.tsx`

- [ ] **Step 1: Build the slide-up chat sheet**

This is the main conversation UI that slides up when the user taps the 🐉 nav button.

```typescript
import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DonnyAvatar } from './DonnyAvatar';
import { DonnyMessage } from './DonnyMessage';
import { DonnyQuickChips } from './DonnyQuickChips';
import { DonnyTypingIndicator } from './DonnyTypingIndicator';
import { useDonny } from '@/hooks/useDonny';
import { X, Plus, ArrowUp } from 'lucide-react';

interface DonnyChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMessage?: string;
}

export function DonnyChatSheet({ open, onOpenChange, initialMessage }: DonnyChatSheetProps) {
  const {
    messages,
    isStreaming,
    avatarState,
    error,
    sendMessage,
    quickChips,
  } = useDonny();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageSentRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Send initial message if provided (from DonnyCard tap)
  useEffect(() => {
    if (open && initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      sendMessage(initialMessage);
    }
    if (!open) {
      initialMessageSentRef.current = false;
    }
  }, [open, initialMessage, sendMessage]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-3xl p-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-white rounded-t-3xl">
          <DonnyAvatar size="md" state={avatarState} />
          <div className="flex-1">
            <div className="text-sm font-bold text-[#111]">Donny</div>
            <div className="text-xs text-[#4DD9C0]">Always here for you ✨</div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-[#888] hover:text-[#111] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-[#A8A8A0]">
          {messages.length === 0 && !isStreaming && (
            <div className="flex gap-2 items-end">
              <DonnyAvatar size="sm" state="idle" />
              <div className="bg-[#F9A8D4] rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[80%]">
                <p className="text-sm text-[#111] leading-relaxed">
                  Hey! 👋 I'm Donny, your DragonCandy assistant. I can help you create campaigns, find creators, manage content, and more. What can I do for you?
                </p>
              </div>
            </div>
          )}

          {messages
            .filter((m) => m.role !== 'tool')
            .map((message, index, filtered) => (
              <DonnyMessage
                key={message.id}
                message={message}
                avatarState={avatarState}
                isLatestAssistant={
                  message.role === 'assistant' &&
                  index === filtered.length - 1
                }
              />
            ))}

          {isStreaming && <DonnyTypingIndicator />}

          {error && (
            <div className="text-center text-xs text-red-600 bg-red-50 rounded-lg p-2 mx-4">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick chips */}
        <DonnyQuickChips
          chips={quickChips}
          onChipTap={(message) => sendMessage(message)}
          disabled={isStreaming}
        />

        {/* Input bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white border-t">
          <button className="w-8 h-8 bg-[#111] rounded-full flex items-center justify-center flex-shrink-0">
            <Plus className="w-4 h-4 text-white" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Donny..."
            rows={1}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm resize-none outline-none max-h-20 placeholder:text-[#999]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 bg-[#111] rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            <ArrowUp className="w-4 h-4 text-white" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyChatSheet.tsx
git commit -m "feat(donny): add DonnyChatSheet slide-up conversation UI"
```

---

## Task 10: DonnyNavButton and Bottom Nav Integration

**Files:**
- Create: `src/components/donny/DonnyNavButton.tsx`
- Modify: `src/components/MobileBottomNav.tsx`
- Modify: `src/lib/navConfig.ts`

- [ ] **Step 1: Build DonnyNavButton**

```typescript
import { DonnyAvatar } from './DonnyAvatar';
import { useDonnyDashboard } from '@/hooks/useDonnyDashboard';

interface DonnyNavButtonProps {
  onClick: () => void;
}

export function DonnyNavButton({ onClick }: DonnyNavButtonProps) {
  const { data: suggestion } = useDonnyDashboard();
  const hasNotification = !!suggestion;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center -mt-4 relative"
    >
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] flex items-center justify-center text-2xl shadow-lg shadow-teal-400/40 border-[3px] border-white">
        🐉
      </div>
      {hasNotification && (
        <span className="absolute top-0 right-0 w-3 h-3 bg-[#EC4899] rounded-full border-2 border-white" />
      )}
      <span className="text-[10px] text-[#4DD9C0] font-bold mt-0.5">Donny</span>
    </button>
  );
}
```

- [ ] **Step 2: Update navConfig.ts — mark center items as `isDonny: true`**

Open `src/lib/navConfig.ts`. For each role's bottom nav config, change the center item (the one with `isCenter: true`) to have `isDonny: true` instead. This tells `MobileBottomNav` to render the DonnyNavButton there.

Find the center item in each role array (business, creator, brand) and add `isDonny: true` to it. Keep `isCenter: true` as well for layout purposes.

- [ ] **Step 3: Update MobileBottomNav.tsx — render DonnyNavButton for center item**

Open `src/components/MobileBottomNav.tsx`. Import `DonnyNavButton` and `DonnyChatSheet`. Add state for the chat sheet. When rendering nav items, check if the item has `isDonny: true` — if so, render `<DonnyNavButton onClick={() => setDonnyChatOpen(true)} />` instead of the normal nav link. Add `<DonnyChatSheet open={donnyChatOpen} onOpenChange={setDonnyChatOpen} />` at the end of the component.

Key changes to the component:

```typescript
import { useState } from 'react';
import { DonnyNavButton } from './donny/DonnyNavButton';
import { DonnyChatSheet } from './donny/DonnyChatSheet';

// Inside the component:
const [donnyChatOpen, setDonnyChatOpen] = useState(false);
const [initialMessage, setInitialMessage] = useState<string | undefined>();

// In the render, for the center item:
// if (item.isDonny) {
//   return <DonnyNavButton key="donny" onClick={() => setDonnyChatOpen(true)} />;
// }

// At the end of the component JSX:
// <DonnyChatSheet open={donnyChatOpen} onOpenChange={setDonnyChatOpen} initialMessage={initialMessage} />
```

- [ ] **Step 4: Verify the bottom nav renders Donny**

Run: `cd C:/Users/dwill/Desktop/dragoncandy-v2 && npm run dev`

Open the app on mobile viewport. Confirm:
- The center nav button shows 🐉 with "Donny" label
- Tapping it opens the chat sheet
- Chat sheet shows welcome message
- Quick chips are visible and role-appropriate

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/DonnyNavButton.tsx src/components/MobileBottomNav.tsx src/lib/navConfig.ts
git commit -m "feat(donny): integrate DonnyNavButton into bottom nav, replace center + button"
```

---

## Task 11: Integrate DonnyCard into Dashboard Pages

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`
- Modify: `src/pages/CreatorDashboard.tsx`
- Modify: `src/pages/BrandDashboard.tsx`

- [ ] **Step 1: Add DonnyCard to BusinessDashboard**

Open `src/pages/BusinessDashboard.tsx`. Import `DonnyCard` from `@/components/donny/DonnyCard`. You need a way to open the chat sheet from the card. Since the chat sheet lives in `MobileBottomNav`, use a custom event or a shared state approach.

Simplest approach: dispatch a custom event that `MobileBottomNav` listens for.

Add at the top of the dashboard's rendered content (inside the main content area, before existing cards):

```typescript
import { DonnyCard } from '@/components/donny/DonnyCard';

// In the render:
<DonnyCard
  onOpenChat={(message) => {
    window.dispatchEvent(
      new CustomEvent('donny-open-chat', { detail: { message } })
    );
  }}
/>
```

- [ ] **Step 2: Update MobileBottomNav to listen for the custom event**

In `MobileBottomNav.tsx`, add an effect that listens for `donny-open-chat`:

```typescript
useEffect(() => {
  const handler = (e: CustomEvent<{ message?: string }>) => {
    setInitialMessage(e.detail?.message);
    setDonnyChatOpen(true);
  };
  window.addEventListener('donny-open-chat', handler as EventListener);
  return () => window.removeEventListener('donny-open-chat', handler as EventListener);
}, []);
```

- [ ] **Step 3: Add DonnyCard to CreatorDashboard and BrandDashboard**

Repeat the same pattern: import `DonnyCard` and add it at the top of each dashboard's content area with the same `onOpenChat` handler dispatching `donny-open-chat`.

- [ ] **Step 4: Verify dashboard cards**

Run: `npm run dev`

Navigate to each dashboard (business, creator, brand). Confirm:
- DonnyCard appears at top with contextual suggestion
- "Show me" button opens chat sheet
- "Later" button dismisses the card

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusinessDashboard.tsx src/pages/CreatorDashboard.tsx src/pages/BrandDashboard.tsx src/components/MobileBottomNav.tsx
git commit -m "feat(donny): add DonnyCard to all dashboard pages with chat sheet integration"
```

---

## Task 12: donny-chat Edge Function

**Files:**
- Create: `supabase/functions/donny-chat/index.ts`

- [ ] **Step 1: Build the edge function**

This is the backend brain — loads context, calls GPT-4o with all 18 spec tools, executes tool calls, enforces rate limiting, manages context window summarization, and saves messages. Note: v1 uses request/response (not token streaming) for simplicity — streaming can be added in a follow-up by using `stream: true` on the OpenAI call and forwarding SSE chunks to the client. The Realtime subscription on `donny_messages` ensures the client still gets live updates when messages are saved.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// All 18 tool definitions from the spec
const TOOL_DEFINITIONS = [
  // --- Campaign Tools ---
  {
    type: "function",
    function: {
      name: "create_campaign",
      description: "Create a new campaign for the business. Requires title, description, platform, and budget range.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Campaign title" },
          description: { type: "string", description: "Campaign brief/description" },
          platform: { type: "string", description: "Target platform" },
          budget_min: { type: "number", description: "Minimum budget" },
          budget_max: { type: "number", description: "Maximum budget" },
          content_type: { type: "string", description: "Type of content needed" },
        },
        required: ["title", "description", "platform", "budget_min", "budget_max"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaigns",
      description: "Get the user's campaigns with their status and application counts.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_campaign",
      description: "Update an existing campaign's details (title, description, budget, status).",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID" },
          title: { type: "string", description: "New title" },
          description: { type: "string", description: "New description" },
          budget_min: { type: "number", description: "New minimum budget" },
          budget_max: { type: "number", description: "New maximum budget" },
          status: { type: "string", description: "New status (draft, published, closed)" },
        },
        required: ["campaign_id"],
      },
    },
  },
  // --- Creator Discovery Tools ---
  {
    type: "function",
    function: {
      name: "search_creators",
      description: "Search for content creators matching criteria. Returns a list of creator profiles.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", description: "Social media platform (tiktok, instagram, youtube)" },
          niche: { type: "string", description: "Content niche (food, fashion, tech, fitness, lifestyle)" },
          budget_max: { type: "number", description: "Maximum budget per content piece" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_creator_profile",
      description: "Get detailed profile for a specific creator including bio, portfolio, rates, and reviews.",
      parameters: {
        type: "object",
        properties: {
          creator_id: { type: "string", description: "Creator's user UUID" },
        },
        required: ["creator_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "invite_creator",
      description: "Send a campaign invitation to a specific creator.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID" },
          creator_id: { type: "string", description: "Creator's user UUID" },
          message: { type: "string", description: "Optional invitation message" },
        },
        required: ["campaign_id", "creator_id"],
      },
    },
  },
  // --- Application Tools ---
  {
    type: "function",
    function: {
      name: "get_applications",
      description: "Get pending applications for a specific campaign.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID" },
        },
        required: ["campaign_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_to_campaign",
      description: "Submit an application to a campaign on behalf of the creator.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID to apply to" },
          pitch: { type: "string", description: "Application pitch message" },
          proposed_rate: { type: "number", description: "Proposed rate for the work" },
        },
        required: ["campaign_id", "pitch", "proposed_rate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "respond_to_application",
      description: "Accept or reject a campaign application.",
      parameters: {
        type: "object",
        properties: {
          application_id: { type: "string", description: "Application UUID" },
          action: { type: "string", enum: ["accept", "reject"], description: "Accept or reject" },
          message: { type: "string", description: "Optional response message" },
        },
        required: ["application_id", "action"],
      },
    },
  },
  // --- Content Tools ---
  {
    type: "function",
    function: {
      name: "get_submissions",
      description: "Get content submissions for a collaboration.",
      parameters: {
        type: "object",
        properties: {
          collaboration_id: { type: "string", description: "Collaboration UUID" },
        },
        required: ["collaboration_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_content",
      description: "Approve a content submission.",
      parameters: {
        type: "object",
        properties: {
          submission_id: { type: "string", description: "File upload UUID" },
        },
        required: ["submission_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_revision",
      description: "Request changes to a content submission with feedback.",
      parameters: {
        type: "object",
        properties: {
          submission_id: { type: "string", description: "File upload UUID" },
          feedback: { type: "string", description: "Revision feedback" },
        },
        required: ["submission_id", "feedback"],
      },
    },
  },
  // --- Payment Tools ---
  {
    type: "function",
    function: {
      name: "prepare_payment",
      description: "Prepare payment details for a collaboration. Returns a payment summary with a confirmation URL. Does NOT execute the payment.",
      parameters: {
        type: "object",
        properties: {
          collaboration_id: { type: "string", description: "Collaboration UUID" },
        },
        required: ["collaboration_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_status",
      description: "Check the payment status for a collaboration.",
      parameters: {
        type: "object",
        properties: {
          collaboration_id: { type: "string", description: "Collaboration UUID" },
        },
        required: ["collaboration_id"],
      },
    },
  },
  // --- Profile Tools ---
  {
    type: "function",
    function: {
      name: "update_profile",
      description: "Update the user's profile fields (full_name, bio, avatar_url, etc.).",
      parameters: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "Display name" },
          bio: { type: "string", description: "Profile bio" },
          business_name: { type: "string", description: "Business name (business users)" },
          location: { type: "string", description: "Location" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Get an overview of the user's current activity — campaigns, collaborations, pending items.",
      parameters: { type: "object", properties: {} },
    },
  },
  // --- Onboarding Tools ---
  {
    type: "function",
    function: {
      name: "get_onboarding_step",
      description: "Get the user's current onboarding progress and what step they need to complete next.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_onboarding_step",
      description: "Save an onboarding answer and advance to the next step. Used during Donny-guided onboarding.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", description: "Profile field being set (business_name, platforms, niche, budget_range, automation_level)" },
          value: { type: "string", description: "The user's answer" },
        },
        required: ["field", "value"],
      },
    },
  },
];

// Build system prompt with user context
function buildSystemPrompt(profile: any, context: any): string {
  return `You are Donny, DragonCandy's friendly AI assistant 🐉

## Personality
- Friendly, casual, warm — like texting a helpful friend
- Use emojis naturally but not excessively (1-2 per message)
- Always suggest a next step or action
- Never fabricate data — if you don't know, say so
- Keep responses concise — this is a mobile chat, not an essay

## User Context
- Name: ${profile.full_name || 'there'}
- Role: ${profile.role}
- ${profile.role === 'business_client' || profile.role === 'brand'
    ? `Business: ${profile.business_name || 'Not set up yet'}`
    : `Creator: ${profile.creator_name || 'Not set up yet'}`
  }
- Active campaigns: ${context.campaigns?.length ?? 0}
- Pending applications: ${context.pendingApplications ?? 0}

## Rules
- For payments: ALWAYS use prepare_payment and tell the user to confirm on the payment screen. NEVER claim a payment was processed directly.
- When showing creators: include name, platform, niche, rating, and project count.
- When showing campaigns: include title, platform, budget, and application count.
- If a tool fails: explain the error conversationally and suggest how to fix it.
- Use tools proactively — if the user asks about campaigns, call get_campaigns. Don't just describe what you could do.
- When you call a tool that returns data, present it conversationally. For creator profiles and campaign summaries, include a rich_card in your response.

## Rich Cards
When presenting creators or campaigns from tool results, add a JSON object in your response metadata (the system will extract it). Format:
- Creator: { "type": "creator_profile", "data": { "id": "...", "name": "...", ... } }
- Campaign: { "type": "campaign_summary", "data": { "id": "...", "title": "...", ... } }
- Payment: { "type": "payment_confirmation", "data": { "collaboration_id": "...", "amount": ..., ... } }
`;
}

// Rate limiting: check message count in the last hour
async function checkRateLimit(userId: string, supabaseAdmin: any): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneHourAgo)
    .in("conversation_id",
      supabaseAdmin.from("donny_conversations").select("id").eq("user_id", userId)
    );

  if (error) return true; // Allow on error — fail open
  return (count ?? 0) < 30;
}

// Context window management: summarize old messages when > 20 exist
async function getConversationHistory(
  conversationId: string,
  supabaseAdmin: any
): Promise<{ messages: any[]; contextSummary: string | null }> {
  // Get total message count
  const { count } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  // Load existing context summary
  const { data: conversation } = await supabaseAdmin
    .from("donny_conversations")
    .select("context_snapshot")
    .eq("id", conversationId)
    .single();

  const contextSummary = conversation?.context_snapshot?.summary ?? null;

  // Always load last 20 messages
  const { data: history } = await supabaseAdmin
    .from("donny_messages")
    .select("role, content, tool_calls, tool_result")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .range(Math.max(0, (count ?? 0) - 20), (count ?? 0));

  return { messages: history ?? [], contextSummary };
}

// After GPT-4o response, if message count > 25 — summarize older messages
async function maybeUpdateContextSummary(
  conversationId: string,
  supabaseAdmin: any,
  openaiApiKey: string
): Promise<void> {
  const { count } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if ((count ?? 0) <= 25) return;

  // Load oldest messages (beyond the last 20)
  const keepCount = 20;
  const summarizeCount = (count ?? 0) - keepCount;
  const { data: oldMessages } = await supabaseAdmin
    .from("donny_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(summarizeCount);

  if (!oldMessages || oldMessages.length === 0) return;

  const summaryText = oldMessages
    .filter((m: any) => m.content && m.role !== "tool")
    .map((m: any) => `${m.role}: ${m.content}`)
    .join("\n");

  // Ask GPT-4o to summarize
  const summaryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Summarize this conversation history into a concise paragraph. Focus on key decisions, actions taken, and user preferences. This summary will be used as context for future messages.",
        },
        { role: "user", content: summaryText },
      ],
      max_tokens: 300,
    }),
  });

  const summaryResult = await summaryResponse.json();
  const summary = summaryResult.choices?.[0]?.message?.content ?? "";

  // Save summary to conversation
  await supabaseAdmin
    .from("donny_conversations")
    .update({ context_snapshot: { summary, updated_at: new Date().toISOString() } })
    .eq("id", conversationId);
}

// Execute a tool call against Supabase — all 18 tools from the spec
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  supabaseAdmin: any
): Promise<{ result: any }> {
  switch (toolName) {
    // --- Campaign Tools ---
    case "create_campaign": {
      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .insert({
          user_id: userId,
          title: args.title,
          description: args.description,
          platform: args.platform,
          budget_min: args.budget_min,
          budget_max: args.budget_max,
          content_type: args.content_type ?? "video",
          status: "draft",
        })
        .select("id, title, status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "get_campaigns": {
      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .select("id, title, status, platform, budget_min, budget_max, created_at, campaign_applications(count)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return { result: data };
    }

    case "update_campaign": {
      const updates: Record<string, any> = {};
      if (args.title) updates.title = args.title;
      if (args.description) updates.description = args.description;
      if (args.budget_min) updates.budget_min = args.budget_min;
      if (args.budget_max) updates.budget_max = args.budget_max;
      if (args.status) updates.status = args.status;

      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .update(updates)
        .eq("id", args.campaign_id)
        .eq("user_id", userId) // Ensure ownership
        .select("id, title, status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    // --- Creator Discovery Tools ---
    case "search_creators": {
      let query = supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, profiles!inner(full_name, avatar_url), specialty, platforms, rating, completed_projects")
        .limit(5);
      if (args.niche) query = query.ilike("specialty", `%${args.niche}%`);
      const { data, error } = await query;
      if (error) throw error;
      return {
        result: (data ?? []).map((c: any) => ({
          id: c.user_id,
          name: c.profiles?.full_name ?? "Unknown",
          avatar_url: c.profiles?.avatar_url,
          platforms: c.platforms ?? [],
          niche: c.specialty ?? "General",
          rating: c.rating ?? 0,
          project_count: c.completed_projects ?? 0,
        })),
      };
    }

    case "get_creator_profile": {
      const { data, error } = await supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, profiles!inner(full_name, avatar_url, bio), specialty, platforms, rating, completed_projects, hourly_rate, portfolio_url")
        .eq("user_id", args.creator_id)
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "invite_creator": {
      const { data, error } = await supabaseAdmin
        .from("campaign_invitations")
        .insert({
          campaign_id: args.campaign_id,
          creator_id: args.creator_id,
          invited_by: userId,
          message: args.message ?? null,
          status: "pending",
        })
        .select("id, status")
        .single();
      if (error) throw error;
      return { result: { id: data.id, status: "invitation_sent" } };
    }

    // --- Application Tools ---
    case "get_applications": {
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .select("id, status, pitch, proposed_rate, applicant_id, profiles!inner(full_name, avatar_url)")
        .eq("campaign_id", args.campaign_id)
        .eq("status", "pending");
      if (error) throw error;
      return { result: data };
    }

    case "apply_to_campaign": {
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .insert({
          campaign_id: args.campaign_id,
          applicant_id: userId,
          pitch: args.pitch,
          proposed_rate: args.proposed_rate,
          status: "pending",
        })
        .select("id, status")
        .single();
      if (error) throw error;
      return { result: { id: data.id, status: "submitted" } };
    }

    case "respond_to_application": {
      const newStatus = args.action === "accept" ? "accepted" : "rejected";
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .update({ status: newStatus })
        .eq("id", args.application_id)
        .select("id, status, campaign_id")
        .single();
      if (error) throw error;

      // If accepted, create a collaboration
      if (args.action === "accept" && data) {
        const { data: app } = await supabaseAdmin
          .from("campaign_applications")
          .select("applicant_id, proposed_rate, campaign_id")
          .eq("id", args.application_id)
          .single();

        if (app) {
          await supabaseAdmin.from("campaign_collaborations").insert({
            campaign_id: app.campaign_id,
            creator_id: app.applicant_id,
            agreed_rate: app.proposed_rate,
            status: "active",
          });
        }
      }
      return { result: { id: data.id, status: newStatus } };
    }

    // --- Content Tools ---
    case "get_submissions": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .select("id, file_name, file_url, status, created_at, uploader_id, profiles!inner(full_name)")
        .eq("collaboration_id", args.collaboration_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { result: data };
    }

    case "approve_content": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .update({ status: "approved" })
        .eq("id", args.submission_id)
        .select("id, file_name, status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "request_revision": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .update({ status: "revision_requested" })
        .eq("id", args.submission_id)
        .select("id, file_name, status")
        .single();
      if (error) throw error;

      // Add feedback as a file comment
      await supabaseAdmin.from("file_comments").insert({
        file_id: args.submission_id,
        user_id: userId,
        content: args.feedback,
      });
      return { result: { id: data.id, status: "revision_requested", feedback: args.feedback } };
    }

    // --- Payment Tools ---
    case "prepare_payment": {
      const { data, error } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, agreed_rate, creator_id, profiles!inner(full_name), campaigns!inner(title)")
        .eq("id", args.collaboration_id)
        .single();
      if (error) throw error;
      return {
        result: {
          collaboration_id: data.id,
          amount: data.agreed_rate,
          recipient_name: data.profiles?.full_name,
          campaign_title: data.campaigns?.title,
          payment_url: `/dashboard/business/payments/${data.id}`,
        },
      };
    }

    case "get_payment_status": {
      const { data, error } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, agreed_rate, payment_status, campaigns!inner(title), profiles!inner(full_name)")
        .eq("id", args.collaboration_id)
        .single();
      if (error) throw error;
      return { result: data };
    }

    // --- Profile Tools ---
    case "update_profile": {
      const updates: Record<string, any> = {};
      if (args.full_name) updates.full_name = args.full_name;
      if (args.bio) updates.bio = args.bio;
      if (args.business_name) updates.business_name = args.business_name;
      if (args.location) updates.location = args.location;

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select("id, full_name, bio, business_name, location")
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "get_dashboard_summary": {
      const [campaignsRes, collabsRes, appsRes] = await Promise.all([
        supabaseAdmin
          .from("campaigns")
          .select("id, title, status")
          .eq("user_id", userId)
          .limit(5),
        supabaseAdmin
          .from("campaign_collaborations")
          .select("id, status, campaigns!inner(title)")
          .or(`creator_id.eq.${userId}`)
          .limit(10),
        supabaseAdmin
          .from("campaign_applications")
          .select("id, status")
          .eq("applicant_id", userId)
          .eq("status", "pending"),
      ]);
      return {
        result: {
          campaigns: campaignsRes.data ?? [],
          collaborations: collabsRes.data ?? [],
          pending_applications: appsRes.data?.length ?? 0,
        },
      };
    }

    // --- Onboarding Tools ---
    case "get_onboarding_step": {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, full_name, business_name")
        .eq("id", userId)
        .single();

      // Determine which onboarding fields are still empty
      const isBusiness = profile?.role === "business_client" || profile?.role === "brand";
      const steps = isBusiness
        ? [
            { field: "business_name", label: "Business name", completed: !!profile?.business_name },
            { field: "content_type", label: "Content type", completed: false }, // Check via campaigns
            { field: "budget_range", label: "Budget range", completed: false },
            { field: "logo", label: "Logo upload", completed: false },
          ]
        : [
            { field: "platforms", label: "Platforms", completed: false },
            { field: "niche", label: "Niche/specialty", completed: false },
            { field: "portfolio_url", label: "Portfolio link", completed: false },
            { field: "automation_level", label: "Automation preference", completed: false },
          ];

      const nextStep = steps.find((s) => !s.completed);
      return {
        result: {
          role: profile?.role,
          steps,
          current_step: nextStep ?? null,
          is_complete: !nextStep,
        },
      };
    }

    case "complete_onboarding_step": {
      // Save the onboarding answer to the appropriate table
      const field = args.field;
      const value = args.value;

      if (field === "business_name" || field === "full_name" || field === "bio" || field === "location") {
        await supabaseAdmin.from("profiles").update({ [field]: value }).eq("id", userId);
      } else if (field === "automation_level") {
        // Upsert creator automation preferences
        await supabaseAdmin.from("creator_automation_preferences").upsert({
          user_id: userId,
          automation_level: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } else if (field === "platforms" || field === "niche" || field === "portfolio_url") {
        const updateField = field === "niche" ? "specialty" : field;
        await supabaseAdmin.from("creator_profiles").update({ [updateField]: value }).eq("user_id", userId);
      }

      return { result: { field, saved: true } };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    // Create Supabase clients
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { conversation_id, message } = await req.json();

    // Rate limiting: max 30 user messages per hour
    const withinLimit = await checkRateLimit(user.id, supabaseAdmin);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({ error: "You've sent too many messages. Please wait a bit before trying again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name, email, avatar_url, business_name, bio, location")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Profile not found");

    // Load user context for system prompt
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, title, status")
      .eq("user_id", user.id)
      .eq("status", "published")
      .limit(10);

    const { data: pendingApps } = await supabaseAdmin
      .from("campaign_applications")
      .select("id")
      .eq("applicant_id", user.id)
      .eq("status", "pending");

    const context = {
      campaigns: campaigns ?? [],
      pendingApplications: pendingApps?.length ?? 0,
    };

    // Load conversation history with context window management
    const { messages: history, contextSummary } = await getConversationHistory(
      conversation_id,
      supabaseAdmin
    );

    // Build messages array for GPT-4o
    const systemPrompt = buildSystemPrompt(profile, context);
    const gptMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Include context summary from older messages if available
    if (contextSummary) {
      gptMessages.push({
        role: "system",
        content: `Previous conversation summary: ${contextSummary}`,
      });
    }

    // Add recent history (last 20 messages)
    for (const msg of history) {
      if (msg.role === "tool" && msg.tool_result) {
        gptMessages.push({
          role: "tool",
          content: JSON.stringify(msg.tool_result),
          tool_call_id: msg.content, // We store tool_call_id in content for tool messages
        });
      } else if (msg.role === "assistant" && msg.tool_calls) {
        gptMessages.push({
          role: "assistant",
          content: msg.content,
          tool_calls: msg.tool_calls,
        });
      } else {
        gptMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current user message
    gptMessages.push({ role: "user", content: message });

    // Call GPT-4o
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: gptMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      }),
    });

    let result = await response.json();
    let assistantMessage = result.choices[0].message;

    // Tool execution loop — GPT-4o may call multiple tools
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Save assistant message with tool calls
      const { data: savedAssistantMsg } = await supabaseAdmin
        .from("donny_messages")
        .insert({
          conversation_id,
          role: "assistant",
          content: assistantMessage.content,
          tool_calls: assistantMessage.tool_calls,
        })
        .select()
        .single();

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult: any;
        let status = "success";

        try {
          const execution = await executeTool(toolCall.function.name, args, user.id, supabaseAdmin);
          toolResult = execution.result;
        } catch (err) {
          toolResult = { error: err.message };
          status = "error";
        }

        // Log tool execution
        await supabaseAdmin.from("donny_tool_executions").insert({
          message_id: savedAssistantMsg?.id,
          user_id: user.id,
          tool_name: toolCall.function.name,
          input: args,
          output: toolResult,
          status,
        });

        // Save tool result as message
        await supabaseAdmin.from("donny_messages").insert({
          conversation_id,
          role: "tool",
          content: toolCall.id, // Store tool_call_id for history reconstruction
          tool_result: toolResult,
        });

        // Add to GPT messages for next call
        gptMessages.push(assistantMessage);
        gptMessages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
        });
      }

      // Call GPT-4o again with tool results
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: gptMessages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
        }),
      });

      result = await response.json();
      assistantMessage = result.choices[0].message;
    }

    // Save final assistant response
    // Try to extract rich_card from response if present
    let richCard = null;
    const richCardMatch = assistantMessage.content?.match(/```json\n(\{[\s\S]*?"type":\s*"(creator_profile|campaign_summary|payment_confirmation)"[\s\S]*?\})\n```/);
    if (richCardMatch) {
      try {
        richCard = JSON.parse(richCardMatch[1]);
        // Remove the JSON block from display content
        assistantMessage.content = assistantMessage.content.replace(richCardMatch[0], "").trim();
      } catch {
        // Ignore parse errors — just show as text
      }
    }

    await supabaseAdmin.from("donny_messages").insert({
      conversation_id,
      role: "assistant",
      content: assistantMessage.content,
      rich_card: richCard,
    });

    // Update conversation last_message_at
    await supabaseAdmin
      .from("donny_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    // Context window management: summarize older messages if needed (async, non-blocking)
    maybeUpdateContextSummary(conversation_id, supabaseAdmin, OPENAI_API_KEY!).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, content: assistantMessage.content, rich_card: richCard }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Set the OPENAI_API_KEY secret in Supabase**

Run: `npx supabase secrets set OPENAI_API_KEY=<your-openai-api-key>`

Or set it via Supabase Dashboard → Settings → Edge Functions → Secrets.

- [ ] **Step 3: Deploy the edge function**

Run: `npx supabase functions deploy donny-chat`

Verify: Function appears in Supabase Dashboard → Edge Functions.

- [ ] **Step 4: Test end-to-end**

Open the app, tap the 🐉 button, send "Hi Donny!" — Donny should respond with a greeting. Try "Show me my campaigns" — Donny should call the `get_campaigns` tool and show results.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat(donny): add donny-chat edge function with GPT-4o function-calling and tool execution"
```

---

## Task 13: Build Verification and Lint Check

**Files:** None new — this is a verification task.

- [ ] **Step 1: Run the build**

Run: `cd C:/Users/dwill/Desktop/dragoncandy-v2 && npm run build`

Expected: Build completes with no TypeScript errors. Fix any type errors that arise.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: No new lint errors. Fix any issues.

- [ ] **Step 3: Manual smoke test**

Open `npm run dev` and test the full flow:
1. Open app → dashboard shows DonnyCard with contextual suggestion
2. Tap "Show me" on DonnyCard → chat sheet opens with initial message sent
3. Tap 🐉 in bottom nav → chat sheet opens with welcome message
4. Send "Hi" → Donny responds with friendly greeting
5. Send "Create a campaign for my bakery" → Donny asks clarifying questions
6. Quick chips are visible and tappable
7. DonnyAvatar animates (thinking while waiting, idle after response)
8. Close chat sheet → can reopen and see conversation history

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(donny): resolve build errors and lint issues from Donny integration"
```

---

## Summary

| Task | What it builds | Key files |
|------|---------------|-----------|
| 1 | Database tables + RLS | `supabase/migrations/20260323_donny_tables.sql` |
| 2 | TypeScript types | `src/types/donny.ts` |
| 3 | Animated avatar | `src/components/donny/DonnyAvatar.tsx` |
| 4 | Message + rich cards | `DonnyMessage.tsx`, `DonnyRichCard.tsx` |
| 5 | Quick chips + typing dots | `DonnyQuickChips.tsx`, `DonnyTypingIndicator.tsx` |
| 6 | Core chat hook | `src/hooks/useDonny.ts` |
| 7 | Dashboard suggestion hook | `src/hooks/useDonnyDashboard.ts` |
| 8 | Dashboard card | `src/components/donny/DonnyCard.tsx` |
| 9 | Chat sheet UI | `src/components/donny/DonnyChatSheet.tsx` |
| 10 | Bottom nav integration | `DonnyNavButton.tsx`, `MobileBottomNav.tsx`, `navConfig.ts` |
| 11 | Dashboard integration | All 3 dashboard pages |
| 12 | Edge function (backend brain) | `supabase/functions/donny-chat/index.ts` |
| 13 | Build verification | N/A |
