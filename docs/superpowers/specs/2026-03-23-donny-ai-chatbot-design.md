# Donny — DragonCandy AI Chatbot Design Spec

## Overview

Donny is DragonCandy's AI-powered concierge chatbot — the primary interface through which businesses and creators interact with the platform. Donny handles onboarding, campaign creation, creator matching, content delivery, payments, and general Q&A through a friendly, casual conversational experience.

Donny is accessible on every page of the mobile app via a prominent 🐉 button in the bottom navigation center, plus a proactive suggestion card on the dashboard.

## Goals

- Make the app feel effortless — users talk to Donny instead of navigating complex UI
- Reduce time-to-action for both businesses (posting campaigns, hiring creators) and creators (finding work, getting paid)
- Provide a warm, branded experience that makes DragonCandy feel alive and differentiated

## Non-Goals

- Donny does not replace all UI — profile editing, settings, and browsing still use standard screens
- Donny does not execute payments directly — it prepares payments and redirects to a confirmation screen
- Donny does not replace user-to-user messaging — the existing messaging system stays for direct creator-business communication

---

## Personality

- **Tone:** Friendly, casual, warm — like texting a helpful friend
- **Uses emojis naturally** but not excessively
- **Proactive:** Donny surfaces relevant information without being asked ("You got 3 new applications!")
- **Honest:** Never fabricates data — if Donny doesn't know, it says so and offers to help find out
- **Action-oriented:** Donny always suggests a next step

---

## Architecture

### Approach: Edge Function Agent

Donny runs as a Supabase Edge Function (`donny-chat`) that wraps OpenAI GPT-4o with function-calling.

**Request flow:**

1. Client sends user message via POST to `donny-chat` edge function
2. Edge function loads user context from Supabase (profile, active campaigns, collaborations, last 20 Donny messages)
3. Builds system prompt with Donny's personality, user context, and tool definitions
4. Calls GPT-4o with function-calling enabled
5. Streams response tokens to client via Supabase Realtime channel (`donny:{user_id}`)
6. If GPT-4o returns tool calls, executes them against Supabase, logs to `donny_tool_executions`, sends results back to GPT-4o, and continues streaming
7. Saves all messages and tool executions to database

**Why GPT-4o:** Already integrated in the stack (edge functions reference it), excellent conversational quality, fast response times, and strong function-calling support critical for Donny's tool execution.

### Context Loading

Each request fetches:
- User profile (role, name, business/creator details)
- Active campaigns (limit 10, most recent)
- Recent collaborations and their status
- Last 20 Donny messages for conversation continuity

Bundled into one optimized Supabase query.

### Context Window Management

- Keep last 20 messages in conversation history sent to GPT-4o
- Older messages are summarized by GPT-4o into a compact summary stored on the `donny_conversations.context_snapshot` field
- Summary is refreshed when messages exceed the 20-message window

### Streaming

- Edge function streams GPT-4o response to a Supabase Realtime channel (`donny:{user_id}`)
- Client subscribes to the channel on mount via the `useDonny()` hook
- Tokens rendered as they arrive for a live chat feel

### Error Handling

- If a tool execution fails, the error is sent back to GPT-4o, which explains it conversationally ("Hmm, I couldn't create that campaign — looks like you need to finish setting up your business profile first")
- Edge function timeout: 10 minutes max (Supabase limit)
- Cold start mitigation: warm-up strategy for frequently used functions

### Rate Limiting

- Max 30 Donny messages per user per hour to prevent abuse

---

## Tools (Function Definitions)

GPT-4o function-calling maps to Supabase operations. Each tool is a defined function the model can invoke.

### Campaign Tools
| Tool | Purpose | Triggered By |
|---|---|---|
| `create_campaign` | Create a new campaign from conversational details | "I need content for my restaurant" |
| `get_campaigns` | List user's campaigns with status | "Show me my campaigns" |
| `update_campaign` | Modify campaign details | "Change the budget to $500" |

### Creator Discovery Tools
| Tool | Purpose | Triggered By |
|---|---|---|
| `search_creators` | Find creators matching criteria | "Find me a TikTok food creator" |
| `get_creator_profile` | Get detailed creator info | "Tell me more about Sarah" |
| `invite_creator` | Send campaign invite to a creator | "Invite her to my campaign" |

### Application Tools
| Tool | Purpose | Triggered By |
|---|---|---|
| `get_applications` | List applications for a campaign | "Show me who applied" |
| `apply_to_campaign` | Submit application on creator's behalf | "Apply to this campaign" |
| `respond_to_application` | Accept/reject an application | "Accept Sarah's application" |

### Content Tools
| Tool | Purpose | Triggered By |
|---|---|---|
| `get_submissions` | List content submissions for a collaboration | "Show me what Sarah submitted" |
| `approve_content` | Approve submitted content | "Looks great, approve it" |
| `request_revision` | Request changes to submitted content | "Ask her to redo the intro" |

### Payment Tools
| Tool | Purpose | Triggered By |
|---|---|---|
| `prepare_payment` | Prepare payment details and redirect to payment screen | "Pay Sarah for the TikTok" |
| `get_payment_status` | Check payment status | "Did Sarah get paid?" |

### Profile Tools
| Tool | Purpose | Triggered By |
|---|---|---|
| `update_profile` | Update user profile fields | "Update my bio" |
| `get_dashboard_summary` | Get overview of user's current state | Opening the app / "What's new?" |

### Onboarding Tools
| Tool | Purpose | Triggered By |
|---|---|---|
| `get_onboarding_step` | Get current onboarding progress | New user first interaction |
| `complete_onboarding_step` | Save onboarding answer and advance | User answers an onboarding question |

---

## UI Components

### 1. Dashboard Donny Card

- Position: top of dashboard, above all other content
- Style: teal gradient card (`linear-gradient(135deg, #4DD9C0, #00E5CC)`)
- Contains: animated Donny avatar (left), proactive message (right), quick action buttons
- Content is dynamic — shows the most relevant action item for the user (new applications, pending reviews, campaign suggestions)
- Two buttons: primary action ("Show me") and dismiss ("Later")

### 2. Bottom Nav 🐉 Button

- Replaces the current center `+` button in the bottom navigation
- Style: teal gradient circle, larger than other nav icons, elevated with shadow, white border
- Label: "Donny" below the icon
- Notification badge: appears when Donny has proactive updates
- Present on every page of the app
- Tap opens the Donny Chat Sheet

### 3. Donny Chat Sheet

- Opens as a slide-up sheet from the bottom nav button
- Header: Donny avatar + name + status ("Always here for you") + close button
- Message bubbles: pink (Donny/inbound, `#F9A8D4`) and teal (user/outbound, `#4DD9C0`) — matches existing DragonCandy messaging style
- Rich cards: Donny can render inline cards within the chat (creator profiles with action buttons, campaign summaries, payment confirmations)
- Quick action chips: persistent row above input bar with contextual suggestions ("Create Campaign", "Find Creators", "My Projects")
- Input bar: matches existing messaging UI — text input + attachment button + send button

---

## Animated Avatar

### v1: CSS-Animated Emoji

Ship with a stylized 🐉 emoji inside a teal gradient circle, animated with CSS transitions. Build the `DonnyAvatar` component with a `state` prop so the animation layer is swappable.

### v2 (Future): Lottie Animations

Upgrade to designed Lottie animations when a character is created by a designer. The component API stays the same — only the rendering layer changes.

### Avatar States

| State | Visual | Trigger |
|---|---|---|
| **Idle / Listening** | Gentle breathing pulse | Default state, waiting for input |
| **Thinking** | Pulsing glow + typing dots | After user sends message, before response streams |
| **Celebrating** | Bounce + confetti effect | Campaign posted, payment released, content approved |
| **Error / Sorry** | Pink tint + slight shake | Tool execution failure, validation error |
| **Action Needed** | Yellow glow + notification badge | Proactive alert on dashboard card and nav button |

---

## Data Model

### New Tables

#### `donny_conversations`
| Column | Type | Purpose |
|---|---|---|
| `id` | uuid (PK) | Primary key |
| `user_id` | uuid (FK → profiles) | Owner of this conversation |
| `created_at` | timestamptz | When conversation started |
| `last_message_at` | timestamptz | For sorting / dashboard card freshness |
| `context_snapshot` | jsonb | Cached user context and older message summary |

#### `donny_messages`
| Column | Type | Purpose |
|---|---|---|
| `id` | uuid (PK) | Primary key |
| `conversation_id` | uuid (FK → donny_conversations) | Parent conversation |
| `role` | text | `user`, `assistant`, or `tool` |
| `content` | text | Message text |
| `tool_calls` | jsonb | GPT-4o function calls (if role=assistant) |
| `tool_result` | jsonb | Tool execution result (if role=tool) |
| `rich_card` | jsonb | Structured data for inline rich cards |
| `created_at` | timestamptz | Ordering |

#### `donny_tool_executions`
| Column | Type | Purpose |
|---|---|---|
| `id` | uuid (PK) | Primary key |
| `message_id` | uuid (FK → donny_messages) | Which message triggered this |
| `user_id` | uuid (FK → profiles) | Who it was executed for |
| `tool_name` | text | Function name (e.g., `create_campaign`) |
| `input` | jsonb | Arguments passed to the tool |
| `output` | jsonb | Result returned |
| `status` | text | `success`, `error`, `pending` |
| `created_at` | timestamptz | Audit trail |

#### `creator_automation_preferences`
| Column | Type | Purpose |
|---|---|---|
| `id` | uuid (PK) | Primary key |
| `user_id` | uuid (FK → profiles) | Creator |
| `automation_level` | text | `notify`, `suggest`, `auto_pilot` |
| `auto_apply_criteria` | jsonb | Filters for auto-pilot (budget min, niches, platforms) |
| `updated_at` | timestamptz | Last changed |

### Existing Tables

No existing tables are modified. Donny reads from `profiles`, `campaigns`, `campaign_applications`, `campaign_collaborations`, `file_uploads`, and other existing tables. All Donny-specific state lives in the new tables.

### RLS Policies

All new tables have Row Level Security enabled. Users can only read/write their own Donny data:
- `donny_conversations`: `user_id = auth.uid()`
- `donny_messages`: via conversation ownership
- `donny_tool_executions`: `user_id = auth.uid()`
- `creator_automation_preferences`: `user_id = auth.uid()`

---

## Onboarding Flow

Donny replaces the traditional form-based onboarding wizard. New users are greeted by Donny in the chat sheet immediately after signup.

### Business Onboarding (4 steps)

1. **Business name** — free text
2. **Content type** — quick-reply chips (TikTok, Instagram Reels, YouTube Shorts, Photos, All)
3. **Budget range** — quick-reply chips ($50-100, $100-250, $250-500, $500+, Not sure)
4. **Logo upload** — file upload inline in chat

Completion: Donny creates the business profile and presents quick actions ("Create my first campaign", "Browse creators", "Just explore").

### Creator Onboarding (4 steps)

1. **Platforms** — quick-reply chips (TikTok, Instagram, YouTube, Multiple)
2. **Niche** — quick-reply chips (Food, Fashion, Tech, Fitness, Lifestyle, Other)
3. **Portfolio link** — free text (URL)
4. **Automation level** — quick-reply chips (Notify me, Suggest, Auto-pilot) → saved to `creator_automation_preferences`

Completion: Donny creates the creator profile and shows matching campaigns.

### Onboarding Behavior

- Quick-reply chips for structured answers; free-text input always available
- Donny saves each answer to the profile in real-time (no "submit" step)
- If user drops off mid-onboarding, Donny picks up where they left off on next app open
- Replaces the existing `onboarding_steps` / `user_onboarding_progress` flow with Donny-driven progress tracking via `donny_messages`

---

## Creator Automation Levels

Creators configure how proactive Donny is on their behalf:

| Level | Behavior |
|---|---|
| **Notify** | Donny alerts about matching campaigns via dashboard card and push notification. Creator takes all action manually. |
| **Suggest** | Donny drafts applications based on creator's profile and the campaign brief. Creator reviews and sends. |
| **Auto-pilot** | Donny applies to matching campaigns automatically based on `auto_apply_criteria` (budget minimum, preferred niches, platforms). Creator is notified after application is submitted. |

Configurable in onboarding and in profile settings at any time.

---

## Payment Handling

Donny **prepares** payments but does **not** execute them directly:

1. User requests payment ("Pay Sarah for the TikTok")
2. Donny calls `prepare_payment(collab_id)` which gathers amount, recipient, and deliverable details
3. Donny shows a summary in chat: "Ready to release $250 to Sarah J. for the TikTok product review"
4. Donny presents a "Confirm Payment" button that navigates to the dedicated payment screen with all fields pre-filled
5. User confirms on the payment screen (Stripe integration)
6. Donny receives confirmation and celebrates: "Payment sent! 🎉 Sarah will receive $250 within 2 business days"

---

## Frontend Components

| Component | Purpose |
|---|---|
| `DonnyCard` | Dashboard proactive suggestion card |
| `DonnyNavButton` | Bottom nav center button with notification badge |
| `DonnyChatSheet` | Slide-up chat sheet (full conversation UI) |
| `DonnyMessage` | Individual message bubble (handles text, rich cards, tool status) |
| `DonnyRichCard` | Inline card renderer (creator profiles, campaign summaries, payment confirmations) |
| `DonnyQuickChips` | Quick action chip row above input |
| `DonnyAvatar` | Animated avatar with state prop (idle, thinking, celebrating, error, action_needed) |
| `DonnyTypingIndicator` | Typing dots shown while streaming |
| `useDonny()` | Hook: sends messages, subscribes to Realtime, manages conversation state |
| `useDonnyDashboard()` | Hook: fetches proactive suggestion for the dashboard card |

---

## System Prompt (Template)

```
You are Donny, DragonCandy's friendly AI assistant 🐉

## Personality
- Friendly, casual, warm — like texting a helpful friend
- Use emojis naturally but not excessively
- Always suggest a next step
- Never fabricate data — if you don't know, say so

## User Context
- Name: {user_name}
- Role: {user_role} (business | creator)
- Active campaigns: {campaigns_summary}
- Recent activity: {recent_activity}

## Rules
- For payments: ALWAYS use prepare_payment and tell the user to confirm on the payment screen. NEVER claim a payment was processed.
- For onboarding: Ask one question at a time. Save answers immediately.
- When showing creators or campaigns: Use rich card format with action buttons.
- If a tool fails: Explain the error conversationally and suggest how to fix it.
```

---

## Success Criteria

- New user completes onboarding in under 2 minutes via Donny
- Business can post a campaign in under 3 messages with Donny
- Creator can apply to a campaign in 1-2 messages with Donny
- Donny response streams begin within 1 second of sending a message
- All tool executions are logged and auditable
- Zero unhandled errors — Donny always responds gracefully
