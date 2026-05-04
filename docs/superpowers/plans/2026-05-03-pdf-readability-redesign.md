# PDF Readability Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite two HTML documents (Cost Architecture + Social Media Integration) for readability — conversational tone, audience signposting, developer content moved to appendices, DragonCandy logo in headers.

**Architecture:** Both HTML files are self-contained documents rendered in a browser and printed to PDF. No build system, no templating — direct HTML edits. The logo is embedded as a base64 data URI so PDFs remain self-contained. Content is reorganized (not deleted) — technical sections move to appendices at the end of each document.

**Tech Stack:** HTML, CSS (inline `<style>`), Mermaid.js diagrams, base64 image encoding

**Spec:** `docs/superpowers/specs/2026-05-03-pdf-readability-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/assets/Transparent_DragonCandy_logo.png` | Read (source for base64) | Logo source |
| `docs/pdf/donny-ai-cost-architecture.html` | Modify | Cost Architecture document — full readability pass |
| `docs/pdf/social-media-integration.html` | Modify | Social Media Integration document — full readability pass |

No new files are created. Both HTML files are modified in place.

---

### Task 1: Generate Base64 Logo Data URI

**Files:**
- Read: `src/assets/Transparent_DragonCandy_logo.png`

This task produces the base64 string used by Tasks 2 and 4. Run it first and save the output.

- [ ] **Step 1: Convert the logo PNG to a base64 data URI**

Run:
```bash
base64 -w 0 src/assets/Transparent_DragonCandy_logo.png | head -c 50
```

Then generate the full data URI string:
```bash
echo -n "data:image/png;base64," > /tmp/logo-base64.txt && base64 -w 0 src/assets/Transparent_DragonCandy_logo.png >> /tmp/logo-base64.txt
```

- [ ] **Step 2: Verify the base64 output is valid**

Run:
```bash
wc -c /tmp/logo-base64.txt
```

Expected: ~188,000 characters (140KB PNG → ~187KB base64). If the file is empty or under 1,000 characters, the encoding failed.

- [ ] **Step 3: Verify the data URI renders correctly**

Create a quick test HTML:
```bash
echo "<html><body><img src=\"$(cat /tmp/logo-base64.txt)\" style=\"width:160px\" /></body></html>" > /tmp/logo-test.html
```

Open `/tmp/logo-test.html` in a browser. Confirm the DragonCandy logo renders at ~160px width with a transparent background. Delete the test file after confirming.

---

### Task 2: Cost Architecture — Logo and Header Redesign

**Files:**
- Modify: `docs/pdf/donny-ai-cost-architecture.html`

- [ ] **Step 1: Replace the emoji logo block with the real logo**

Find the existing logo block in the title page (around line 318):
```html
<div class="logo-bar">
    <div class="dragon-mark">🐉</div>
    <div class="brand-name">Dragon<span>Candy</span></div>
</div>
```

Replace with:
```html
<div class="logo-bar">
    <img src="DATA_URI_HERE" alt="DragonCandy" style="width: 160px; height: auto;" />
</div>
```

Where `DATA_URI_HERE` is the full base64 data URI from Task 1.

- [ ] **Step 2: Update the logo-bar CSS to center the image**

Find the existing `.title-page .logo-bar` CSS rule and replace:
```css
.title-page .logo-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 2rem;
}
```

With:
```css
.title-page .logo-bar {
    display: flex;
    justify-content: center;
    margin-bottom: 2rem;
}
```

Remove the now-unused `.title-page .dragon-mark` and `.title-page .brand-name` CSS rules.

- [ ] **Step 3: Add the audience guide block after the meta-grid**

Find the closing `</div>` of the `meta-grid` div (around line 347), and after the closing `</div>` of the `title-page` div, insert:

```html
<div class="callout" style="margin-top: 2rem; border-left-color: #F9A8D4; background: #fff5f9;">
    <p style="margin-bottom: 0.5rem;"><strong>For Joe, Juwan, and Dame:</strong> The Executive Summary and Sections 1–3 give you the full picture — decisions, costs, revenue impact. You can stop there.</p>
    <p style="margin-bottom: 0;"><strong>For the dev team:</strong> Everything above, plus the Appendices at the end — schemas, API patterns, and implementation reference.</p>
</div>
```

- [ ] **Step 4: Open in browser and verify**

Open `docs/pdf/donny-ai-cost-architecture.html` in a browser. Confirm:
- Logo renders centered above the title at ~160px width
- Audience guide block appears below the title page with pink left border
- No broken layout or missing styles

- [ ] **Step 5: Commit**

```bash
git add docs/pdf/donny-ai-cost-architecture.html
git commit -m "docs: add DragonCandy logo and audience guide to cost architecture PDF"
```

---

### Task 3: Cost Architecture — Executive Summary Rewrite

**Files:**
- Modify: `docs/pdf/donny-ai-cost-architecture.html`

- [ ] **Step 1: Rewrite the opening paragraph**

Find the Executive Summary opening paragraph (around line 356):
```html
<p>
  Donny AI is DragonCandy's intelligence layer — powering campaign generation, creator matching,
  social media management, and conversational assistance across every surface of the platform.
  As Donny's capabilities expand (social media integration, Chrome extension, SMS, embeddable SDK),
  AI API costs scale with usage. This document establishes the economic governance that keeps
  Donny viable at every stage of growth — from the current pre-revenue phase through a multi-million
  dollar ARR business.
</p>
```

Replace with:
```html
<p>
  Donny gets smarter and does more every month — campaign generation, creator matching, social media
  management, chat assistance. But every AI call costs money, and without rules, those costs grow
  faster than revenue. This document lays out how we keep Donny's economics healthy from pre-revenue
  through multi-million dollar ARR.
</p>
```

- [ ] **Step 2: Rewrite the core principle callout**

Find the callout box (around line 365):
```html
<div class="callout">
  <strong>Core principle:</strong> Use the cheapest model that produces acceptable output for each task,
  make token budgets invisible to users, and tie AI spend to revenue so the economics improve as
  the business scales. Every primary user flow under 10 keystrokes by Month 6 — Donny's cost
  architecture must never create hesitation that works against that north star.
</div>
```

Replace with:
```html
<div class="callout">
  <strong>The rule is simple:</strong> Use the cheapest AI model that gets the job done for each task,
  keep usage invisible to users so they never hesitate to use Donny, and cap total AI spend at 15%
  of revenue so the economics get better as the business grows.
</div>
```

- [ ] **Step 3: Remove the "What Donny AI Does" subsection**

Find the "What Donny AI Does" heading and the list that follows (around lines 372–382). Remove the entire block from `<h3>What Donny AI Does</h3>` through the closing `</ul>`. The reader already knows what Donny does by the time they open this doc.

- [ ] **Step 4: Rewrite "The Problem" section**

Find the existing "The Problem" section (around line 384). Replace:
```html
<h3>The Problem</h3>
<p>
  Without economic governance, Donny's costs scale linearly with platform adoption — and without
  model routing, the default is to use expensive frontier models for tasks that cheap models handle
  equally well. The current implementation uses Sonnet (at ~$3/$15 per million tokens) for scheduling
  decisions and creator scoring that Haiku (at ~$0.25/$1.25 per million tokens) handles perfectly well.
  That's a 12x cost difference on tasks representing the majority of Donny's call volume.
</p>
```

With:
```html
<h3>The Problem</h3>
<p>
  Right now, Donny uses the expensive model for everything — including simple tasks like picking a
  posting time or scoring a creator, where the cheap model works just as well. That's a 12x cost
  difference on tasks that make up the majority of Donny's call volume. Without routing rules, costs
  scale with adoption and we lose control of margins.
</p>
```

- [ ] **Step 5: Rewrite "The Solution" section**

Find the existing "The Solution" section (around line 393). Replace:
```html
<h3>The Solution</h3>
<p>
  Three interconnected mechanisms: a <strong>model routing matrix</strong> that assigns the cheapest
  acceptable model to each task, an <strong>invisible credit system</strong> that degrades gracefully
  before hitting any wall, and a <strong>revenue cap</strong> with a pre-revenue floor that keeps Donny
  running while the business finds its footing. Together, these keep AI spend under 15% of revenue
  at every scale point.
</p>
```

With:
```html
<h3>The Solution</h3>
<p>
  Three things working together: a <strong>routing table</strong> that sends every task to the cheapest
  model that handles it, an <strong>invisible credit system</strong> that gradually dials Donny back
  instead of hitting a wall, and a <strong>revenue cap</strong> ($250/mo floor, 15% of revenue after that)
  so AI spend never outpaces the business.
</p>
```

- [ ] **Step 6: Simplify the Core Decisions table rationale column**

Find the Core Decisions Summary table (around line 402). Replace each rationale cell:

| Old Rationale | New Rationale |
|---|---|
| "Cheapest acceptable model per task; most Donny tasks are pattern-matching suited to Haiku" | "Most of what Donny does is simple and repetitive — the cheap model handles it fine" |
| "Visible credits create friction that works against 'less typing' north star" | "If users see a credit count, they'll hesitate to use Donny — that kills the whole point" |
| "Hard dollar floor keeps Donny running pre-revenue; percentage takes over as revenue scales" | "$250/mo keeps Donny alive before we have revenue; percentage kicks in as revenue grows" |
| "One fewer billing relationship; embeddings too cheap to justify migration cost" | "One AI vendor bill instead of two; embeddings are pennies, not worth moving" |
| "Data flywheel funds eventual escape from per-token API economics" | "Once we have enough data, we can train our own cheap models and stop paying per-call" |

- [ ] **Step 7: Open in browser and verify**

Open the file in a browser. Confirm the executive summary reads conversationally and the decisions table rationale column uses plain English. The KPI cards should remain unchanged.

- [ ] **Step 8: Commit**

```bash
git add docs/pdf/donny-ai-cost-architecture.html
git commit -m "docs: rewrite cost architecture executive summary in conversational tone"
```

---

### Task 4: Cost Architecture — Main Body Tone Pass

**Files:**
- Modify: `docs/pdf/donny-ai-cost-architecture.html`

This task rewrites the main body sections in conversational tone while preserving all diagrams and tables.

- [ ] **Step 1: Rewrite Model Routing Matrix intro (Section 1)**

Find the Section 1 opening paragraph (around line 513):
```html
<p>
  Every Donny AI call routes through a tier system. Model selection is a lookup against a static
  routing table, not a dynamic decision. This eliminates the risk of expensive model calls being
  made for trivial tasks.
</p>
```

Replace with:
```html
<p>
  Every time Donny does something, the system checks a routing table to pick the right AI model.
  It's a simple lookup — not a judgment call. This means expensive models never get used for
  simple tasks by accident.
</p>
```

- [ ] **Step 2: Simplify the Tier Definitions table "When to Use" column**

In the tier definitions table (around line 519), update the "When to Use" cells:

| Tier | Old | New |
|---|---|---|
| T0 | "OAuth flows, analytics fetching, media uploads, scheduled post dispatch (pre-written content), account connections" | "Anything that doesn't need AI — connecting accounts, fetching data, sending already-written posts" |
| T1 | "Pattern-matching tasks: caption/hashtag generation, reply drafting, nudge framing, scheduling decisions, quick chip generation, platform-specific formatting, simple knowledge base Q&A" | "Simple, repetitive tasks — writing captions, picking hashtags, drafting replies, choosing posting times, formatting for different platforms" |
| T2 | "Multi-step reasoning: campaign wizard conversations, multi-platform cross-posting orchestration, content calendar planning, sponsorship ROI analysis, creator matching/scoring, brand guidelines enforcement" | "Tasks that need real thinking — campaign conversations, cross-platform coordination, ROI analysis, matching creators to campaigns, checking brand guidelines" |
| T3 | "Complex multi-tool conversations with full tool use (donny-chat pattern), campaign-from-URL generation with large context windows" | "Full Donny chat sessions where he's using multiple tools at once, or generating a campaign from a restaurant's URL" |

- [ ] **Step 3: Simplify the cost multiplier callout**

Find the cost multiplier callout (around line 566):
```html
<div class="callout">
  <strong>Cost multiplier context:</strong> T1 Haiku costs approximately 12× less than T2 Sonnet for input tokens and 12× less for output. Routing a task from T2 to T1 on a function called 10,000 times per month represents a meaningful line-item reduction — and most Donny tasks are pattern-matching, not multi-step reasoning.
</div>
```

Replace with:
```html
<div class="callout">
  <strong>Why this matters:</strong> The cheap model (Haiku) costs 12x less than the smart model (Sonnet). Most of what Donny does is simple — so routing those tasks to Haiku instead of Sonnet saves real money at scale.
</div>
```

- [ ] **Step 4: Rewrite the Edge Function Migration table "Action & Rationale" column in plain English**

In the migration table (around line 570), update each "Action & Rationale" cell to conversational language. Examples:

| Function | Old | New |
|---|---|---|
| `donny-chat` | "No change — complex 21-tool conversations require Sonnet Extended" | "No change — this is Donny's most complex mode, needs the full model" |
| `donny-schedule` | "**Downgrade:** Scheduling optimization is pattern matching on time slots and engagement data — no multi-step reasoning required" | "**Downgrade:** Picking the best posting time is simple math — doesn't need the expensive model" |
| `donny-campaign-generate` | "**Migrate:** GPT-4o → Sonnet with tool use for JSON structure. Campaign generation is high-value, justifies Sonnet. Eliminates one API vendor." | "**Migrate:** Moving from GPT-4o to Claude Sonnet. Campaign generation is high-value work that justifies the smarter model — and it gets us down to one AI vendor" |
| `donny-creator-match` | "**Migrate + Downgrade:** GPT-4o → Haiku. Scoring against criteria is pattern matching — structured prompt with JSON tool output is sufficient." | "**Migrate + Downgrade:** GPT-4o to Claude Haiku. Scoring creators against campaign criteria is straightforward — the cheap model handles it" |

Apply the same plain-English treatment to all rows in this table.

- [ ] **Step 5: Rewrite Section 2 (Invisible Credit System) intro and design principle**

Find the Section 2 opening (around line 710). Replace the design principle paragraph:
```html
<p>
  Users never see token counts, model names, tier labels, action balances, or a usage meter.
  The only visible moment is the Stage 3 upgrade prompt — and even that is framed as Donny
  talking to the user, not a system wall.
</p>
```

With:
```html
<p>
  Users never see how much AI they're using. Period. No token counts, no credit meters, no
  model names. The only time a user notices anything is when they've used their whole monthly
  budget — and even then, it's Donny talking to them, not a system error.
</p>
```

Replace the "Why invisible?" callout:
```html
<div class="callout pink">
  <strong>Why invisible?</strong> Visible credits create "should I spend a credit on this?" hesitation.
  That hesitation directly undermines the "less typing = more margin" north star...
</div>
```

With:
```html
<div class="callout pink">
  <strong>Why invisible?</strong> The moment users see a credit counter, they start asking "is this worth a credit?" before every action. That kills the whole point of Donny — less typing, more doing. If users are thinking about cost, we've already failed.
</div>
```

- [ ] **Step 6: Rewrite Section 3 (Revenue Cap) intro**

Find the Section 3 Rule callout (around line 979). Replace:
```html
<div class="callout dark">
  <strong>AI API spend is hard-capped at 15% of monthly revenue, with a $250/month pre-revenue floor.</strong>
  <p>
    This mirrors the kill-switch discipline from PROJECT_CONTEXT: AI spend is treated like headcount —
    it grows with revenue, not ahead of it.
  </p>
</div>
```

With:
```html
<div class="callout dark">
  <strong>AI spend is capped at 15% of monthly revenue. Before we have revenue, the floor is $250/month.</strong>
  <p>
    Same discipline as headcount — it grows with the business, not ahead of it. At $250/mo with mostly
    Haiku routing, we can serve far more users than we have today.
  </p>
</div>
```

Rewrite the Pre-Revenue Floor Logic paragraph:
```html
<p>
  At $0 revenue, 15% = $0, which is not functional. The <strong>$250/month floor</strong> holds until
  monthly revenue exceeds <strong>$1,667</strong>...
</p>
```

With:
```html
<p>
  15% of $0 is $0, which obviously doesn't work. So we set a <strong>$250/month floor</strong> that
  holds until revenue passes <strong>$1,667/month</strong> — at that point, 15% naturally exceeds $250
  and the percentage takes over. At Haiku-dominant routing, $250 buys roughly 50–100 million tokens
  per month — way more than our current ~30 users could burn through.
</p>
```

- [ ] **Step 7: Rewrite the alert threshold table heading and Section 4 (Vendor Consolidation)**

Rename Section 3.3 from "Alert Threshold Table" to "What Happens as We Approach the Cap."

For Section 4, rewrite the opening paragraph:
```html
<p>
  Two edge functions currently use OpenAI's GPT-4o. Migrating both to Anthropic's Claude eliminates
  one billing relationship for generative AI tasks, enables consistent model routing governance,
  and simplifies secrets management to a single Anthropic API key (plus OpenAI for embeddings only).
</p>
```

With:
```html
<p>
  Two of Donny's backend functions still use OpenAI's GPT-4o. We're moving both to Claude — that gets
  us down to one AI vendor for all generative work (we keep OpenAI just for embeddings, which cost
  pennies). Simpler billing, one API key to manage, and consistent routing rules across everything.
</p>
```

Shorten the Medium-Term embeddings paragraph and Long-Term fine-tuning section to one paragraph each. Replace the detailed rationale with conversational summaries:

Medium-Term:
```html
<p>
  OpenAI's embedding model costs $0.02 per million tokens — basically free. Re-indexing all our
  knowledge data to switch providers would cost engineering time with no real savings. The code
  is already isolated, so if Anthropic releases their own embedding model, it's a one-function swap.
</p>
```

Long-Term:
```html
<p>
  Once we've run 1,000–5,000 campaigns, we'll have enough data to train our own small AI model
  for Donny's most common tasks (caption writing, hashtag generation, reply drafting). A fine-tuned
  model on our own infrastructure could cut per-call cost by 90%+ for these tasks. The cost ledger
  we're building now is what makes that decision evidence-based instead of a guess.
</p>
```

- [ ] **Step 8: Rewrite Section 6 (Social Media Alignment) intro**

Replace:
```html
<p>
  The Outstand social media integration inherits this cost architecture. The following definitions
  align social media features with the economic governance defined in this spec.
  All social media AI calls flow through the same model routing matrix.
</p>
```

With:
```html
<p>
  The social media integration uses the same routing rules. Every social media AI call goes through
  the same model selection table — no special cases, no exceptions. Here's how social features map
  to tiers.
</p>
```

- [ ] **Step 9: Simplify the Guiding Principles cards (Section 8)**

Rewrite each principle card's `<p>` text in direct, conversational language. Examples:

"Cheapest Acceptable Model" card:
```html
<p>Start with Haiku. Only use Sonnet when the task genuinely needs it. "It feels safer" is not a reason to use the expensive model.</p>
```

"Invisible Economics" card:
```html
<p>Users experience Donny's intelligence, not his price tag. No meters, no credit counts, no model names anywhere in the UI.</p>
```

"Ledger-First" card:
```html
<p>Every AI call gets logged with its cost before the response goes back to the user. No decisions without data.</p>
```

Apply the same treatment to all 7 principle cards — keep each to 1-2 sentences, plain English.

- [ ] **Step 10: Open in browser and verify the full document**

Read through the entire document in a browser. Check that:
- Every paragraph in the main body reads conversationally
- No orphaned technical jargon in stakeholder-facing sections
- Tables still render correctly
- Mermaid diagrams still render
- Callout boxes have appropriate content

- [ ] **Step 11: Commit**

```bash
git add docs/pdf/donny-ai-cost-architecture.html
git commit -m "docs: rewrite cost architecture main body in conversational tone"
```

---

### Task 5: Cost Architecture — Relocate Technical Sections to Appendices

**Files:**
- Modify: `docs/pdf/donny-ai-cost-architecture.html`

- [ ] **Step 1: Move Section 1.3 (Model Selection Decision Flow) to appendix**

Cut the entire block from `<h3>1.3 Model Selection Decision Flow</h3>` through its closing mermaid diagram (including the `<div class="mermaid-wrap">` container and the developer note callout below it). Save it for insertion in Step 4.

Also cut Section 1.4 (Fallback Rule) — the heading, paragraph, and warning callout. Save for Step 4.

- [ ] **Step 2: Move Section 5 (Data Architecture) to appendix**

Cut the entire `<div class="page-break">` block for Section 5 — from `<h2><span class="section-number">5</span>Data Architecture</h2>` through the closing `</div>` of that page-break div. This includes both table schemas (`donny_cost_ledger` and `donny_usage`), the RLS notes, indexes, and the data flow sequence diagram. Save for Step 4.

- [ ] **Step 3: Move the existing Appendix (Edge Function Pattern) content**

The current appendix section starting at `<h2>Appendix: Edge Function Integration Pattern</h2>` will become Appendix B. Save its content for restructuring in Step 4.

- [ ] **Step 4: Create the appendix structure at the bottom of the document**

Before the closing footer `<p style="text-align:center...">`, insert the reorganized appendix content:

```html
<!-- ═══════════════════════════════════════════════════════════
     APPENDICES — DEVELOPER REFERENCE
════════════════════════════════════════════════════════════ -->
<div class="page-break">
<h2 style="border-bottom-color: #1a1a2e;">Appendices — Developer Reference</h2>

<div class="callout" style="border-left-color: #1a1a2e; background: #f0f1f8;">
    <p style="margin-bottom: 0;"><strong>The sections below are for the dev team.</strong> They contain database schemas, routing logic diagrams, code patterns, and migration checklists. If you're reading this as a stakeholder, you can stop here — the main document covered everything you need.</p>
</div>

<h2>Appendix A: Model Routing Logic</h2>

<!-- Paste the Model Selection Decision Flow (Section 1.3) mermaid diagram here -->
<!-- Paste the Fallback Rule (Section 1.4) content here -->

<h2>Appendix B: Database Schema</h2>

<!-- Paste the full Section 5 (Data Architecture) content here, including:
     - donny_cost_ledger table definition
     - donny_usage table definition
     - RLS policies and indexes
     - Data flow sequence diagram -->

<h2>Appendix C: Edge Function Integration Pattern</h2>

<!-- Paste the existing Appendix content here (pseudocode, function signatures, migration checklist) -->

</div>
```

- [ ] **Step 5: Renumber sections in the main body**

After removing Section 5 (Data Architecture) from the main body, the section numbers shift:
- Section 1: Model Routing Matrix (unchanged)
- Section 2: Invisible Credit System (unchanged)
- Section 3: Revenue Cap Governance (unchanged)
- Section 4: Vendor Consolidation (unchanged)
- Section 5: Social Media Integration Alignment (was Section 6)
- Section 6: Success Metrics (was Section 7)
- Section 7: Guiding Principles (was Section 8)

Update the `<span class="section-number">` badges accordingly.

- [ ] **Step 6: Open in browser and verify**

Check that:
- Main body flows without gaps — no references to "see Section 5" that now point to an appendix
- Appendices render correctly with all tables, diagrams, and code blocks
- Page breaks are logical for PDF printing
- The "Developer Reference" header is visible and clear

- [ ] **Step 7: Commit**

```bash
git add docs/pdf/donny-ai-cost-architecture.html
git commit -m "docs: relocate technical sections to appendices in cost architecture PDF"
```

---

### Task 6: Social Media Integration — Logo and Header Redesign

**Files:**
- Modify: `docs/pdf/social-media-integration.html`

- [ ] **Step 1: Replace the text-pill logo with the real logo**

Find the existing logo bar in the title page (around line 378):
```html
<div class="logo-bar">
    <span class="logo-pill teal">DragonCandy</span>
    <span class="logo-x">×</span>
    <span class="logo-pill pink">Outstand.so</span>
</div>
```

Replace with:
```html
<div class="logo-bar">
    <img src="DATA_URI_HERE" alt="DragonCandy" style="width: 140px; height: auto;" />
    <span class="logo-x">×</span>
    <span class="logo-pill pink">Outstand.so</span>
</div>
```

Where `DATA_URI_HERE` is the full base64 data URI from Task 1. The logo sits to the left of the "× Outstand.so" text.

- [ ] **Step 2: Update the logo-bar CSS for proper alignment**

Find the `.title-page .logo-bar` CSS rule and ensure it accommodates the image + text:
```css
.title-page .logo-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 48px;
}
```

This should already work — the `align-items: center` will vertically center the logo with the "× Outstand.so" text. No change needed if the existing CSS already has this.

Remove the `.logo-pill.teal` CSS rule since it's no longer used. Keep `.logo-pill.pink` for the Outstand badge.

- [ ] **Step 3: Add the audience guide block after the meta-grid**

Find the closing `</div>` of the `meta-grid` div, and after the closing `</div>` of the `title-page` div, insert:

```html
<div class="callout callout-pink" style="margin-bottom: 3rem;">
    <p style="margin-bottom: 0.5rem;"><strong>For Joe, Juwan, and Dame:</strong> The Executive Summary and Sections 1–3 (Restaurant, Creator, Brand roles) give you the full picture. Implementation phases and success metrics are also worth a look. You can skip the technical appendices at the end.</p>
    <p style="margin-bottom: 0;"><strong>For the dev team:</strong> Everything above, plus the Appendices — API references, database schemas, and technical architecture details.</p>
</div>
```

- [ ] **Step 4: Open in browser and verify**

Open `docs/pdf/social-media-integration.html` in a browser. Confirm:
- DragonCandy logo renders at ~140px to the left of "× Outstand.so"
- Audience guide block appears below the title page with pink left border
- No broken layout

- [ ] **Step 5: Commit**

```bash
git add docs/pdf/social-media-integration.html
git commit -m "docs: add DragonCandy logo and audience guide to social media PDF"
```

---

### Task 7: Social Media Integration — Executive Summary Tone Pass

**Files:**
- Modify: `docs/pdf/social-media-integration.html`

- [ ] **Step 1: Rewrite the executive summary opening paragraph**

Find the section-intro paragraph (around line 441):
```html
<p class="section-intro">
    DragonCandy connects restaurants, creators, and brands for content delivery — but today, the social media
    posting that makes that content valuable happens entirely outside the platform. This integration closes the loop:
    content gets created, approved, <em>and published</em> within DragonCandy, with Donny AI reducing friction to near-zero.
</p>
```

Replace with:
```html
<p class="section-intro">
    DragonCandy connects restaurants, creators, and brands for content delivery — but right now, the social media
    posting that makes that content valuable happens entirely outside the platform. This integration closes the loop:
    content gets created, approved, <em>and published</em> inside DragonCandy, with Donny handling the posting so
    nobody has to leave the platform.
</p>
```

- [ ] **Step 2: Tighten "The Gap" paragraph**

The existing "The Gap" content is already strong. Simplify one sentence — find:
```html
Three parties, three separate workflows, zero coordination, and no data flowing back to the platform
that made the content possible.
```

Replace with:
```html
Three parties, three separate workflows, zero coordination, zero data flowing back.
```

- [ ] **Step 3: Simplify the Core Decisions table rationale column**

In the Core Decisions table, update each rationale cell:

| Old | New |
|---|---|
| "Complete vision for dev team, even if phased delivery" | "Full picture so the team knows where we're headed, even though we build it in phases" |
| "Simplest foundation; delegated access designed for future phases" | "Start simple — each user connects their own accounts. Cross-account posting comes later" |
| "Aligns with 'less typing' north star; Outstand MCP enables natural language control" | "Talk to Donny instead of clicking through menus — that's the whole point of DragonCandy" |
| "Restaurants get value first; each phase reuses foundation from the last" | "Restaurants get value first. Each phase builds on what came before instead of starting over" |
| "Social hooks at campaign creation, sponsorship, matching, approval, and completion" | "Social posting is woven into every stage of a campaign, not bolted on at the end" |
| "6 of 15 features T1/Haiku, 6 T2/Sonnet, 3 T0/No AI — cuts social AI cost ~50% vs. Sonnet-for-everything" | "Uses the cost architecture to route each feature to the right model — cuts social AI cost in half" |

- [ ] **Step 4: Open in browser and verify**

Read through the executive summary in the browser. Check that it reads naturally and all tables render correctly.

- [ ] **Step 5: Commit**

```bash
git add docs/pdf/social-media-integration.html
git commit -m "docs: rewrite social media executive summary in conversational tone"
```

---

### Task 8: Social Media Integration — Main Body Tone Pass

**Files:**
- Modify: `docs/pdf/social-media-integration.html`

- [ ] **Step 1: Rewrite Section 1 (Restaurant) intro and feature descriptions**

Find the restaurant section-intro paragraph:
```html
<p class="section-intro">
    For a restaurant operator, social media is non-negotiable — but managing it manually across Instagram, TikTok,
    Google Business, and Facebook is a daily time tax that pulls owners away from running their business.
    DragonCandy eliminates that tax. The restaurant connects accounts once, and Donny handles the rest.
</p>
```

This already reads well — keep it. Focus on the feature table descriptions. Simplify phrases like:

| Old | New |
|---|---|
| "critical for local search visibility and the #1 discovery channel for restaurants" | "this is how people find restaurants on Google — it's the #1 discovery channel" |
| "Engagement, reach, follower growth, best posting times — pulled from Outstand and cached in Supabase. Feeds directly into existing ROI Dashboard." | "Engagement, reach, follower growth, best posting times — all feeding into the ROI Dashboard you already have" |

- [ ] **Step 2: Tighten Section 2 (Creator) prose**

The creator flywheel diagram and value prop are already strong. Tighten the section-intro:

Find:
```html
<p class="section-intro">
    Creators on DragonCandy are already producing high-quality content. The social integration ensures that
    work compounds: campaign content grows the creator's personal audience, and that audience growth feeds
    back into stronger DragonCandy metrics — creating a flywheel that rewards consistent creators with more
    campaigns at higher rates.
</p>
```

Replace with:
```html
<p class="section-intro">
    Creators on DragonCandy are already producing great content. This integration makes sure that work compounds —
    campaign content grows the creator's personal audience, that audience growth shows up on their DragonCandy
    profile, and stronger profiles mean more campaigns at higher rates. It's a flywheel.
</p>
```

- [ ] **Step 3: Tighten Section 3 (Brand) prose**

Find:
```html
<p class="section-intro">
    Brands sponsoring campaigns on DragonCandy get a multiplier they can't get anywhere else: one investment,
    three content pipelines, and unified performance data across all of them. Donny handles the amplification;
    brands get the ROI report.
</p>
```

This already reads well — keep as-is.

- [ ] **Step 4: Rewrite Section 4 (Donny AI) intro**

Find:
```html
<p class="section-intro">
    Donny AI is the intelligence layer that makes social media management feel like having a personal assistant.
    Every social action is achievable through natural language — no UI navigation required. The Outstand MCP
    server's 25 tools give Donny the ability to post, schedule, analyze, reply, and manage social accounts on
    behalf of any role.
</p>
```

Replace with:
```html
<p class="section-intro">
    Donny is the personal assistant that makes social media management feel effortless. Instead of navigating
    menus and filling out forms, you just tell Donny what to do — "post today's special to Instagram" — and
    he handles the rest. Behind the scenes, Donny uses 25 social media tools to post, schedule, analyze,
    reply, and manage accounts for any role.
</p>
```

- [ ] **Step 5: Simplify Section 6 (Implementation Phases) deliverable descriptions**

In the Phase 1 table, rewrite each deliverable description:

| Old | New |
|---|---|
| "Outstand API client & encrypted token storage in Supabase Edge Functions. Establishes the proxy pattern all future phases inherit." | "Build the connection to Outstand's API with secure token storage. This becomes the foundation everything else runs on." |
| "Donny MCP integration — wire Outstand's 25-tool MCP server into Donny with role-aware system prompting. Donny can now post, schedule, and analyze via natural language." | "Connect Donny to Outstand so he can post, schedule, and pull analytics through natural language commands." |
| "Account connection UI — OAuth flow in restaurant settings, connected account display with platform status indicators." | "The settings page where restaurants connect their Instagram, TikTok, Google Business, and Facebook accounts." |
| "Post creation & scheduling — Donny-first composer, manual fallback UI, multi-platform publish, content calendar with drag-and-drop." | "Post composer and content calendar. Tell Donny what to post, or do it manually — either way, it goes to all your platforms." |
| "Analytics & engagement — per-post and account-level analytics display, engagement hub with unified inbox, ROI Dashboard integration." | "Analytics dashboard and unified inbox for comments across all platforms. Feeds into the ROI Dashboard." |

Apply similar simplification to Phase 2, 3, and 4 tables — replace technical descriptions with plain English. Keep it concise.

- [ ] **Step 6: Rewrite Section 5 (Technical Architecture) intro**

Find:
```html
<p class="section-intro">
    The technical design follows three core principles: all social API calls are proxied through Edge Functions
    (never direct from client), OAuth tokens are encrypted at rest with AES-256, and new tables follow existing
    Row Level Security patterns established in the codebase.
</p>
```

Replace with:
```html
<p class="section-intro">
    Three rules govern the technical design: social API calls always go through our backend (never direct from the browser),
    login tokens are encrypted, and all new database tables follow the same security patterns we already use.
</p>
```

- [ ] **Step 7: Rewrite Section 8 (Cost Governance) intro**

Find:
```html
<p class="section-intro">
    This spec inherits token budgets and model routing from the <strong>Donny AI Cost Architecture spec</strong>
    (docs/superpowers/specs/2026-05-03-donny-ai-cost-architecture-design.md). The model routing decisions below
    are not suggestions — they are the governing routing matrix for every social media AI call.
</p>
```

Replace with:
```html
<p class="section-intro">
    The social integration uses the same cost rules as all of Donny — defined in the
    <strong>Donny AI Cost Architecture</strong> document. The routing decisions below aren't suggestions.
    They're the rules every social media AI call follows.
</p>
```

- [ ] **Step 8: Open in browser and verify**

Read through the full document. Check that all prose reads conversationally, tables render correctly, Mermaid diagrams still work, and the flow from section to section feels natural.

- [ ] **Step 9: Commit**

```bash
git add docs/pdf/social-media-integration.html
git commit -m "docs: rewrite social media main body sections in conversational tone"
```

---

### Task 9: Social Media Integration — Relocate Technical Sections to Appendices

**Files:**
- Modify: `docs/pdf/social-media-integration.html`

- [ ] **Step 1: From Section 4 (Donny AI), cut the architecture diagram and capabilities table**

Cut the following blocks from Section 4:
- The "Donny AI Architecture" heading and its Mermaid diagram (the `User → Donny AI → Outstand MCP → Platforms` flow)
- The "Donny Capabilities via Outstand MCP" heading and its 6-row table

Keep in Section 4:
- The section intro paragraph
- "Example Commands by Role" (all three role subsections)
- "Donny Automation Levels" table

Save the cut content for Step 4.

- [ ] **Step 2: From Section 5 (Technical Architecture), cut developer-specific content**

Keep in Section 5:
- The section intro paragraph (rewritten in Task 8)
- The "System Layers" heading and its high-level Mermaid diagram (the 4-layer stack diagram)
- The design rule callout about no client-side API calls

Cut and save for appendix:
- "Key Technical Decisions" table (8-row table with API Proxy, Token Storage, etc.)
- "Outstand.so API Reference" table (12-row endpoint table)
- "Outstand Pricing (Cost Planning)" table
- "New Database Tables Required" table (4-row schema table)

- [ ] **Step 3: Remove Section 5 heading numbering since it's now shorter**

After cutting, Section 5 becomes a brief "Technical Overview" with just the system diagram and security callout. Consider renaming it from "Technical Architecture" to "How It's Built" for the conversational tone.

- [ ] **Step 4: Create the appendix structure at the bottom of the document**

Before the closing `<div class="doc-footer">`, insert:

```html
<!-- ════════════════════════════════════════════════════════════
     APPENDICES — DEVELOPER REFERENCE
═══════════════════════════════════════════════════════════════ -->
<section class="page-break">
  <h2>Appendices — Developer Reference</h2>

  <div class="callout callout-navy">
      <p style="margin-bottom: 0;"><strong>The sections below are for the dev team.</strong> They contain architecture details, API references, database schemas, and Outstand pricing. If you're reading this as a stakeholder, you can stop here — the main document covered everything you need.</p>
  </div>

  <h3>Appendix A: Donny AI Social Architecture</h3>

  <!-- Paste the Donny AI Architecture mermaid diagram here -->
  <!-- Paste the Donny Capabilities via Outstand MCP table here -->

  <h3>Appendix B: Technical Architecture Reference</h3>

  <!-- Paste the Key Technical Decisions table here -->
  <!-- Paste the Outstand.so API Reference table here -->
  <!-- Paste the Outstand Pricing table here -->

  <h3>Appendix C: Database Schema</h3>

  <!-- Paste the New Database Tables Required table here -->
</section>
```

- [ ] **Step 5: Update the Table of Contents**

Update the TOC at the top of the document to reflect the new structure:
- Remove or renumber sections as needed
- Add an "Appendices — Developer Reference" entry at the end
- Make sure anchor links (`href="#section-..."`) still point to the correct section IDs

- [ ] **Step 6: Open in browser and verify**

Check that:
- Main body flows cleanly — Section 4 goes straight from the intro to example commands, no gap
- Section 5 is short and sweet — just the system diagram and security note
- Appendices render correctly with all tables and diagrams
- Table of contents links work
- No broken anchor references in the body

- [ ] **Step 7: Commit**

```bash
git add docs/pdf/social-media-integration.html
git commit -m "docs: relocate technical sections to appendices in social media PDF"
```

---

### Task 10: Final Review and PDF Regeneration

**Files:**
- Read: `docs/pdf/donny-ai-cost-architecture.html`
- Read: `docs/pdf/social-media-integration.html`

- [ ] **Step 1: Full read-through of Cost Architecture in browser**

Open `docs/pdf/donny-ai-cost-architecture.html` in a browser. Read front-to-back checking:
- Logo renders in header
- Audience guide is visible and clear
- Executive summary stands alone for a stakeholder
- No technical jargon in the main body
- Appendices are clearly labeled "Developer Reference"
- All Mermaid diagrams render
- All tables are properly formatted
- No orphaned references to moved sections

- [ ] **Step 2: Full read-through of Social Media Integration in browser**

Open `docs/pdf/social-media-integration.html` in a browser. Same checks as Step 1, plus:
- Logo + "× Outstand.so" renders correctly in header
- Table of contents links work
- Example commands by role are still in the main body (not moved to appendix)
- Implementation phases read in plain English

- [ ] **Step 3: Print both documents to PDF**

Using the browser's Print → Save as PDF:
- Open each HTML file
- Print with default margins, A4 or Letter size
- Save to `docs/pdf/Donny_AI_Cost_Architecture.pdf` (overwrite existing)
- Save to `docs/pdf/DragonCandy_Social_Media_Integration.pdf` (overwrite existing)

Verify the PDFs:
- Logo is sharp and properly sized
- Page breaks land at logical points
- No content cut off at page boundaries
- Mermaid diagrams are readable

- [ ] **Step 4: Commit final state**

```bash
git add docs/pdf/donny-ai-cost-architecture.html docs/pdf/social-media-integration.html docs/pdf/Donny_AI_Cost_Architecture.pdf docs/pdf/DragonCandy_Social_Media_Integration.pdf
git commit -m "docs: complete PDF readability redesign — conversational tone, audience signposting, logo, appendices"
```
