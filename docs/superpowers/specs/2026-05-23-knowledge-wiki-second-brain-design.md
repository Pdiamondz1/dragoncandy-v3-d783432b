# Knowledge Wiki — DragonCandy Second Brain

> Design spec for a Karpathy-style LLM Wiki adapted as a synthesis layer
> for the DragonCandy codebase, enabling Claude Code to accumulate and
> cross-reference project knowledge across sessions.

## Context

DragonCandy has a mature knowledge system — CLAUDE.md auto-imports three
core docs, 100+ plans/specs capture execution decisions, 6 handoffs bridge
sessions, 4 memory files store durable facts, and 70 custom skills encode
workflows. What's missing is a **synthesis layer**: when Claude Code needs
to answer "how does the content delivery system work end-to-end?" or
"what Stripe bugs have we hit and how were they fixed?", there's no
structured, cross-referenced knowledge base to query — only raw execution
artifacts scattered across ~200 plans/specs.

Andrej Karpathy's LLM Wiki architecture solves this: immutable raw sources
are ingested into structured, interlinked wiki pages (sources, entities,
concepts, analyses) governed by a schema file. This spec adapts that
architecture for DragonCandy.

**Goals:**
- Give Claude Code a persistent, growing knowledge base that makes every
  session smarter
- Synthesize learnings from plans, specs, handoffs, session work, and
  external resources into queryable wiki pages
- Add universal behavioral rules for rigor and context management

**Non-goals (for this phase):**
- Donny AI user-facing knowledge base (future phase)
- Automated hook-driven ingestion (validate quality first)
- Obsidian compatibility (trivial migration later if wanted)

## 1. Wiki Directory Structure

```
docs/wiki/
├── raw/                    # Layer 1: Immutable source material
│   ├── external/           # PDFs, articles, competitor research, API docs
│   └── sessions/           # Auto-generated session learning extracts
├── sources/                # Layer 2: One summary page per ingested source
├── entities/               # Pages for integrations, services, systems
├── concepts/               # Pages for patterns, decisions, frameworks
├── analyses/               # Comparisons, post-mortems, synthesized answers
├── index.md                # Master catalog of all wiki pages
└── log.md                  # Chronological record of all operations
```

### Layer descriptions

**`raw/external/`** — User-dropped PDFs, articles, NotebookLM exports,
competitor research, API documentation. Claude reads but never modifies
these files. They are the immutable source of truth for ingestion.

**`raw/sessions/`** — At session end, Claude writes a structured extract
capturing: what was built/fixed, key decisions made, bugs discovered,
patterns learned. Format: `YYYY-MM-DD-topic.md`.

**`sources/`** — One summary page per ingested raw source. Contains:
one-paragraph summary, key claims (bulleted), notable quotes, data points.
Cites the raw source path for traceability.

**`entities/`** — Pages for integrations, services, and systems that
DragonCandy interacts with. Examples: Stripe Connect, Supabase RLS,
Outstand.so, Toast POS, Donny AI, DragonDash. Each accumulates everything
known about that entity across all sources.

**`concepts/`** — Pages for durable architectural and business concepts.
Examples: content delivery flow, campaign lifecycle, auth session model,
take-rate ladder, data flywheel. These are the "what we know about how
things work" pages.

**`analyses/`** — Cross-cutting syntheses, comparisons, and post-mortems.
Examples: "All Stripe bugs and resolutions", "Content delivery state
machine evolution", "Auth architecture decisions timeline."

**`index.md`** — Master catalog. Entries alphabetically sorted within
each section (Sources, Entities, Concepts, Analyses). One-line summary
per entry.

**`log.md`** — Chronological operation record. Each entry:
`## [YYYY-MM-DD] operation | Subject`. Operations: ingest, query, lint,
update, analysis. Each entry includes a `Pages created:` and
`Pages updated:` line for auditability.

**`.gitignore` note:** Add `docs/wiki/raw/external/` to `.gitignore` to
prevent large binary files (PDFs, exports) from bloating the repo. Text
files in `raw/sessions/` are version-controlled normally.

## 2. Page Format

Every wiki page uses this structure:

```markdown
---
title: Page Title
type: source | entity | concept | analysis
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [list of source filenames that inform this page]
tags: [relevant tags]
---

# Page Title

Content here. Use [[wikilinks]] for cross-references to other wiki pages.

## Key Decisions
- Decision with date and rationale

## Known Issues
- [date] Issue description — status/resolution

## See Also
- [[Related Page 1]]
- [[Related Page 2]]
```

### Rules

1. **Cross-references** use `[[Page Title]]` syntax as a textual
   convention. To resolve a wikilink, search `index.md` for the page
   title, then read the corresponding file from its directory.
2. **Contradictions:** when new info contradicts existing claims, flag
   the contradiction explicitly — never silently overwrite.
3. **Compound, don't duplicate.** Prefer updating existing pages over
   creating new ones. A concept page with 10 sources is more valuable
   than 10 thin pages.
4. **Traceability:** every claim traces back to a source via the
   `sources:` frontmatter. Source pages cite the raw source path.
5. **Filenames** use kebab-case: `stripe-connect.md`, `content-delivery-
   flow.md`. The `title:` frontmatter holds the display name. Wikilinks
   use the display name (`[[Stripe Connect]]`), resolved via `index.md`
   which maps display names to file paths.

## 3. CLAUDE.md Integration

### Change 1 — Add import (1 line)

Add `@docs/KNOWLEDGE_WIKI.md` to the import block at the top of CLAUDE.md,
alongside the existing three imports.

### Change 2 — Add behavioral rules (~8 lines)

Add a "Rigor & Context Management" subsection to the Important Rules
section of CLAUDE.md:

```markdown
## Rigor & Context Management

* **Ask until 95% confident** — before starting any task, ask clarifying
  questions until you're 95% confident you understand exactly what's
  needed. Don't make assumptions.
* **95% complete before moving on** — don't move to the next task until
  you're 95% confident the current one is complete, correct, and passes.
* **Compact proactively** — after reading more than 10 files or when a
  session spans multiple major tasks, run /compact to preserve context
  for productive work. Don't wait until context is exhausted.
```

### docs/KNOWLEDGE_WIKI.md (~80 lines)

A new file containing the full wiki schema: directory structure, page
format, ingestion workflow, query workflow, lint checks, and seven
operating principles adapted from Karpathy:

1. **The wiki is the product.** Chat is ephemeral; anything valuable
   ends up in a wiki page.
2. **Compound, don't duplicate.** Update existing pages rather than
   creating near-duplicates.
3. **Trace everything.** Every claim traceable to a source.
4. **Flag contradictions.** Never silently resolve conflicts.
5. **Cross-reference aggressively.** Connections between pages are as
   valuable as the pages themselves.
6. **Stay structured.** Follow frontmatter format and naming conventions.
7. **Suggest, don't assume.** When unsure whether to create a page or
   which category fits, ask.

The file also includes a condensed reference to the Phase 1 seed
documents, making it self-documenting for new sessions that encounter
an empty wiki.

**CLAUDE.md stays under 160 lines.** Current: 148 lines. Adding: 1 import
line + 1 blank line + 7 lines for the behavioral rules section = 9 lines.
Total: 157 lines.

## 4. Wiki Operations

### 4.1 Ingest

Two modes:

**Manual ingest** — User requests: "ingest the content delivery specs",
"process this PDF." Claude follows these steps:

1. Read the raw source completely.
2. Discuss 3-5 key takeaways with the user.
3. Create a source summary page in `sources/`.
4. Create or update entity pages in `entities/`.
5. Create or update concept pages in `concepts/`.
6. Update cross-references across all touched pages.
7. Update `index.md`.
8. Append to `log.md`.

**Session-end extract** — At end of a working session (before handoff or
sign-off), Claude:

1. Writes a structured session extract to
   `raw/sessions/YYYY-MM-DD-topic.md`.
2. Ingests the extract into relevant wiki pages following the same 8-step
   flow.

This is triggered by explicit request ("update the wiki before we wrap
up") — not by hooks. The session-handoff skill is a natural companion
but does not need modification; the wiki extract is a separate step
that happens alongside handoff creation when the user requests it.
In a future phase, the session-handoff skill could be extended to
prompt for wiki extraction automatically.

### 4.2 Query

When Claude needs to answer "what do we know about X?":

1. Read `index.md` to identify relevant pages.
2. Read those pages, follow `[[wikilinks]]` for related context.
   **Depth limit:** follow at most 2 levels of wikilinks and read no
   more than 5 pages per query to prevent context exhaustion.
3. Synthesize answer with inline citations `([[Page Name]])`.
4. Offer to file substantial answers as analysis pages.

Answer from the wiki first. Only go to raw sources if the wiki doesn't
have enough detail.

### 4.3 Lint

Triggered manually or suggested every ~20 ingestions. Checks for:

- Contradictions between pages (flag with specific quotes)
- Stale claims superseded by newer sources
- Orphan pages with no inbound `[[wikilinks]]`
- Important concepts mentioned but lacking their own page
- Missing cross-references between related pages
- Data gaps — topics with only one source

Output: structured report with specific findings and suggested fixes.
Apply fixes only with user approval.

### 4.4 Skill implementation

Operations are encoded as a Claude Code skill at
`.claude/skills/wiki-ops/SKILL.md`. Invoked via `/wiki-ops ingest`,
`/wiki-ops query`, `/wiki-ops lint`. The skill references
`docs/KNOWLEDGE_WIKI.md` for the schema.

## 5. Initial Seeding Strategy

### Phase 1 — Core documents (first implementation session)

Ingest the 5 highest-value existing documents:

1. `docs/PROJECT_CONTEXT.md` → source page + entity pages (DragonCandy,
   Donny AI, DragonDash) + concept pages (take-rate ladder, data flywheel,
   Musk's Algorithm)
2. `docs/content-delivery-system-flows.md` → source page + concept page
   (content delivery state machine)
3. `docs/STRIPE_PRICES.md` → source page + entity page (Stripe Connect) +
   concept page (pricing architecture)
4. `docs/DATABASE_SCHEMA.md` → entity pages for key systems (campaigns,
   messaging, file uploads)
5. `.claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md`
   (most architecturally significant handoff) → source page + concept
   updates for code architecture patterns

Expected output: at least 15 wiki pages with real cross-references.

### Phase 2 — Ongoing accumulation

Every session-end extraction adds incrementally. The wiki grows
organically through normal development work.

### Phase 3 — Backlog processing (on-demand)

Batch-ingest completed plans/specs by topic area when deeper coverage
is needed: "ingest all campaign-related specs", "ingest all auth-related
specs."

## 6. Verification Plan

1. **Structure:** Verify `docs/wiki/` directory tree is created with all
   subdirectories (raw/external, raw/sessions, sources, entities,
   concepts, analyses).
2. **Schema:** Verify `docs/KNOWLEDGE_WIKI.md` exists, contains complete
   schema, and is importable via `@` reference.
3. **CLAUDE.md:** Verify import is added, behavioral rules are present,
   total line count is under 160.
4. **Skill:** Verify `.claude/skills/wiki-ops/SKILL.md` exists and
   contains ingest/query/lint operation definitions.
5. **Seeding:** Run Phase 1 ingestion, verify at least 15 wiki pages are
   created with valid frontmatter, cross-references, and index entries.
6. **Build:** `npm run build` passes (wiki files don't affect build).
7. **Lint test:** Run `/wiki-ops lint` on the seeded wiki, verify it
   produces a clean report or actionable findings.

## 7. Future Phase: Donny AI Knowledge Base

Not in scope for this implementation, but designed to interoperate:

- Donny's knowledge base would be a Supabase-backed system
  (`donny_knowledge` table already exists in the schema)
- The dev wiki's concept pages could seed Donny's initial knowledge
- Session learnings about user behavior patterns could flow from the dev
  wiki into Donny's training data
- This phase would be its own spec-plan-implementation cycle
