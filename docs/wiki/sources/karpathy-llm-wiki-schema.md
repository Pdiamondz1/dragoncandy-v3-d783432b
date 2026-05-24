---
title: Karpathy LLM Wiki Schema
type: source
created: 2026-05-24
updated: 2026-05-24
sources: [raw/external/karpathy-llm-wiki-schema.md]
tags: [knowledge-management, llm, wiki, automation]
---

# Karpathy LLM Wiki Schema

Andrej Karpathy's LLM Wiki defines an operating schema for maintaining a personal knowledge base using an LLM as the wiki maintainer. The system uses a two-layer architecture: immutable raw sources and LLM-generated wiki pages, connected by structured ingest, query, and lint operations.

## Key Claims

- **Two-layer architecture**: `raw/` (immutable sources) and `wiki/` (LLM-generated pages). The LLM never modifies raw sources; it reads them and produces structured wiki output.
- **Four page types**: sources (one per ingested document), entities (people, organizations, products), concepts (ideas, frameworks, theories), analyses (syntheses and comparisons).
- **Three operations**: ingest (read source → discuss → create pages → cross-reference → index → log), query (read index → read pages → synthesize → offer to file), lint (check contradictions, stale claims, orphans, gaps).
- **Seven principles**: wiki is the product, compound don't duplicate, trace everything, flag contradictions, cross-reference aggressively, stay structured, suggest don't assume.
- **Frontmatter standard**: every page has title, type, created/updated dates, sources array, and tags — enabling programmatic indexing.
- **Wikilink cross-referencing**: `[[wikilinks]]` for all internal references, enabling graph-view navigation in Obsidian.

## Notable Design Decisions

- The human curates sources and directs analysis; the LLM does everything else. Clear division of responsibility.
- Contradictions are flagged explicitly, never silently resolved. This preserves intellectual honesty as knowledge accumulates.
- Lint is suggested every ~20 ingestions as a health check cadence.
- Prefer updating existing pages over creating new ones. A concept page with 10 source contributions is more valuable than 10 thin pages.

## Influence on DragonCandy

This schema directly inspired the [[DragonCandy Platform]]'s `docs/wiki/` structure and the `wiki-ops` skill. DragonCandy's adaptation uses kebab-case filenames (vs Karpathy's title case), adds `raw/sessions/` for auto-generated session extracts, and integrates with the [[Donny AI]] knowledge pipeline.

## See Also

- [[DragonCandy Platform]]
- [[Donny AI]]
