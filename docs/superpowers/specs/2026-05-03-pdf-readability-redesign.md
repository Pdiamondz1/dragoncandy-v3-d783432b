# PDF Document Readability Redesign

**Date:** May 3, 2026
**Audience:** Dame, Joe, Juwan, Dev Team
**Status:** Approved Design — Ready for Implementation Planning

---

## Problem

The two flagship internal documents — Donny AI Cost Architecture and Social Media Integration — are extensive, technically dense, and written in a formal spec tone. They serve four readers with different needs: Dame (CPO), Joe (CRO/Sales), Juwan (Advisor), and the lead developer and his team. Right now, stakeholders hit database schemas on page 4 and mentally check out. Developers wade through business context they already have to find the implementation details they need. Neither audience gets a document optimized for how they actually read.

## Solution

Approach A: full tone and structure pass on both documents. Rewrite shared sections in conversational, direct language (matching PROJECT_CONTEXT.md voice). Relocate all developer-specific content to clearly labeled appendices. Add audience signposting so each reader knows exactly which pages matter to them. Add the DragonCandy logo to both document headers.

No content is deleted — everything is reorganized and rewritten for clarity.

---

## Shared Document Template

Both docs follow this skeleton:

### 1. Header
- DragonCandy logo (`src/assets/Transparent_DragonCandy_logo.png`) embedded as base64 data URI — self-contained, no broken images when shared as PDF
- Cost Architecture: replaces the dragon emoji + text placeholder, logo centered above title (~120-160px wide)
- Social Media: replaces the text-only "DragonCandy" pill, logo on left with "x Outstand.so" text alongside

### 2. Audience Guide
A short block right after the title page metadata:

> **For Joe, Juwan, and Dame:** The Executive Summary and Sections 1-3 give you the full picture — decisions, costs, revenue impact. You can stop there.
> **For the dev team:** Everything above plus the Appendices, which have schemas, API references, and implementation patterns.

### 3. Executive Summary
Rewritten conversational. Leads with the problem in one sentence, the solution in one sentence, then the decisions table and KPI cards. No jargon. Stands alone as a complete briefing for a stakeholder who reads nothing else.

### 4. Main Body
Business logic, workflows, role strategies. Written in plain English. Diagrams stay. Dense paragraphs broken into shorter ones. Technical terms explained inline the first time they appear, or replaced entirely (e.g., "edge function" becomes "backend function" in shared sections).

### 5. Success Metrics
Stays in main body — stakeholders care about targets.

### 6. Guiding Principles
Stays in main body — stakeholders care about philosophy.

### 7. Appendices (Developer Reference)
Clearly labeled. All database schemas, API endpoint tables, code patterns, function signatures, migration checklists. Devs know to look here; everyone else knows to skip it.

---

## Donny AI Cost Architecture — Specific Changes

### Executive Summary Rewrite
- Open with the plain problem: "Donny gets smarter and does more, but every AI call costs money. Without rules, costs grow faster than revenue."
- Solution in one line: "We route every Donny task to the cheapest AI model that handles it well, keep usage invisible to users, and cap total AI spend at 15% of revenue."
- Decisions table: keep but simplify Rationale column. "Cheapest acceptable model per task; most Donny tasks are pattern-matching suited to Haiku" becomes "Most of what Donny does is simple pattern-matching — the cheap model handles it fine."
- Cut the "What Donny AI Does" subsection — one sentence max. The reader already has this context by the time they open this doc.
- KPI cards stay as-is (strong visual).

### Main Body — What Stays, What Moves

| Current Section | Action |
|---|---|
| Model Routing Matrix (tier definitions, migration table) | **Stays** — rewrite descriptions in plain English. "Pattern-matching tasks" becomes "simple, repetitive tasks." Move "Model Selection Decision Flow" mermaid diagram and fallback rule details to appendix. |
| Invisible Credit System & Graceful Degradation | **Stays** — core UX story. Three-stage degradation cards are great visuals. Rewrite design principle to be direct: "Users never see how much AI they're using. Period." Move `donny_usage` table schema to appendix. |
| Revenue Cap Governance | **Stays** — simplify language. "Pre-revenue floor logic" becomes "How the cap works before we have revenue." Bar chart visualization is excellent. Reframe alert threshold table: "What happens as we approach the cap." |
| Vendor Consolidation | **Stays but shorten** — stakeholders care about "we're moving to one vendor to simplify billing." Timeline mermaid diagram stays. Cut detailed rationale paragraphs about embedding costs and LoRA fine-tuning to one paragraph each. |
| Social Media Integration Alignment | **Stays** — DragonDash rush posting table and model routing per feature table are business-relevant. |
| Data Architecture (schemas, indexes, RLS, sequence diagram) | **Moves to Appendix A** |
| Edge Function Integration Pattern (pseudocode, function signatures, migration checklist) | **Moves to Appendix B** |

### Appendices
- **Appendix A: Database Schema (Developer Reference)** — `donny_cost_ledger` and `donny_usage` table definitions, RLS policies, indexes, data flow sequence diagram
- **Appendix B: Edge Function Integration Pattern (Developer Reference)** — pseudocode pattern, function signatures table, migration checklist

### Tone Examples

Before: "The routing layer checks `donny_usage` before model selection. If `current_stage = 'conservation'`, the routing matrix shifts eligible T2 tasks down to T1."

After: "Before every AI call, the system checks how much of the user's budget is left. If they're running low, Donny quietly switches to the cheaper model for tasks that don't need the expensive one."

---

## Social Media Integration — Specific Changes

### Executive Summary Rewrite
- Open with the gap: "Right now, a creator shoots a reel, the restaurant approves it inside DragonCandy, and then... everyone leaves the platform to post it manually."
- The existing "The Gap" paragraph already nails this — keep the substance, tighten slightly.
- Solution in one line: "Outstand.so integration brings posting, scheduling, analytics, and engagement inside DragonCandy — Donny reduces every social action to a single sentence."
- KPI cards (3 roles, 10 platforms, 25 MCP tools) and Core Decisions table stay. Simplify rationale column.
- DragonDash Rush Posting subsection stays — it's the revenue story stakeholders need.

### Main Body — What Stays, What Moves

| Current Section | Action |
|---|---|
| Restaurant Role (workflow, campaign integration, DragonDash rush, features table) | **Stays** — heart of the value prop. Simplify phrases: "critical for local search visibility" becomes "this is how people find restaurants on Google." |
| Creator Role (flywheel, cross-posting workflow, features table) | **Stays** — flywheel diagram is excellent storytelling. Tighten prose around it. |
| Brand Role (multiplier effect, amplification workflow, features table) | **Stays** — "265K+ combined reach" diagram is a powerful stakeholder visual. |
| Donny AI: The Social Media Brain | **Split** — Example commands by role stay (stakeholders love seeing real Donny commands). Automation levels table stays (pricing/tier relevant). Architecture diagram and MCP tool technical details move to appendix. |
| Campaign Lifecycle Social Hooks (5-stage flow) | **Stays** — pure business logic, great visual. |
| Technical Architecture | **Mostly moves** — Keep the high-level system layers diagram in main body (simple enough for stakeholders). Move key technical decisions table, full API endpoint reference, and Outstand pricing breakdown to appendix. |
| Implementation Phases (Phase 1-4) | **Stays but simplify** — Rewrite deliverable descriptions in plain English. "Donny MCP integration — wire Outstand's 25-tool MCP server into Donny with role-aware prompting" becomes "Connect Donny to Outstand so Donny can post, schedule, and pull analytics on behalf of users." |
| Market Context 2026 | **Stays** — Joe and Juwan especially care about this. Already reads well. |
| Cost Governance Integration | **Stays** — stakeholders need to see how social features map to pricing tiers. |
| Success Metrics | **Stays** — everyone cares about targets. |
| Guiding Principles | **Stays** — already reads cleanly as principle cards. |

### Appendices
- **Appendix A: Technical Architecture Reference (Developer Reference)** — Outstand API endpoints, key technical decisions table, Outstand pricing details, token storage details
- **Appendix B: Database Schema (Developer Reference)** — `social_connections` table, `social_posts` table, any new schema from the spec

### Tone Shift
Same voice as the Cost doc — conversational, direct, no "utilizes" or "leverages." The role value proposition quotes ("Run your restaurant's entire social media presence without leaving DragonCandy") are already in the right voice. The surrounding prose needs to match that energy.

---

## Logo Integration

- **Source:** `src/assets/Transparent_DragonCandy_logo.png`
- **Method:** Base64 data URI embedded directly in HTML — self-contained, no broken images when sharing PDFs
- **Cost Architecture:** Replace the dragon emoji + "DragonCandy" text block with the actual logo, centered, ~120-160px wide
- **Social Media:** Replace the "DragonCandy" text pill with the logo on the left side. Keep "x Outstand.so" text alongside it since Outstand is the integration partner
- **Both docs:** Logo sits above the document title in the header area

---

## What This Deletes
- Formal, spec-generator tone in shared sections
- Technical jargon where plain English works ("edge function" becomes "backend function" in stakeholder-facing text)
- Bloated rationale paragraphs that repeat what a table already says
- The implicit assumption that all readers need all sections

## What This Simplifies
- One document per topic instead of splitting into stakeholder/dev versions
- Audience guide at the top tells each reader exactly where to go
- Shorter paragraphs, direct sentences, conversational voice throughout shared sections

## What This Automates
- Nothing — this is a documentation improvement, not a code change

## Keystroke Count Removed
- N/A — these are read-only documents, not user flows
