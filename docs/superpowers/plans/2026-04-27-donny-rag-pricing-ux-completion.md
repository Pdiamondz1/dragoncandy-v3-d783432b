# Donny RAG Multi-Agent + Pricing & Free Tier + UX Polish Completion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sections 5, 6, and 7 of the DragonCandy launch playbook — Donny RAG multi-agent architecture, pricing/free tier system, and UX polish wiring.

**Architecture:** Three workstreams. Workstream 1 (Donny RAG) builds the foundation — pgvector knowledge base, orchestrator edge function with 5 sub-agent tools replacing both `donny-chat` and `donny-help`. Workstream 2 (UX Polish) wires disconnected tour/coachmark/expander components. Workstream 3 (Pricing) builds the tier system, soft paywalls, and free hooks. WS1 must complete before WS2/WS3, which can run in parallel.

**Tech Stack:** React + TypeScript, Supabase (Postgres + pgvector, Edge Functions on Deno), Stripe (test mode), Tailwind CSS, React Query, Framer Motion, Claude API (tool_use), OpenAI Embeddings API.

**Spec:** `docs/superpowers/specs/2026-04-27-donny-rag-pricing-ux-completion-design.md`

---

## File Map

### Workstream 1 — Donny RAG

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260427200000_donny_knowledge.sql` | pgvector extension + donny_knowledge table + HNSW index |
| Create | `supabase/functions/generate-embedding/index.ts` | OpenAI text-embedding-3-small utility |
| Create | `supabase/functions/donny-orchestrator/index.ts` | Master orchestrator — RAG retrieval + Claude tool_use routing |
| Create | `supabase/functions/donny-orchestrator/agents/campaign.ts` | Campaign Agent sub-module |
| Create | `supabase/functions/donny-orchestrator/agents/dragonshare.ts` | DragonShare Agent sub-module |
| Create | `supabase/functions/donny-orchestrator/agents/billing.ts` | Billing Agent sub-module |
| Create | `supabase/functions/donny-orchestrator/agents/guidance.ts` | Guidance Agent sub-module |
| Create | `supabase/functions/donny-orchestrator/agents/general.ts` | General Agent fallback |
| Create | `supabase/functions/donny-orchestrator/rag.ts` | RAG retrieval (embed query + cosine search + FTS fallback) |
| Create | `supabase/functions/donny-orchestrator/tools.ts` | Tool definitions for Claude |
| Create | `supabase/functions/donny-orchestrator/types.ts` | Shared types |
| Create | `supabase/seed/donny-knowledge-seed.ts` | Knowledge base seed script |
| Create | `supabase/migrations/20260427200001_donny_help_logs_agent_used.sql` | Add `agent_used` column (separate migration, NOT modifying existing) |
| Move | `src/components/donny-help/helpSuggestions.ts` → `src/lib/donny/helpSuggestions.ts` | Relocate before directory cleanup |
| Modify | `src/contexts/DonnyProvider.tsx` | Add `openDonnyWithContext`, switch to orchestrator |
| Modify | `src/hooks/useDonny.ts` | Call `donny-orchestrator` instead of `donny-chat` |
| Modify | `src/components/donny/DonnyTray.tsx` | Wire page-aware suggestion chips |
| Delete | `src/components/donny-help/DonnyHelpButton.tsx` | Redundant floating button |
| Delete | `src/components/donny-help/DonnyHelpSheet.tsx` | Absorbed into tray/chat |
| Delete | `src/hooks/useDonnyHelp.ts` | Replaced by orchestrator via useDonny |

### Workstream 2 — UX Polish

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/hooks/useTour.ts` | Add session guard, route guard, fix re-trigger bug |
| Modify | `src/components/org/OrgUnitSwitcher.tsx` | Add `data-tour="org-switcher"` |
| Modify | `src/components/MobileBottomNav.tsx` | Add `data-tour="bottom-nav-add"` to center button |
| Modify | `src/components/donny/DonnyNavButton.tsx` | Add `data-tour="donny-help"` |
| Modify | `src/pages/BusinessDashboard.tsx` | Add `data-tour="brief-generator"`, render DCTour, wire Coachmark |
| Modify | `src/pages/CreatorDashboard.tsx` (or equivalent) | Add `data-tour` attrs, render DCTour |
| Modify | `src/pages/BrandDashboard.tsx` | Add `data-tour` attrs, render DCTour |
| Modify | `src/components/interactions/ApplyWithDonnyButton.tsx` | Wrap with `<Coachmark>` |
| Modify | `src/pages/CreatorDragonShare.tsx` | Wire `<DragonShareExplainer>`, `<Coachmark>` for submit |
| Modify | `src/pages/BusinessDragonShare.tsx` | Wire `<DragonShareExplainer>`, `<Coachmark>` for inbox |
| Modify | `src/pages/BusinessSettings.tsx` | Wire `<Coachmark>` on Danger Zone |
| Modify | `src/pages/CreatorSettings.tsx` | Wire `<Coachmark>` on Danger Zone |
| Modify | `src/components/dragonshare/BoostConfirmationSheet.tsx` | Wire `<Coachmark>` + `<WhyExpander>` for take rate |
| Modify | `src/components/campaigns/CreatorMatchCard.tsx` | Wire `<WhyExpander>` for match score |
| Modify | `src/pages/OrgBillingPage.tsx` | Wire `<WhyExpander>` for per-seat pricing |
| Modify | `src/pages/help/HelpArticlePage.tsx` | Change "Talk to Donny" CTA to use `openDonnyWithContext` |

### Workstream 3 — Pricing & Free Tier

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260427210000_pricing_tables.sql` | 3 tables: campaign_brief_generations, campaign_templates, pricing_funnel_events |
| Create | `src/lib/pricing/tier-features.ts` | Feature → tier map + rate limit config |
| Create | `src/hooks/useTierGate.ts` | Tier gate hook returning allowed/reason/openPaywall |
| Create | `src/components/pricing/SoftPaywallSheet.tsx` | Contextual upgrade bottom sheet |
| Create | `src/pages/PricingPage.tsx` | Public /pricing with 4-tier grid |
| Create | `src/components/pricing/TierComparisonGrid.tsx` | Reusable tier comparison component |
| Create | `supabase/functions/create-checkout-session/index.ts` | Stripe Checkout with tier metadata |
| Create | `supabase/functions/create-billing-portal-session/index.ts` | Stripe Customer Portal session |
| Create | `supabase/functions/generate-anonymous-brief/index.ts` | IP-limited brief for landing page |
| Create | `src/components/dashboard/BriefGeneratorHero.tsx` | Restaurant dashboard hero card |
| Create | `src/components/dashboard/BrandFreeTrioHero.tsx` | Brand dashboard 3-card hero |
| Create | `src/components/landing/BriefGeneratorPreview.tsx` | Landing page lead magnet |
| Create | `docs/STRIPE_PRICES.md` | Stripe Price ID reference |
| Modify | `supabase/functions/stripe-webhook/index.ts:458` | Fix hardcoded 'pro' tier derivation |
| Modify | `src/App.tsx` | Add /pricing route |
| Modify | `src/pages/BusinessDashboard.tsx` | Embed BriefGeneratorHero |
| Modify | `src/pages/BrandDashboard.tsx` | Embed BrandFreeTrioHero |
| Modify | `src/pages/LandingPage.tsx` | Embed BriefGeneratorPreview |
| Modify | `src/pages/OrgBillingPage.tsx` | Wire billing portal button |

---

## Workstream 1: Donny RAG Multi-Agent Architecture

### Task 1: pgvector Extension + Knowledge Base Table

**Files:**
- Create: `supabase/migrations/20260427200000_donny_knowledge.sql`
- Create: `supabase/migrations/20260427200001_donny_help_logs_agent_used.sql` (add agent_used column)

- [ ] **Step 1: Create the donny_knowledge migration**

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Knowledge base for RAG
CREATE TABLE IF NOT EXISTS public.donny_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding extensions.vector(1536),
  source_type text NOT NULL CHECK (source_type IN (
    'help_article', 'feature_doc', 'pricing', 'tour', 'dragonshare', 'campaign'
  )),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW index for fast cosine similarity (works without pre-populated data)
CREATE INDEX IF NOT EXISTS idx_donny_knowledge_embedding
  ON public.donny_knowledge
  USING hnsw (embedding extensions.vector_cosine_ops);

-- Full-text search fallback index
CREATE INDEX IF NOT EXISTS idx_donny_knowledge_search_vector
  ON public.donny_knowledge USING gin (search_vector);

-- Filtered retrieval
CREATE INDEX IF NOT EXISTS idx_donny_knowledge_source_type
  ON public.donny_knowledge (source_type, created_at);

-- Auto-update timestamp
CREATE TRIGGER trg_donny_knowledge_updated_at
  BEFORE UPDATE ON public.donny_knowledge
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- RLS: authenticated read, service role full
ALTER TABLE public.donny_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read knowledge"
  ON public.donny_knowledge FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages knowledge"
  ON public.donny_knowledge FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Add agent_used column to donny_help_logs**

Create a new migration `supabase/migrations/20260427200001_donny_help_logs_agent_used.sql`:

```sql
ALTER TABLE public.donny_help_logs
  ADD COLUMN IF NOT EXISTS agent_used text;
```

- [ ] **Step 3: Verify migrations**

Run: `npx supabase db diff` to check migration syntax. Then apply locally:
```bash
npx supabase db reset
```
Expected: No errors. Both tables exist with correct columns and indexes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427200000_donny_knowledge.sql supabase/migrations/20260427200001_donny_help_logs_agent_used.sql
git commit -m "schema(donny): pgvector extension + donny_knowledge table + HNSW index"
```

---

### Task 2: Knowledge Base Seed Data

**Files:**
- Create: `supabase/seed/donny-knowledge-seed.ts`

- [ ] **Step 1: Create seed script with ~60-80 knowledge chunks**

First create the directory:
```bash
mkdir -p supabase/seed
```

File: `supabase/seed/donny-knowledge-seed.ts`

The seed script should:
1. Define knowledge chunks as an array of `{ content, metadata, source_type }` objects
2. Chunk the 18 existing help articles (from `help_articles` table) into 200-500 token pieces
3. Add feature documentation chunks covering: campaigns workflow, DragonShare flow, org management, billing/pricing, messaging, Donny capabilities
4. Add pricing tier descriptions (free, starter, growth, pro, enterprise)
5. Add tour/onboarding content
6. Add DragonShare explainer content (creator + brand perspectives)

Each chunk's metadata shape:
```typescript
{
  source_type: string,
  source_id?: string,     // help article ID if from an article
  category: string,       // 'campaigns', 'dragonshare', 'billing', etc.
  roles: string[],        // ['business_client', 'content_creator', 'brand']
  page_paths: string[]    // relevant page paths for context matching
}
```

The script should be runnable via: `npx tsx supabase/seed/donny-knowledge-seed.ts`

It inserts chunks without embeddings initially — embeddings are generated in Task 3 via the generate-embedding function.

- [ ] **Step 2: Run seed script and verify**

```bash
npx tsx supabase/seed/donny-knowledge-seed.ts
```

Verify in Supabase Studio: `donny_knowledge` table has 60-80 rows with content and metadata populated, embedding column NULL.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed/donny-knowledge-seed.ts
git commit -m "seed(donny): knowledge base chunks for RAG (60-80 entries)"
```

---

### Task 3: Generate-Embedding Edge Function

**Files:**
- Create: `supabase/functions/generate-embedding/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/generate-embedding/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Service role only — exact match to prevent substring bypass
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { texts } = await req.json();
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 100) {
    return new Response(JSON.stringify({ error: "texts must be array of 1-100 strings" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: "Embedding API failed", details: err }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  const embeddings = data.data.map((d: { embedding: number[] }) => d.embedding);

  return new Response(JSON.stringify({ embeddings }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Create a backfill script to embed existing knowledge chunks**

Add to seed script or create `supabase/seed/embed-knowledge.ts`:
1. Read all rows from `donny_knowledge` where `embedding IS NULL`
2. Batch texts (up to 100 per call)
3. Call `generate-embedding` function
4. Update each row with its embedding vector

- [ ] **Step 3: Test locally**

```bash
npx supabase functions serve generate-embedding
```

Call with a test payload and verify 1536-dim vector returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-embedding/index.ts supabase/seed/embed-knowledge.ts
git commit -m "feat(donny): generate-embedding edge function + backfill script"
```

---

### Task 4: Donny Orchestrator Edge Function

**Files:**
- Create: `supabase/functions/donny-orchestrator/index.ts`
- Create: `supabase/functions/donny-orchestrator/rag.ts`
- Create: `supabase/functions/donny-orchestrator/tools.ts`
- Create: `supabase/functions/donny-orchestrator/types.ts`
- Create: `supabase/functions/donny-orchestrator/agents/campaign.ts`
- Create: `supabase/functions/donny-orchestrator/agents/dragonshare.ts`
- Create: `supabase/functions/donny-orchestrator/agents/billing.ts`
- Create: `supabase/functions/donny-orchestrator/agents/guidance.ts`
- Create: `supabase/functions/donny-orchestrator/agents/general.ts`

- [ ] **Step 1: Create types.ts**

Define shared types:
```typescript
export interface OrchestratorInput {
  query: string;
  page_path: string;
  page_context?: Record<string, unknown>;
  user_role: string;
  org_id?: string;
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface OrchestratorOutput {
  answer: string;
  suggested_actions: Array<{ label: string; route: string }>;
  agent_used: string;
}

export interface SubAgentResult {
  context: string;
  suggested_actions?: Array<{ label: string; route: string }>;
}

export interface UserContext {
  user_id: string;
  user_role: string;
  org_id?: string;
  org_tier?: string;
  full_name?: string;
}
```

- [ ] **Step 2: Create rag.ts — RAG retrieval with FTS fallback**

Implement two functions:
1. `embedQuery(query: string): Promise<number[] | null>` — calls OpenAI embedding API, returns null on failure
2. `retrieveContext(supabase, query: string, embedding: number[] | null, limit = 5): Promise<string[]>` — if embedding exists, cosine similarity search via `SELECT content FROM donny_knowledge ORDER BY embedding <=> $1 LIMIT $2`; if null, fall back to full-text search `SELECT content FROM donny_knowledge WHERE search_vector @@ plainto_tsquery('english', $1) LIMIT $2`

- [ ] **Step 3: Create tools.ts — Claude tool definitions for 5 sub-agents**

Define the 5 tool definitions following Anthropic's tool_use format:
```typescript
export const SUB_AGENT_TOOLS = [
  {
    name: "campaign_agent",
    description: "Use when the user asks about campaigns, briefs, applications, matching, content delivery, or the campaign wizard.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        campaign_id: { type: "string" },
        user_role: { type: "string" },
        org_id: { type: "string" },
      },
      required: ["query", "user_role"],
    },
  },
  // ... dragonshare_agent, billing_agent, guidance_agent, general_agent
];
```

- [ ] **Step 4: Create the 5 sub-agent modules**

Each agent module exports a single function:
```typescript
export async function execute(supabase, input, userContext): Promise<SubAgentResult>
```

**agents/campaign.ts:** Queries `campaigns`, `campaign_applications`, `campaign_collaborations`, `campaign_brief_generations`. Returns campaign status, application counts, brief history.

**agents/dragonshare.ts:** Queries `dragonshare_posts`, `dragonshare_boosts`, `dragonshare_payouts`. Returns post status, boost amounts, payout info.

**agents/billing.ts:** Queries `organizations` for tier/seats. Returns tier comparison data from hardcoded TIER_FEATURES config, upgrade path, cost estimates.

**agents/guidance.ts:** Queries `help_articles` by relevance (text search). Returns step-by-step guidance, article references.

**agents/general.ts:** Returns only RAG context (no additional DB queries). Catch-all for greetings and off-topic.

- [ ] **Step 5: Create index.ts — main orchestrator**

Flow:
1. Parse request body as `OrchestratorInput`
2. Authenticate via Supabase JWT (reuse dual-auth pattern from donny-chat for OAuth backward compat)
3. Fetch user context (profile, org, tier)
4. RAG retrieval: `embedQuery(query)` then `retrieveContext(supabase, query, embedding)`
5. Build Claude messages array:
   - System prompt (Donny persona + RAG context + user context)
   - Conversation history (last 10 from input)
   - Current user message
6. Call Claude `claude-sonnet-4-20250514` with `tools: SUB_AGENT_TOOLS`
7. If Claude calls a tool → execute the matching agent module → feed result back to Claude
8. Extract final answer + suggested_actions from Claude response
9. Log to `donny_help_logs` with `agent_used`
10. Return `OrchestratorOutput`

System prompt template:
```
You are Donny, the AI assistant inside DragonCandy. You help users with campaigns, DragonShare, billing, and general app guidance.

Current user: {full_name} ({user_role})
Current page: {page_path}
Organization tier: {org_tier}

Relevant knowledge:
{rag_chunks}

Rules:
- Answer in 2-3 sentences max unless the user asks for details
- If an action is available, include it in suggested_actions
- Use the appropriate agent tool when you need specific data
- Never describe features that don't exist
- If unsure, say so honestly
```

- [ ] **Step 6: Test locally**

```bash
npx supabase functions serve donny-orchestrator
```

Test with curl:
```bash
curl -X POST http://localhost:54321/functions/v1/donny-orchestrator \
  -H "Authorization: Bearer <test-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"query":"How do I apply to a campaign?","page_path":"/dashboard/creator/campaigns","user_role":"content_creator"}'
```

Expected: JSON response with answer, suggested_actions, agent_used="guidance_agent" or "campaign_agent".

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/donny-orchestrator/
git commit -m "feat(donny): orchestrator edge function with 5 sub-agent tools + RAG"
```

---

### Task 5: Frontend Integration — Update DonnyProvider + Delete Old Help

**Files:**
- Move: `src/components/donny-help/helpSuggestions.ts` → `src/lib/donny/helpSuggestions.ts`
- Modify: `src/contexts/DonnyProvider.tsx`
- Modify: `src/hooks/useDonny.ts`
- Modify: `src/components/donny/DonnyTray.tsx`
- Delete: `src/components/donny-help/DonnyHelpButton.tsx`
- Delete: `src/components/donny-help/DonnyHelpSheet.tsx`
- Delete: `src/hooks/useDonnyHelp.ts`

- [ ] **Step 1: Move helpSuggestions.ts**

```bash
mkdir -p src/lib/donny
mv src/components/donny-help/helpSuggestions.ts src/lib/donny/helpSuggestions.ts
```

Update any existing imports (should be none since the help sheet is being deleted, but verify with grep).

- [ ] **Step 2: Update useDonny.ts to call donny-orchestrator**

In `src/hooks/useDonny.ts`, the current `sendMessage` mutation (lines 122-161) calls:
```typescript
supabase.functions.invoke('donny-chat', {
  body: { conversation_id: conversation.id, message: content, context: { page_url: window.location.pathname, campaign_context: options?.campaignContext ?? undefined } }
})
```

The current hook destructures `const { user, profile } = useAuth()` at line 36. Add `activeOrg`:
```typescript
const { user, profile, activeOrg } = useAuth();
```

Update the mutation to call `donny-orchestrator`:
```typescript
const { data, error } = await supabase.functions.invoke('donny-orchestrator', {
  body: {
    query: content,
    page_path: window.location.pathname,
    page_context: options?.campaignContext || {},
    user_role: profile?.role || 'content_creator',
    org_id: activeOrg?.id,
    conversation_history: messages.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content || '',
    })),
  }
});
```

**Critical — message persistence:** The current `donny-chat` edge function saves the assistant message to the DB, and the Realtime subscription picks it up. The new orchestrator does NOT do this. After receiving the response, the hook must insert the assistant message:

```typescript
if (data?.answer) {
  await supabase.from('donny_messages').insert({
    conversation_id: conversation.id,
    role: 'assistant',
    content: data.answer,
    metadata: {
      agent_used: data.agent_used,
      suggested_actions: data.suggested_actions,
    },
  });
  // Realtime subscription will pick this up and invalidate the query
}
```

Also log to `donny_help_logs`:
```typescript
await supabase.from('donny_help_logs').insert({
  user_id: user?.id,
  query: content,
  response: data?.answer,
  page_path: window.location.pathname,
  agent_used: data?.agent_used,
});
```

- [ ] **Step 3: Add openDonnyWithContext to DonnyProvider**

In `src/contexts/DonnyProvider.tsx`:

**3a.** Update the `DonnyContextValue` interface (around line 11) to add:
```typescript
openDonnyWithContext: (query: string) => void;
```

**3b.** Add the implementation before the `value` useMemo (around line 134):
```typescript
const openDonnyWithContext = useCallback((query: string) => {
  open();
  setTimeout(() => {
    expand();
    setTimeout(() => {
      sendMessage(query);
    }, 100);
  }, 100);
}, [open, expand, sendMessage]);
```

**3c.** Add `openDonnyWithContext` to the `value` useMemo object (around line 141):
```typescript
const value = useMemo(() => ({
  ...existingProps,
  openDonnyWithContext,
}), [/* existing deps */, openDonnyWithContext]);
```

- [ ] **Step 4: Wire page-aware suggestions into DonnyTray**

In `src/components/donny/DonnyTray.tsx`, import `getSuggestionsForPage` from the new location:
```typescript
import { getSuggestionsForPage } from '@/lib/donny/helpSuggestions';
```

Add suggestions as chips in the tray alongside existing quickChips:
```typescript
const pageSuggestions = getSuggestionsForPage(window.location.pathname);
// Render as additional chips in the quick-action area
```

- [ ] **Step 5: Delete old help components**

```bash
rm src/components/donny-help/DonnyHelpButton.tsx
rm src/components/donny-help/DonnyHelpSheet.tsx
rm src/hooks/useDonnyHelp.ts
```

Also delete the `donny-help` edge function (replaced by orchestrator):
```bash
rm -rf supabase/functions/donny-help/
```

Verify no remaining imports reference deleted files:
```bash
grep -r "DonnyHelpButton\|DonnyHelpSheet\|useDonnyHelp\|donny-help" src/
```

Remove the `src/components/donny-help/` directory if empty (helpSuggestions.ts was already moved).

- [ ] **Step 6: Build verification**

```bash
npm run build
```

Expected: Clean build with no import errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(donny): wire orchestrator into DonnyProvider, add openDonnyWithContext, delete old help UI"
```

---

## Workstream 2: UX Polish Completion

### Task 6: Fix Tour System + Add data-tour Attributes

**Files:**
- Modify: `src/hooks/useTour.ts`
- Modify: `src/components/org/OrgUnitSwitcher.tsx`
- Modify: `src/components/MobileBottomNav.tsx`
- Modify: `src/components/donny/DonnyNavButton.tsx`

- [ ] **Step 1: Fix useTour.ts with 3 guards**

Rewrite `src/hooks/useTour.ts`:

1. **Route guard:** Accept a `dashboardPath` parameter. Only show tour if `window.location.pathname` exactly matches (not startsWith) the dashboard home route.
2. **Session guard:** Check `sessionStorage.getItem('dc_tour_dismissed')` on mount. Set it immediately on skip/complete.
3. **DB guard:** Existing check of `profiles.onboarding_completed_at` stays.
4. **Mount delay:** Increase from 300ms to 500ms.

**Note:** The only existing call site of `useTour()` was in `DashboardLayout.tsx` which was removed at commit 094aafb. No other call sites exist, so this signature change is safe.

```typescript
export function useTour(dashboardPath?: string): UseTourReturn {
  const [showTour, setShowTour] = useState(false);
  // ... existing profile query for onboarding_completed_at

  useEffect(() => {
    // Guard 1: Route — only on exact dashboard home
    if (dashboardPath && window.location.pathname !== dashboardPath) return;
    // Guard 2: Session — already dismissed this session
    if (sessionStorage.getItem('dc_tour_dismissed')) return;
    // Guard 3: DB — already completed onboarding
    if (onboardingCompleted) return;

    const timer = setTimeout(() => setShowTour(true), 500);
    return () => clearTimeout(timer);
  }, [dashboardPath, onboardingCompleted]);

  const completeTour = useCallback(async () => {
    sessionStorage.setItem('dc_tour_dismissed', 'true');
    setShowTour(false);
    // Update DB (async, non-blocking)
    await supabase.from('profiles').update({
      onboarding_completed_at: new Date().toISOString()
    }).eq('id', userId);
  }, [userId]);

  const skipTour = completeTour; // Same behavior

  const replayTour = useCallback(async () => {
    sessionStorage.removeItem('dc_tour_dismissed');
    await supabase.from('profiles').update({
      onboarding_completed_at: null
    }).eq('id', userId);
    setShowTour(true);
  }, [userId]);

  return { showTour, tourSteps, completeTour, skipTour, replayTour };
}
```

- [ ] **Step 2: Add data-tour attributes to shared components**

**OrgUnitSwitcher.tsx** — Add to the root button/container element:
```tsx
<div data-tour="org-switcher">
  {/* existing switcher content */}
</div>
```

**MobileBottomNav.tsx** — Add to the center Donny button wrapper:
```tsx
{item.isDonny ? (
  <div data-tour="bottom-nav-add">
    <DonnyNavButton key="donny-center" />
  </div>
) : /* ... */}
```

**DonnyNavButton.tsx** — Add to the button element:
```tsx
<button data-tour="donny-help" aria-label="Open Donny" ...>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTour.ts src/components/org/OrgUnitSwitcher.tsx src/components/MobileBottomNav.tsx src/components/donny/DonnyNavButton.tsx
git commit -m "fix(guidance): tour 3-guard system + data-tour attributes on shared components"
```

---

### Task 7: Re-integrate DCTour on Dashboard Home Pages

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`
- Modify: `src/pages/BrandDashboard.tsx`
- Find and modify: Creator dashboard page (check `src/pages/CreatorDashboard.tsx` or similar)

- [ ] **Step 1: Add DCTour to BusinessDashboard (restaurant)**

In `src/pages/BusinessDashboard.tsx`, import and render:

```typescript
import { DCTour } from '@/components/guidance/DCTour';
import { useTour } from '@/hooks/useTour';
```

Inside the component, add the data-tour attribute to the brief generator hero area:
```tsx
<div data-tour="brief-generator">
  {/* existing hero/quick action section */}
</div>
```

Call useTour with the exact dashboard path:
```typescript
const { showTour, tourSteps, completeTour, skipTour } = useTour('/dashboard/business');
```

Render DCTour at the bottom of the component:
```tsx
{showTour && tourSteps.length > 0 && (
  <DCTour steps={tourSteps} onComplete={completeTour} onSkip={skipTour} />
)}
```

- [ ] **Step 2: Add DCTour to BrandDashboard**

Same pattern. Path: `/dashboard/brand`.

Add `data-tour="free-trio"` to the hero card grid area.
Add `data-tour="dragonshare-inbox"` to the DragonShare link/nav entry if visible on this page.

- [ ] **Step 3: Add DCTour to Creator dashboard**

Find the creator dashboard page. Same pattern. Path: `/dashboard/creator`.

Add `data-tour="profile-completion"` to the profile completion bar.
Add `data-tour="browse-campaigns"` to the campaigns nav entry.
Add `data-tour="dragonshare-nav"` to the DragonShare nav entry.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusinessDashboard.tsx src/pages/BrandDashboard.tsx src/pages/CreatorDashboard.tsx
git commit -m "feat(guidance): re-integrate DCTour on dashboard home pages (3 roles)"
```

---

### Task 8: Wire Coachmarks to 6 Pages

**Files:**
- Modify: `src/components/org/OrgUnitSwitcher.tsx`
- Modify: `src/components/interactions/ApplyWithDonnyButton.tsx`
- Modify: `src/pages/CreatorDragonShare.tsx`
- Modify: `src/pages/BusinessDragonShare.tsx`
- Modify: `src/pages/BusinessSettings.tsx` and `src/pages/CreatorSettings.tsx`
- Modify: `src/components/dragonshare/BoostConfirmationSheet.tsx`

- [ ] **Step 1: Wire org_switcher coachmark**

In `src/components/org/OrgUnitSwitcher.tsx`:
```typescript
import { Coachmark } from '@/components/guidance/Coachmark';
```

Wrap the switcher with Coachmark (only show when org has 2+ units):
```tsx
<Coachmark
  coachmarkKey="org_switcher"
  title="Switch units here"
  body="Manage multiple locations or products from one account."
>
  <div data-tour="org-switcher">
    {/* existing switcher */}
  </div>
</Coachmark>
```

- [ ] **Step 2: Wire apply_with_donny coachmark**

In `src/components/interactions/ApplyWithDonnyButton.tsx`:
```tsx
<Coachmark
  coachmarkKey="apply_with_donny"
  title="One tap to apply"
  body="Donny pre-fills everything. Just review and send."
>
  <button ...>{/* existing button content */}</button>
</Coachmark>
```

- [ ] **Step 3: Wire dragonshare_submit coachmark (creator inbox)**

In `src/pages/CreatorDragonShare.tsx`, wrap the submit CTA:
```tsx
<Coachmark
  coachmarkKey="dragonshare_submit"
  title="Paste a link, tag a brand, get paid"
  body="Submit posts you've already made about brands you love."
>
  {/* submit button/CTA */}
</Coachmark>
```

- [ ] **Step 4: Wire dragonshare_inbox coachmark (brand inbox)**

In `src/pages/BusinessDragonShare.tsx`, wrap the first post card area:
```tsx
<Coachmark
  coachmarkKey="dragonshare_inbox"
  title="Creators talking about you"
  body="One tap to boost. The creator gets 80%."
>
  {/* first post card or empty state */}
</Coachmark>
```

- [ ] **Step 5: Wire delete_org_danger coachmark (settings)**

In `src/pages/BusinessSettings.tsx` and `src/pages/CreatorSettings.tsx`, wrap the Danger Zone heading:
```tsx
<Coachmark
  coachmarkKey="delete_org_danger"
  title="Destructive actions"
  body="Read carefully. Deletion is permanent after 30 days."
>
  <h3>Danger Zone</h3>
</Coachmark>
```

- [ ] **Step 6: Wire boost_tier_recommended coachmark**

In `src/components/dragonshare/BoostConfirmationSheet.tsx`, wrap the recommended tier:
```tsx
<Coachmark
  coachmarkKey="boost_tier_recommended"
  title="Donny's recommendation"
  body="Based on the post's estimated reach and engagement."
>
  {/* recommended tier badge/button */}
</Coachmark>
```

- [ ] **Step 7: Build and verify**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/org/OrgUnitSwitcher.tsx src/components/interactions/ApplyWithDonnyButton.tsx src/pages/CreatorDragonShare.tsx src/pages/BusinessDragonShare.tsx src/pages/BusinessSettings.tsx src/pages/CreatorSettings.tsx src/components/dragonshare/BoostConfirmationSheet.tsx
git commit -m "feat(guidance): wire 6 coachmarks to actual pages"
```

---

### Task 9: Wire WhyExpanders to 6 Locations

**Files:**
- Modify: `src/components/campaigns/CreatorMatchCard.tsx`
- Modify: `src/components/dragonshare/BoostConfirmationSheet.tsx`
- Modify: `src/pages/OrgBillingPage.tsx`
- Modify: `src/pages/BusinessSettings.tsx`
- Modify: `src/pages/CreatorSettings.tsx`
- Find: Campaign detail page with delivery tier badges
- Find: DragonShare inbox with Donny scores

- [ ] **Step 1: Wire match_score WhyExpander**

In `src/components/campaigns/CreatorMatchCard.tsx`, next to the overall score badge (around line 135):
```typescript
import { WhyExpander } from '@/components/guidance/WhyExpander';
```

```tsx
<span className="text-2xl font-bold">{match.match_score}</span>
<WhyExpander
  expanderKey="match_score"
  title="What is match score?"
  body="Donny scores creators 0–100 based on content fit, audience overlap, and past performance."
/>
```

- [ ] **Step 2: Wire take_rate WhyExpander**

In `src/components/dragonshare/BoostConfirmationSheet.tsx`, next to the fee breakdown:
```tsx
<span>DragonCandy fee (20%)</span>
<WhyExpander
  expanderKey="take_rate"
  title="Where does the money go?"
  body="Creator receives 80%. DragonCandy's 20% covers payment processing, verification, and platform costs."
/>
```

- [ ] **Step 3: Wire per_seat_pricing WhyExpander**

In `src/pages/OrgBillingPage.tsx`, next to the per-seat cost line:
```tsx
<WhyExpander
  expanderKey="per_seat_pricing"
  title="What is a seat?"
  body="Each seat is one team member. Your plan includes some seats free; extras are billed monthly."
/>
```

- [ ] **Step 4: Wire soft_delete_vs_gdpr WhyExpander**

In `src/pages/BusinessSettings.tsx` and `src/pages/CreatorSettings.tsx`, next to the delete/GDPR section:
```tsx
<WhyExpander
  expanderKey="soft_delete_vs_gdpr"
  title="What's the difference?"
  body="Soft delete preserves your data for 30 days in case you change your mind. GDPR erasure permanently removes everything."
/>
```

- [ ] **Step 5: Wire delivery_tier WhyExpander**

In `src/components/campaign-creator/TierBadge.tsx` (renders DragonDash/Express/Standard badges, lines 13-37), add next to the badge:
```tsx
import { WhyExpander } from '@/components/guidance/WhyExpander';
```
```tsx
<WhyExpander
  expanderKey="delivery_tier"
  title="What do the tiers mean?"
  body="DragonDash = same-day. Express = 48 hours. Standard = 5 business days."
/>
```

- [ ] **Step 6: Wire donny_score WhyExpander**

In `src/components/dragonshare/DragonSharePostCard.tsx` (renders `donny_recommended_tier` at lines 52-66), add next to the recommendation text:
```tsx
import { WhyExpander } from '@/components/guidance/WhyExpander';
```
```tsx
<WhyExpander
  expanderKey="donny_score"
  title="What is Donny's score?"
  body="Donny estimates reach and engagement potential. Higher scores get higher boost recommendations."
/>
```

- [ ] **Step 7: Build and verify**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(guidance): wire 6 WhyExpanders to match score, take rate, billing, settings, tiers"
```

---

### Task 10: Wire DragonShareExplainer + Update Help Article CTA

**Files:**
- Modify: `src/pages/CreatorDragonShare.tsx`
- Modify: `src/pages/BusinessDragonShare.tsx`
- Modify: `src/pages/help/HelpArticlePage.tsx`

- [ ] **Step 1: Wire DragonShareExplainer to creator inbox**

In `src/pages/CreatorDragonShare.tsx`:
```typescript
import { DragonShareExplainer } from '@/components/dragonshare/DragonShareExplainer';
```

In the "Submitted" tab empty state area, replace or augment existing empty state:
```tsx
{submittedPosts.length === 0 ? (
  <DragonShareExplainer role="creator" />
) : (
  <>
    <DragonShareExplainer role="creator" collapsed />
    {/* existing post list */}
  </>
)}
```

- [ ] **Step 2: Wire DragonShareExplainer to brand inbox**

In `src/pages/BusinessDragonShare.tsx`:
```tsx
{verifiedPosts.length === 0 ? (
  <DragonShareExplainer role="brand" />
) : (
  <>
    <DragonShareExplainer role="brand" collapsed />
    {/* existing post list */}
  </>
)}
```

Detect the org's role (restaurant uses "brand" variant too based on existing component props).

- [ ] **Step 3: Update HelpArticlePage "Talk to Donny" CTA**

In `src/pages/help/HelpArticlePage.tsx`, the current primary CTA links to `/help?donny={slug}`. Update it to use `openDonnyWithContext`:

```typescript
import { useDonnyContext } from '@/contexts/DonnyProvider';

// Inside component:
const { openDonnyWithContext } = useDonnyContext();
```

Replace the link-based CTA with a button:
```tsx
<button
  onClick={() => openDonnyWithContext(`Help me understand: ${article.title}`)}
  className="w-full py-3 bg-teal-500 text-white rounded-full font-semibold"
>
  Talk to Donny about this
</button>
```

Keep the "Email support" as secondary CTA below.

**Note:** If HelpArticlePage is outside DonnyProvider (public route), wrap conditionally — only show the Donny CTA if the user is authenticated and DonnyProvider is available.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreatorDragonShare.tsx src/pages/BusinessDragonShare.tsx src/pages/help/HelpArticlePage.tsx
git commit -m "feat(guidance): DragonShareExplainer on inboxes + Talk to Donny CTA on help articles"
```

---

## Workstream 3: Pricing & Free Tier

### Task 11: Pricing Database Migrations

**Files:**
- Create: `supabase/migrations/20260427210000_pricing_tables.sql`

- [ ] **Step 1: Create migration with 3 tables**

```sql
-- Campaign brief generation tracking (rate limiting)
CREATE TABLE IF NOT EXISTS public.campaign_brief_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url text,
  brief_jsonb jsonb,
  ip_address inet,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brief_gen_org ON public.campaign_brief_generations (org_id, generated_at DESC);
CREATE INDEX idx_brief_gen_ip ON public.campaign_brief_generations (ip_address, generated_at DESC);

ALTER TABLE public.campaign_brief_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own generations"
  ON public.campaign_brief_generations FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
  ) OR user_id = auth.uid());

CREATE POLICY "Authenticated users insert"
  ON public.campaign_brief_generations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role full access"
  ON public.campaign_brief_generations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Campaign templates (brand sponsored library)
CREATE TABLE IF NOT EXISTS public.campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'product_launch', 'seasonal', 'ugc', 'brand_awareness', 'event'
  )),
  template_data jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read templates"
  ON public.campaign_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role manages templates"
  ON public.campaign_templates FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Seed 5 templates
INSERT INTO public.campaign_templates (title, description, category, template_data) VALUES
  ('Product Launch UGC', 'User-generated content to launch a new product with authentic creator voices.', 'product_launch',
   '{"content_types":["short_video","photo_carousel"],"platforms":["instagram","tiktok"],"budget_range":{"min":500,"max":2000},"timeline_days":14,"deliverables_count":3}'::jsonb),
  ('Seasonal Promo', 'Holiday or seasonal content push to drive foot traffic and online orders.', 'seasonal',
   '{"content_types":["short_video","story"],"platforms":["instagram","tiktok"],"budget_range":{"min":300,"max":1500},"timeline_days":7,"deliverables_count":2}'::jsonb),
  ('UGC Collection', 'Collect authentic user-generated content for your brand library.', 'ugc',
   '{"content_types":["photo","short_video"],"platforms":["instagram"],"budget_range":{"min":200,"max":1000},"timeline_days":21,"deliverables_count":5}'::jsonb),
  ('Brand Awareness', 'Long-term storytelling campaign to build brand recognition with creators.', 'brand_awareness',
   '{"content_types":["long_video","blog_post","photo_carousel"],"platforms":["youtube","instagram","tiktok"],"budget_range":{"min":1000,"max":5000},"timeline_days":30,"deliverables_count":4}'::jsonb),
  ('Event Coverage', 'Same-day creator content from your event, launch party, or pop-up.', 'event',
   '{"content_types":["short_video","story","photo"],"platforms":["instagram","tiktok"],"budget_range":{"min":500,"max":3000},"timeline_days":3,"deliverables_count":3}'::jsonb);

-- Pricing funnel analytics
CREATE TABLE IF NOT EXISTS public.pricing_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  current_tier text NOT NULL,
  required_tier text NOT NULL,
  action text NOT NULL CHECK (action IN ('viewed', 'clicked_upgrade', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_funnel ON public.pricing_funnel_events (feature_key, action, created_at);

ALTER TABLE public.pricing_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own events"
  ON public.pricing_funnel_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access"
  ON public.pricing_funnel_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Verify**

```bash
npx supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427210000_pricing_tables.sql
git commit -m "schema(pricing): brief_generations + campaign_templates + funnel_events tables"
```

---

### Task 12: Tier Features Config + useTierGate Hook

**Files:**
- Create: `src/lib/pricing/tier-features.ts`
- Create: `src/hooks/useTierGate.ts`

- [ ] **Step 1: Create tier-features.ts**

```typescript
// src/lib/pricing/tier-features.ts

export type TierName = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';

export interface TierFeature {
  key: string;
  label: string;
  description: string;
  requiredTier: TierName;
  rateLimit?: { limit: number; periodDays: number };
}

export const TIER_FEATURES: TierFeature[] = [
  { key: 'brief_generation', label: 'Campaign Brief Generation', description: 'AI-generated campaign briefs from your URL', requiredTier: 'free', rateLimit: { limit: 1, periodDays: 7 } },
  { key: 'match_report', label: 'Creator Match Report', description: 'Top 5 creators ranked and scored for your brief', requiredTier: 'free', rateLimit: { limit: 1, periodDays: 30 } },
  { key: 'campaign_templates', label: 'Sponsored Templates', description: 'Pre-built campaign templates to customize', requiredTier: 'free' },
  { key: 'creator_delivery', label: 'Creator Delivery', description: 'Hire creators to deliver content for your campaigns', requiredTier: 'starter' },
  { key: 'basic_analytics', label: 'Basic Analytics', description: 'Campaign performance and engagement data', requiredTier: 'starter' },
  { key: 'dragondash', label: 'DragonDash', description: 'Same-day creator content delivery', requiredTier: 'growth' },
  { key: 'advanced_analytics', label: 'Advanced Analytics', description: 'Deep engagement, ROI, and audience insights', requiredTier: 'growth' },
  { key: 'multi_unit', label: 'Multi-Unit Management', description: 'Manage multiple locations or products', requiredTier: 'growth' },
  { key: 'api_access', label: 'API Access', description: 'Programmatic access to DragonCandy features', requiredTier: 'pro' },
  { key: 'custom_branding', label: 'Custom Branding', description: 'White-label campaigns with your brand', requiredTier: 'pro' },
  { key: 'priority_support', label: 'Priority Support', description: 'Dedicated support with faster response times', requiredTier: 'pro' },
];

export const TIER_ORDER: TierName[] = ['free', 'starter', 'growth', 'pro', 'enterprise'];

export const TIER_PRICES: Record<TierName, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 199, annual: 159 },
  growth: { monthly: 499, annual: 399 },
  pro: { monthly: 999, annual: 799 },
  enterprise: { monthly: 0, annual: 0 },
};

export function getFeature(key: string): TierFeature | undefined {
  return TIER_FEATURES.find(f => f.key === key);
}

export function tierMeetsRequirement(currentTier: TierName, requiredTier: TierName): boolean {
  return TIER_ORDER.indexOf(currentTier) >= TIER_ORDER.indexOf(requiredTier);
}
```

- [ ] **Step 2: Create useTierGate.ts**

```typescript
// src/hooks/useTierGate.ts
import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getFeature, tierMeetsRequirement, type TierName } from '@/lib/pricing/tier-features';

interface TierGateResult {
  allowed: boolean;
  reason: 'tier' | 'rate_limit' | null;
  requiredTier: string;
  currentTier: string;
  openPaywall: () => void;
}

export function useTierGate(featureKey: string): TierGateResult {
  const { activeOrg } = useAuth(); // Get active org with subscription_tier
  const [paywallOpen, setPaywallOpen] = useState(false);

  const currentTier = (activeOrg?.subscription_tier || 'free') as TierName;
  const feature = getFeature(featureKey);

  // Check rate limit for rate-limited features
  const { data: rateLimitHit } = useQuery({
    queryKey: ['tier-rate-limit', featureKey, activeOrg?.id],
    queryFn: async () => {
      if (!feature?.rateLimit || !activeOrg?.id) return false;
      // Only check rate limit on free tier
      if (currentTier !== 'free') return false;

      const since = new Date();
      since.setDate(since.getDate() - feature.rateLimit.periodDays);

      const { count } = await supabase
        .from('campaign_brief_generations')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', activeOrg.id)
        .gte('generated_at', since.toISOString());

      return (count || 0) >= feature.rateLimit.limit;
    },
    enabled: !!feature?.rateLimit && !!activeOrg?.id,
  });

  if (!feature) {
    return { allowed: true, reason: null, requiredTier: 'free', currentTier, openPaywall: () => {} };
  }

  const tierAllowed = tierMeetsRequirement(currentTier, feature.requiredTier);
  const rateLimited = rateLimitHit === true;

  return {
    allowed: tierAllowed && !rateLimited,
    reason: !tierAllowed ? 'tier' : rateLimited ? 'rate_limit' : null,
    requiredTier: feature.requiredTier,
    currentTier,
    openPaywall: () => setPaywallOpen(true),
  };
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/pricing/tier-features.ts src/hooks/useTierGate.ts
git commit -m "feat(pricing): tier-features config + useTierGate hook"
```

---

### Task 13: SoftPaywallSheet Component

**Files:**
- Create: `src/components/pricing/SoftPaywallSheet.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/pricing/SoftPaywallSheet.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { getFeature, TIER_PRICES, type TierName } from '@/lib/pricing/tier-features';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface SoftPaywallSheetProps {
  featureKey: string;
  open: boolean;
  onClose: () => void;
}

export function SoftPaywallSheet({ featureKey, open, onClose }: SoftPaywallSheetProps) {
  const { activeOrg, user } = useAuth();
  const navigate = useNavigate();
  const feature = getFeature(featureKey);
  const requiredTier = feature?.requiredTier || 'starter';
  const price = TIER_PRICES[requiredTier as TierName];

  const logEvent = async (action: 'viewed' | 'clicked_upgrade' | 'dismissed') => {
    await supabase.from('pricing_funnel_events').insert({
      user_id: user?.id,
      org_id: activeOrg?.id,
      feature_key: featureKey,
      current_tier: activeOrg?.subscription_tier || 'free',
      required_tier: requiredTier,
      action,
    });
  };

  // Log 'viewed' on open
  // (useEffect with open dependency)

  const handleUpgrade = async () => {
    await logEvent('clicked_upgrade');
    navigate(`/pricing?highlight=${requiredTier}`);
    onClose();
  };

  const handleDismiss = async () => {
    await logEvent('dismissed');
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleDismiss}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{feature?.label} is part of {requiredTier}</SheetTitle>
        </SheetHeader>
        <p className="text-gray-600 mt-2">{feature?.description}</p>
        {/* Donny rationale — personalized line from Billing Agent (descoped for MVP, placeholder) */}
        <p className="text-sm text-teal-600 italic mt-1">
          Donny recommends upgrading based on your usage.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Starting at ${price?.monthly}/mo
        </p>
        <div className="flex flex-col gap-3 mt-6">
          <Button onClick={handleUpgrade} className="w-full rounded-full bg-teal-500">
            Upgrade to {requiredTier}
          </Button>
          <Button variant="outline" onClick={handleDismiss} className="w-full rounded-full">
            Maybe later
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pricing/SoftPaywallSheet.tsx
git commit -m "feat(pricing): SoftPaywallSheet component with funnel logging"
```

---

### Task 14: /pricing Public Page

**Files:**
- Create: `src/pages/PricingPage.tsx`
- Create: `src/components/pricing/TierComparisonGrid.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create TierComparisonGrid component**

Reusable 4-tier comparison grid with:
- Tier cards: Free / Starter $199 / Growth $499 / Pro $999
- "Most Popular" badge on Growth
- Annual/Monthly toggle (20% discount for annual)
- Feature comparison rows from `TIER_FEATURES`
- Per-seat footnotes from `SEAT_LIMITS`
- CTA buttons per tier

- [ ] **Step 2: Create PricingPage**

Public page at `/pricing`:
- Uses TierComparisonGrid
- Enterprise "Talk to sales" section below
- Reads `?highlight=` query param to highlight a specific tier (from SoftPaywallSheet redirect)

- [ ] **Step 3: Register route in App.tsx**

Add public route:
```tsx
<Route path="/pricing" element={<PricingPage />} />
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/PricingPage.tsx src/components/pricing/TierComparisonGrid.tsx src/App.tsx
git commit -m "feat(pricing): public /pricing page with 4-tier comparison grid"
```

---

### Task 15: Stripe Edge Functions + Webhook Fix

**Files:**
- Create: `supabase/functions/create-checkout-session/index.ts`
- Create: `supabase/functions/create-billing-portal-session/index.ts`
- Create: `docs/STRIPE_PRICES.md`
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Create STRIPE_PRICES.md**

Document all test-mode Stripe Price IDs. These need to be created in the Stripe Dashboard first:
```markdown
# Stripe Price IDs (Test Mode)

## Monthly Base Prices
| Tier | Price ID | Amount |
|------|----------|--------|
| Starter | price_test_starter_monthly | $199/mo |
| Growth | price_test_growth_monthly | $499/mo |
| Pro | price_test_pro_monthly | $999/mo |

## Annual Base Prices (20% discount)
| Tier | Price ID | Amount |
|------|----------|--------|
| Starter | price_test_starter_annual | $159/mo ($1,908/yr) |
| Growth | price_test_growth_annual | $399/mo ($4,788/yr) |
| Pro | price_test_pro_annual | $799/mo ($9,588/yr) |

## Per-Seat Add-On Prices
| Tier | Price ID | Amount |
|------|----------|--------|
| Starter | price_test_seat_starter | $29/seat/mo |
| Growth | price_test_seat_growth | $39/seat/mo |
| Pro | price_test_seat_pro | $49/seat/mo |
```

**Note:** Replace `price_test_*` with actual Stripe Price IDs after creating them in the dashboard.

- [ ] **Step 2: Create create-checkout-session edge function**

Input: `{ tier, billing_period, org_id }`
Flow:
1. Auth: verify JWT, verify user is org owner
2. Look up or create Stripe Customer for org
3. Build line items: base price + per-seat price (quantity = current additional seats)
4. Store `tier` in session metadata
5. Create Checkout Session with success/cancel URLs
6. Return `{ checkout_url }`

- [ ] **Step 3: Create create-billing-portal-session edge function**

Input: `{ customer_id }` (matches existing OrgBillingPage call signature)
Flow:
1. Auth: verify JWT
2. Verify customer_id belongs to user's org (prevent IDOR)
3. Create Stripe Customer Portal session
4. Return `{ portal_url }`

- [ ] **Step 4: Extend sync-seat-count to update Stripe per-seat quantity**

In `supabase/functions/sync-seat-count/index.ts`, after updating `organizations.seat_count`, add logic to update the Stripe subscription's per-seat line item quantity:

```typescript
// After seat count update, sync to Stripe if subscription exists
if (org.stripe_subscription_id) {
  const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
  const seatItem = subscription.items.data.find(
    item => item.price.id.includes('seat')
  );
  if (seatItem) {
    await stripe.subscriptionItems.update(seatItem.id, {
      quantity: newSeatCount - includedSeats,
    });
  }
}
```

- [ ] **Step 5: Fix stripe-webhook tier derivation**

In `supabase/functions/stripe-webhook/index.ts` at line ~458, replace:
```typescript
const tier = subscription.status === 'active' ? 'pro' : 'free';
```

With:
```typescript
// Derive tier from subscription metadata or price ID
const PRICE_TO_TIER: Record<string, string> = {
  'price_test_starter_monthly': 'starter',
  'price_test_starter_annual': 'starter',
  'price_test_growth_monthly': 'growth',
  'price_test_growth_annual': 'growth',
  'price_test_pro_monthly': 'pro',
  'price_test_pro_annual': 'pro',
};

let tier = 'free';
if (subscription.status === 'active' && subscription.items?.data?.length) {
  const priceId = subscription.items.data[0].price.id;
  tier = PRICE_TO_TIER[priceId] || subscription.metadata?.tier || 'free';
}
```

- [ ] **Step 6: Build and verify**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add docs/STRIPE_PRICES.md supabase/functions/create-checkout-session/ supabase/functions/create-billing-portal-session/ supabase/functions/stripe-webhook/index.ts supabase/functions/sync-seat-count/index.ts
git commit -m "feat(pricing): Stripe checkout + billing portal + fix webhook tier + sync seat count"
```

---

### Task 16: Restaurant Brief Generator Hero

**Files:**
- Create: `src/components/dashboard/BriefGeneratorHero.tsx`
- Modify: `src/pages/BusinessDashboard.tsx`

- [ ] **Step 1: Create BriefGeneratorHero component**

Hero card for restaurant dashboard:
- Headline: "Generate a free campaign brief in 60 seconds."
- URL input field
- "Generate brief — free" CTA button (teal, full-width)
- On submit: calls existing `donny-campaign-generate` edge function
- Progress animation using `GenerateBriefProgress` component (from P5.2) if it exists, or a simple 4-step stagger
- On complete: brief reveal with sections + two CTAs
- Rate limit: uses `useTierGate('brief_generation')` — if not allowed, opens SoftPaywallSheet
- Records generation to `campaign_brief_generations` table

- [ ] **Step 2: Integrate into BusinessDashboard**

In `src/pages/BusinessDashboard.tsx`, add BriefGeneratorHero above existing stats grid:
```tsx
<BriefGeneratorHero orgId={activeOrg?.id} />
{/* existing dashboard content below */}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/BriefGeneratorHero.tsx src/pages/BusinessDashboard.tsx
git commit -m "feat(free-tier): restaurant brief generator hero (1/week free)"
```

---

### Task 17: Brand Free Trio Dashboard Hero

**Files:**
- Create: `src/components/dashboard/BrandFreeTrioHero.tsx`
- Modify: `src/pages/BrandDashboard.tsx`

- [ ] **Step 1: Create BrandFreeTrioHero component**

3-card hero grid:
- Card A (teal accent): Match Report — CTA calls the orchestrator via `openDonnyWithContext('Generate a creator match report for our brand')` which routes to the Campaign Agent. Rate limited: 1/month free via `useTierGate('match_report')`. **Note:** No separate `donny-match-report` edge function needed — the orchestrator's Campaign Agent handles this.
- Card B (pink accent): Brand Brief — CTA calls brief generation with brand persona variant. Rate limited: 1/week free.
- Card C (gray accent): Sponsored Templates — CTA opens template browser. Reads from `campaign_templates` table. Unlimited on free tier.
- Slim banner below: "These tools stay free forever." + [See plans → /pricing]

- [ ] **Step 2: Integrate into BrandDashboard**

In `src/pages/BrandDashboard.tsx`, add above existing content:
```tsx
<BrandFreeTrioHero orgId={activeOrg?.id} />
{/* existing dashboard content below */}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/BrandFreeTrioHero.tsx src/pages/BrandDashboard.tsx
git commit -m "feat(free-tier): brand free trio hero (match report + brief + templates)"
```

---

### Task 18: Anonymous Brief Lead Magnet + Landing Page

**Files:**
- Create: `supabase/functions/generate-anonymous-brief/index.ts`
- Create: `src/components/landing/BriefGeneratorPreview.tsx`
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Create generate-anonymous-brief edge function**

Thin wrapper that:
1. No auth required (public endpoint)
2. Extracts client IP from `x-forwarded-for` header (first IP, trimmed)
3. Checks `campaign_brief_generations` for existing generation from this IP today
4. If rate limited: returns `{ error: 'rate_limited', message: 'One free brief per day' }`
5. If allowed: calls the campaign generation logic directly (import from `donny-campaign-generate` shared module, or duplicate the core generation call)
6. Saves to `campaign_brief_generations` with null org_id/user_id, ip_address set
7. Returns the generated brief

- [ ] **Step 2: Create BriefGeneratorPreview component**

Embeddable on the landing page:
- URL input + "Generate free brief" CTA
- Calls `generate-anonymous-brief` (no auth header needed)
- Shows progress animation during generation
- On complete: brief preview + "Save this brief — sign up free" CTA
- On save: stores brief in `localStorage.setItem('pendingBrief', JSON.stringify(brief))`
- "Sign up free" navigates to `/auth`

- [ ] **Step 3: Embed in LandingPage**

In `src/pages/LandingPage.tsx`, add the `BriefGeneratorPreview` section after the hero:
```tsx
<BriefGeneratorPreview />
```

- [ ] **Step 4: Add pendingBrief check to post-signup flow**

In `src/pages/Index.tsx` (the post-auth redirect handler, lines 12-115), after the user's role and org are determined (around line 39 where it redirects to `/profile/onboarding`), add:

```typescript
const pendingBrief = localStorage.getItem('pendingBrief');
if (pendingBrief) {
  // Save to campaign_brief_generations with the new user's org_id
  const brief = JSON.parse(pendingBrief);
  await supabase.from('campaign_brief_generations').insert({
    org_id: activeOrg?.id,
    user_id: user.id,
    brief_jsonb: brief,
  });
  localStorage.removeItem('pendingBrief');
  // Navigate to dashboard where the brief will be visible
}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-anonymous-brief/ src/components/landing/BriefGeneratorPreview.tsx src/pages/LandingPage.tsx
git commit -m "feat(free-tier): anonymous brief lead magnet on landing page"
```

---

## Final Verification

After all 18 tasks:

- [ ] **Full build check:** `npm run build` — zero errors, zero warnings
- [ ] **Route check:** Verify `/pricing` renders, `/help` still works, all dashboard routes load
- [ ] **Donny check:** Open Donny via mobile nav and desktop panel — orchestrator responds
- [ ] **Tour check:** Fresh signup → tour fires once on dashboard → dismiss → navigate → no re-trigger
- [ ] **Coachmark check:** First visit to campaign detail as creator → apply_with_donny coachmark appears → "Got it" → never again
- [ ] **Pricing check:** Free restaurant → generate brief → second attempt within 7 days → soft paywall
- [ ] **Stripe check:** Click upgrade on soft paywall → /pricing page → select tier → Stripe Checkout test card
- [ ] **Billing portal check:** OrgBillingPage → "Manage subscription" → Stripe Customer Portal opens

---

## Commit Summary

| # | Message | Workstream |
|---|---------|------------|
| 1 | `schema(donny): pgvector extension + donny_knowledge table + HNSW index` | WS1 |
| 2 | `seed(donny): knowledge base chunks for RAG (60-80 entries)` | WS1 |
| 3 | `feat(donny): generate-embedding edge function + backfill script` | WS1 |
| 4 | `feat(donny): orchestrator edge function with 5 sub-agent tools + RAG` | WS1 |
| 5 | `feat(donny): wire orchestrator into DonnyProvider, add openDonnyWithContext, delete old help UI` | WS1 |
| 6 | `fix(guidance): tour 3-guard system + data-tour attributes on shared components` | WS2 |
| 7 | `feat(guidance): re-integrate DCTour on dashboard home pages (3 roles)` | WS2 |
| 8 | `feat(guidance): wire 6 coachmarks to actual pages` | WS2 |
| 9 | `feat(guidance): wire 6 WhyExpanders to match score, take rate, billing, settings, tiers` | WS2 |
| 10 | `feat(guidance): DragonShareExplainer on inboxes + Talk to Donny CTA on help articles` | WS2 |
| 11 | `schema(pricing): brief_generations + campaign_templates + funnel_events tables` | WS3 |
| 12 | `feat(pricing): tier-features config + useTierGate hook` | WS3 |
| 13 | `feat(pricing): SoftPaywallSheet component with funnel logging` | WS3 |
| 14 | `feat(pricing): public /pricing page with 4-tier comparison grid` | WS3 |
| 15 | `feat(pricing): Stripe checkout + billing portal + fix webhook tier + sync seat count` | WS3 |
| 16 | `feat(free-tier): restaurant brief generator hero (1/week free)` | WS3 |
| 17 | `feat(free-tier): brand free trio hero (match report + brief + templates)` | WS3 |
| 18 | `feat(free-tier): anonymous brief lead magnet on landing page` | WS3 |
