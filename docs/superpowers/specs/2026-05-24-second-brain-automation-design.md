# DragonCandy Second Brain + Automation Layer — Design Spec

**Date:** 2026-05-24
**Author:** Dame Williams + Claude Code
**Status:** Approved

## Context

DragonCandy has a well-designed but underutilized knowledge management system. A Karpathy-inspired wiki exists at `docs/wiki/` with 18 content pages (5 sources, 5 entities, 8 concepts) plus index and log, a `KNOWLEDGE_WIKI.md` schema, and a `wiki-ops` skill with ingest/query/lint operations. But knowledge doesn't flow automatically — 6 handoffs sit in `.claude/handoffs/` without being synthesized into the wiki, `raw/sessions/` and `analyses/` are empty, and all wiki operations are manual.

Simultaneously, Dame Williams is the sole developer and the single point of failure for every quality check: building before push, verifying production after deploy, monitoring Supabase errors, maintaining the wiki, and recovering context between sessions. DragonCandy deploys directly to production from main with no staging environment, making every push high-stakes.

This spec designs a three-phase system: operational discipline rules that take effect immediately, a wiki automation pipeline that makes knowledge flow without manual effort, and a Donny AI RAG bridge that makes accumulated knowledge available to users.

## Phase 0: Operational Rules + Pre-Push Hook

### 0A. CLAUDE.md — New "Session Discipline" Section

Add after the existing "Rigor & Context Management" section:

```markdown
## Session Discipline

* **Compact early** — run `/compact` proactively when context usage reaches ~55%.
  Don't wait for automatic compression; compress early to preserve working memory.
* **Verify production after deploy** — after every push to main (auto-deployed via
  Lovable.dev), verify at dragoncandy.io: screenshot the affected pages, open Chrome
  DevTools, check for console errors. Test both desktop and mobile viewports. Test
  account credentials are stored in the project memory system.
* **Desktop/Mobile viewport separation** — frontend changes must target the correct
  viewport. Changes meant for desktop use `lg:` / `xl:` prefixed Tailwind classes.
  Changes meant for mobile use base (unprefixed) classes. Never apply mobile-targeted
  changes to desktop or vice versa. Test both viewports after any UI change.
```

### 0B. DESIGN_SYSTEM.md — Desktop/Mobile Rule

Add to the "Design Rules" section:

```markdown
* **Desktop and mobile are separate targets** — desktop changes use `lg:` / `xl:`
  prefixed classes only; mobile changes use base (unprefixed) classes only. Never
  apply mobile changes to desktop or vice versa. Test both viewports after any
  UI change.
```

### 0C. Pre-Push Quality Gate Hook

Create `.claude/settings.json` with a pre-push hook that intercepts `git push` commands and ensures build + typecheck pass first. This prevents broken production deploys — the single highest-risk bottleneck.

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "If this Bash command contains 'git push', check whether 'npm run build' and 'npm run typecheck' have been run successfully in this session. If not, return 'deny' with instructions to run them first. If the command is not a git push, return 'approve'."
        }
      ]
    }
  ]
}
```

Note: Claude Code hooks use events at the top level (no wrapper object). The `matcher` matches on tool name; content inspection uses a `prompt` hook that evaluates `$TOOL_INPUT`. The prompt-based approach lets the hook intelligently evaluate whether the command is a push and whether build/typecheck have already run.

### 0D. Session Continuity Update

Update the existing "Session Continuity" section in CLAUDE.md to reference the wiki ingestion pipeline (Phase 1):

```markdown
**Creating:** Invoke `session-handoff` skill when completing a plan phase with
more work remaining. The handoff is written to `.claude/handoffs/` AND copied to
`docs/wiki/raw/sessions/` for wiki ingestion. Run `/wiki-ops ingest` on the
raw session file to synthesize it into the wiki.
```

## Phase 1: Wiki Automation Pipeline

### 1A. Karpathy File Handling

1. Move `CLAUDE_Karpathy.md` to `docs/wiki/raw/external/karpathy-llm-wiki-schema.md` (immutable source). Note: `docs/wiki/raw/external/` is gitignored per `.gitignore:83`. Add a `.gitignore` exception for this specific file (`!docs/wiki/raw/external/karpathy-llm-wiki-schema.md`) so it remains version-controlled as a reference document, or accept it leaving git tracking since the source page in `sources/` captures all the important content
2. Create source page at `docs/wiki/sources/karpathy-llm-wiki-schema.md`:
   - Summary of Karpathy's LLM Wiki approach
   - Key claims: raw/wiki layering, ingest/query/lint operations, page format with frontmatter, cross-referencing via wikilinks
   - Source path pointing to `raw/external/karpathy-llm-wiki-schema.md`
3. Update entity/concept pages if Karpathy's schema introduces ideas not already covered
4. Update `docs/wiki/index.md` and `docs/wiki/log.md`

### 1B. Merge Karpathy Improvements into KNOWLEDGE_WIKI.md

Review `CLAUDE_Karpathy.md` against `docs/KNOWLEDGE_WIKI.md` and merge any missing improvements. Candidate additions:

- Image handling guidance ("read text first, view key images separately")
- The "suggest lint every ~20 ingestions" cadence (Karpathy has this; DragonCandy's version lacks an explicit cadence)
- Graph view / wikilink resolution notes (less relevant without Obsidian, but the cross-referencing philosophy applies)

Do not change the fundamental schema — `KNOWLEDGE_WIKI.md` is already well-adapted. Only fold in missing details that improve the existing structure.

### 1C. Session-Handoff → Wiki Pipeline

The `session-handoff` skill is user-level (not a project-level file we can modify). Instead, add the wiki ingestion step as a behavioral instruction in CLAUDE.md's "Session Continuity" section. After a handoff is created:

1. Write the handoff to `.claude/handoffs/YYYY-MM-DD-HHMMSS-topic.md` (already happens)
2. Copy the handoff to `docs/wiki/raw/sessions/YYYY-MM-DD-topic.md` (new instruction in CLAUDE.md)
3. Run `/wiki-ops ingest` on the raw session file:
   - Create source page in `docs/wiki/sources/`
   - Update entity/concept pages with new decisions, discoveries, patterns
   - Update cross-references, index, log

This is enforced via CLAUDE.md instructions rather than modifying the skill itself. The wiki-ops skill already handles the full ingest workflow — the only new step is the copy-to-raw-sessions trigger.

### 1D. Backfill Existing Handoffs

One-time migration: ingest the 6 existing handoffs into the wiki:

| Handoff (actual filename) | Date | Topic |
|---------------------------|------|-------|
| `2026-05-04-232158-code-architecture-audit-remediation.md` | 2026-05-04 | Architecture audit |
| `2026-05-05-230325-seo-audit-remediation.md` | 2026-05-05 | SEO audit |
| `2026-05-06-053148-realtime-edge-cases-remediation-complete.md` | 2026-05-06 | Realtime edge cases |
| `2026-05-06-082322-donny-audit-phase2-quota-streaming.md` | 2026-05-06 | Donny quota/streaming |
| `2026-05-06-190848-donny-audit-phase2-complete.md` | 2026-05-06 | Donny audit completion |
| `2026-05-21-160000-counter-offer-enum-fix.md` | 2026-05-21 | Counter offer enum fix |

Each handoff gets: copied to `raw/sessions/` → source page created → entity/concept pages updated → cross-refs → index → log.

## Phase 1.5: Follow-Up Automations

These are documented for implementation after Phase 0 and Phase 1 are validated.

### 1.5A. Production Health Monitor

A daily scheduled agent (`/schedule`) that:
- Opens dragoncandy.io with browser-use
- Logs in as each role (restaurant, creator, brand) using stored test credentials
- Navigates to key pages: dashboard, campaigns, messaging, profile
- Checks Chrome DevTools console for errors on each page
- Takes screenshots of each page
- Reports findings via notification

Schedule: Daily at 8:00 AM ET (after overnight Lovable deploys settle).

### 1.5B. Weekly Wiki-Sync Agent — IMPLEMENTED 2026-06-01

**Status: implemented.** Originally scoped as a lint-only agent; expanded into a full
drift-detection-and-sync safety net after a multi-week lapse (DragonShare + Capacitor
workstreams shipped without ingested handoffs, leaving the wiki and core docs stale).
The handoff-driven pipeline (Phase 1C) is the primary path; this agent is the backstop that
catches lapses regardless of whether handoffs were written.

**Cadence:** Weekly, Monday 9:00 AM ET (a recurring routine created via the `/schedule` skill).

**What it does each run:**
1. Read the most recent date in `docs/wiki/log.md`.
2. `git log --since=<that date>` and cluster the commits into workstreams.
3. For each workstream with no wiki coverage, draft a session extract in
   `docs/wiki/raw/sessions/` and run the `wiki-ops` ingest flow (source/entity/concept pages,
   cross-references, index, log).
4. Run `npm run docs:scale` (the deterministic scale-number script, added 2026-06-01) to
   refresh PROJECT_CONTEXT.md counts.
5. Run the `wiki-ops` lint check (contradictions, stale claims, orphans, missing pages, thin
   coverage) and include findings in the report.
6. **Land changes on a branch and open a PR** (never commit doc/wiki synthesis straight to
   `main`) — synthesis can be wrong, so a human gate is required. The PR body summarizes what
   was synced and lists the lint findings.

**Why branch + PR, not auto-commit:** docs don't trigger the Lovable deploy, but an
autonomous agent doing synthesis must not pollute `main` history unreviewed. A weekly PR is a
cheap, reversible review surface.

### 1.5B-note. Deterministic Scale Script (companion to 1.5B)

`scripts/update-scale-numbers.mjs` (`npm run docs:scale`) counts pages/hooks/edge-functions and
rewrites the Codebase-scale + Backend lines in PROJECT_CONTEXT.md with today's date. It is the
deterministic half of the hybrid safety net — humans no longer hand-count, and the weekly agent
calls it as step 4. Runnable manually anytime; idempotent; exits non-zero if the doc format drifts.

### 1.5C. Session-Start Context Recovery (Hook, not Scheduled Agent)

A Claude Code hook that fires at conversation start:
- Checks `.claude/handoffs/` for handoffs created within the last 48 hours
- If found, surfaces the freshest one with a one-line summary
- Checks `docs/wiki/log.md` for recent wiki operations to show what knowledge was last synthesized

This is informational — it doesn't block, just surfaces context.

## Phase 2: Donny RAG Bridge (Post-Launch)

### 2A. Wiki → donny_knowledge Sync

Once the wiki accumulates sufficient content (target: 30+ pages with cross-references), create a sync mechanism:

1. **Edge function or script** that reads wiki pages from `docs/wiki/` (entities/ and concepts/ primarily)
2. **Chunking:** Each wiki page becomes 1-3 knowledge chunks, sized 100-500 words each
3. **Metadata mapping** — all mapped fields go into the `metadata` JSONB column (not separate columns):
   - `source_type` (top-level column): "wiki_entity" or "wiki_concept"
   - `metadata.source_id`: `wiki:<page-slug>` for idempotent upserts
   - `metadata.category`: derived from page tags
   - `metadata.roles`: derived from page content relevance (all roles for platform-wide concepts)
   - `metadata.page_paths`: mapped from wiki topics to frontend routes
   Note: The existing `match_donny_knowledge` RPC does pure cosine similarity with no metadata filtering. Role/category filtering requires either a new RPC variant with metadata predicates or post-retrieval application-level filtering. Start with post-retrieval filtering; add an RPC variant if query volume warrants it.
4. **Embedding:** Generate via existing OpenAI `text-embedding-3-small` pipeline (1536 dimensions)
5. **Upsert:** Use the `metadata.source_id` convention (`wiki:page-slug`) to enable idempotent updates — query by source_id before inserting to avoid duplicates
6. **Trigger:** Manual initially, then pg_cron weekly after validation

### 2B. Donny → Wiki Reverse Flow (Deferred)

Deferred until post-launch with real usage data. When activated:
- Aggregate `donny_actions`, `donny_tool_executions`, and `donny_help_logs` weekly
- Identify patterns: most-asked questions, common failure modes, popular campaign types
- Create analysis pages in `docs/wiki/analyses/` with usage-derived insights
- Feed back into development prioritization

## Files Modified

| File | Change | Phase |
|------|--------|-------|
| `CLAUDE.md` | Add "Session Discipline" section, update "Session Continuity" | 0 |
| `docs/DESIGN_SYSTEM.md` | Add desktop/mobile viewport separation rule | 0 |
| `.claude/settings.json` | Create with pre-push quality gate hook | 0 |
| `docs/KNOWLEDGE_WIKI.md` | Merge Karpathy improvements (image handling, lint cadence) | 1 |
| `CLAUDE_Karpathy.md` | Move to `docs/wiki/raw/external/` (verify not gitignored first) | 1 |
| `docs/wiki/sources/karpathy-llm-wiki-schema.md` | New: source summary of Karpathy's schema | 1 |
| `docs/wiki/raw/sessions/*.md` | New: 6 backfilled handoff files | 1 |
| `docs/wiki/sources/*.md` | New: 6 source pages for backfilled handoffs | 1 |
| `docs/wiki/index.md` | Updated with all new pages | 1 |
| `docs/wiki/log.md` | Updated with all operations | 1 |

## Verification Plan

### Phase 0 Verification
1. `npm run build` passes after CLAUDE.md and DESIGN_SYSTEM.md changes
2. `.claude/settings.json` hook syntax is valid — test by attempting `git push` and confirming build/typecheck runs first

### Phase 1 Verification
1. `CLAUDE_Karpathy.md` no longer exists at repo root; exists at `docs/wiki/raw/external/`
2. Source page for Karpathy schema exists and has correct frontmatter
3. All 6 existing handoffs are represented in `docs/wiki/raw/sessions/` and have corresponding source pages
4. `docs/wiki/index.md` lists all new pages alphabetically
5. `docs/wiki/log.md` records all ingest operations with correct dates
6. Cross-references (`[[wikilinks]]`) connect new pages to existing entity/concept pages
7. `/wiki-ops lint` reports no orphan pages or missing cross-references

### Phase 1.5 Verification
1. Scheduled agents created via `/schedule` and confirmed running
2. Production health monitor successfully logs in to all three roles
3. Wiki lint agent produces a meaningful report

### Phase 2 Verification
1. Wiki pages appear as entries in `donny_knowledge` table with correct metadata
2. Embeddings are generated (not null) for all synced entries
3. Donny can answer questions using wiki-sourced knowledge (manual test)

## Non-Goals

- Replacing the existing memory system (`.claude/projects/memory/`) — memory and wiki serve different purposes
- Building a UI for the wiki — it's a developer-facing knowledge system, not a user product
- Automated social media monitoring — out of scope for knowledge management
- Real-time wiki updates on every code change — handoff-driven is the right granularity
