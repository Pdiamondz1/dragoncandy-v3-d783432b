# Knowledge Wiki Schema

The wiki at `docs/wiki/` is a synthesis layer that accumulates project
knowledge across sessions. It reads from all existing layers (plans, specs,
handoffs, memory, external docs) and produces cross-referenced pages.

## Structure

```
docs/wiki/
├── raw/external/     # Immutable: user-dropped PDFs, articles (gitignored)
├── raw/sessions/     # Immutable: auto-generated session extracts
├── sources/          # One summary page per ingested source
├── entities/         # Integrations, services, systems (Stripe, Supabase, etc.)
├── concepts/         # Patterns, decisions, frameworks (auth model, pricing, etc.)
├── analyses/         # Comparisons, post-mortems, cross-cutting syntheses
├── index.md          # Master catalog — all pages, alphabetically sorted
└── log.md            # Chronological operation record
```

## Page Format

```markdown
---
title: Page Title
type: source | entity | concept | analysis
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [raw-source-filenames]
tags: [relevant-tags]
---
# Page Title
Content with [[Display Name]] cross-references.
## Key Decisions
## Known Issues
## See Also
```

**Filenames:** kebab-case (`stripe-connect.md`). Display names in `title:`
frontmatter. `[[Wikilinks]]` use display names, resolved via `index.md`.

## Ingest Workflow

1. Read the raw source completely. If it contains image references,
   read the text first, then view key images separately.
2. Discuss 3-5 key takeaways with the user.
3. Create source summary page in `sources/`.
4. Create or update entity pages in `entities/`.
5. Create or update concept pages in `concepts/`.
6. Update `[[cross-references]]` across all touched pages.
7. Update `index.md` — add new entries, keep alphabetically sorted.
8. **Prepend** to `log.md` — newest first, directly above the current top entry.
   (This step used to read "append", which is wrong and has produced out-of-order
   entries near the bottom of the file; the top of `log.md` is strictly
   reverse-chronological and is what readers and the SessionStart hook scan.)
   Include pages created and updated. Use the format:
   `## [YYYY-MM-DD] operation | Subject` where operation is one of:
   `ingest`, `query`, `lint`, `update`, `analysis`.

**Rules:** Never modify `raw/`. Flag contradictions explicitly — never
silently overwrite. Prefer updating existing pages over creating new ones.

## Query Workflow

1. Read `index.md` to find relevant pages.
2. Read those pages. Follow `[[wikilinks]]` — max 2 levels, max 5 pages.
3. Synthesize answer with inline citations `([[Page Name]])`.
4. Offer to file substantial answers as analysis pages.

Answer from wiki first. Go to raw sources only if wiki lacks detail.

## Lint Checks

Run on request or suggest every ~20 ingestions. Check for:
contradictions, stale claims, orphan pages, missing concept pages,
missing cross-references, thin coverage areas.

## Principles

1. **The wiki is the product.** Chat is ephemeral; value goes into pages.
2. **Compound, don't duplicate.** Update existing pages, not new thin ones.
3. **Trace everything.** Every claim traceable to a source.
4. **Flag contradictions.** Never silently resolve conflicts.
5. **Cross-reference aggressively.** Connections are as valuable as pages.
6. **Stay structured.** Follow frontmatter and naming conventions.
7. **Suggest, don't assume.** When unsure about categorization, ask.

## Seed Documents

If the wiki is empty, start by ingesting these 5 documents:
`docs/PROJECT_CONTEXT.md`, `docs/content-delivery-system-flows.md`,
`docs/STRIPE_PRICES.md`, `docs/DATABASE_SCHEMA.md`, and the most
architecturally significant handoff in `.claude/handoffs/`.
