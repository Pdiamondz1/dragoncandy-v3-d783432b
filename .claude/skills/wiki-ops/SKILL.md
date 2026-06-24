---
name: wiki-ops
description: "Manage the DragonCandy knowledge wiki: ingest sources into structured pages, query the wiki for answers, or run a lint health check. Use when asked to 'ingest', 'add to the wiki', 'what do we know about X', or 'wiki lint'."
---

# Wiki Operations

This skill manages the knowledge wiki at `docs/wiki/`. Read the full schema
at `docs/KNOWLEDGE_WIKI.md` before proceeding.

## Loop memory

This skill keeps a co-located **`MEMORY.md`** — two zones: curated **Lessons** (read first)
and an append-only **Run Log**. Full contract: `docs/wiki/concepts/loop-memory-protocol.md`.

- **At the start of every run:** read `MEMORY.md` and apply its **Lessons**.
- **At the end of every run:** add a **Run Log** entry **at the top** (newest first) —
  `Output:` a *pointer* to the artifact this run produced (e.g. the wiki page + `log.md`
  line; never a duplicate), then `Happened / Worked / Failed / Remember`. Then promote
  durable takeaways into **Lessons** and prune any Lessons this run superseded.

## Operations

### `/wiki-ops ingest <source>`

Ingest a raw source into structured wiki pages.

**Steps:**
1. Read the raw source completely. If the user said "ingest X", find the
   file matching X in the project.
2. Discuss 3-5 key takeaways with the user. What's interesting? What's
   new? What contradicts existing wiki knowledge?
3. Create a source summary page in `docs/wiki/sources/` with frontmatter:
   `type: source`, one-paragraph summary, key claims, notable quotes.
4. Create or update entity pages in `docs/wiki/entities/` for any
   integrations, services, or systems mentioned significantly.
5. Create or update concept pages in `docs/wiki/concepts/` for any
   architectural patterns, business concepts, or frameworks discussed.
6. Update `[[cross-references]]` — add See Also links across all touched
   pages. Use `[[Display Name]]` syntax.
7. Update `docs/wiki/index.md` — add new entries, keep alphabetically
   sorted within each section. Format: `- [[Display Name]](path) — summary`
8. Append to `docs/wiki/log.md`:
   ```
   ## [YYYY-MM-DD] ingest | Source Title
   Description of what was ingested.
   Pages created: [[Page 1]], [[Page 2]]
   Pages updated: [[Page 3]]
   ```

**Rules:**
- Never modify files in `docs/wiki/raw/`. Sources are immutable.
- Use kebab-case for filenames: `stripe-connect.md`, not `Stripe Connect.md`.
- When new info contradicts an existing page, flag the contradiction
  explicitly in the page — never silently overwrite.
- Prefer updating existing pages over creating new ones. Check `index.md`
  for existing pages before creating a new one.

### `/wiki-ops query <question>`

Answer a question using the wiki as the primary knowledge source.

**Steps:**
1. Read `docs/wiki/index.md` to identify relevant pages.
2. Read those pages. Follow `[[wikilinks]]` for related context.
   **Limits:** max 2 levels of link-following, max 5 pages total.
3. Synthesize an answer with inline citations: `([[Page Name]])`.
4. If the answer contains substantial synthesis worth preserving, offer
   to file it as an analysis page in `docs/wiki/analyses/`.
5. If the wiki lacks information, say so and suggest what sources might
   fill the gap.

Answer from the wiki first. Only go to raw sources or codebase files if
the wiki doesn't have enough detail.

### `/wiki-ops lint`

Health check on the wiki. Run on request or suggest every ~20 ingestions.

**Check for:**
- **Contradictions** between pages (flag with specific quotes from each)
- **Stale claims** superseded by newer sources
- **Orphan pages** with no inbound `[[wikilinks]]` from other pages
- **Missing pages** — concepts mentioned in `[[wikilinks]]` that don't
  have their own page yet
- **Missing cross-references** between pages that cover related topics
- **Data gaps** — topics where only one source exists or coverage is thin
- **Index completeness** — pages that exist on disk but aren't in `index.md`

**Output:** A structured report with numbered findings and suggested fixes.
Apply fixes only with user approval.

### Session-End Extract

At the end of a working session, when the user asks to update the wiki:

1. Write a structured session extract to
   `docs/wiki/raw/sessions/YYYY-MM-DD-topic.md` capturing:
   - What was built or fixed
   - Key decisions made and why
   - Bugs discovered and how they were resolved
   - Patterns or learnings worth preserving
2. Ingest the extract following the standard 8-step ingest flow above.
