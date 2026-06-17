# Handoff — Investor Pitch Deck + Capital Raise Cost Model

**Date:** 2026-06-17 · **Branch:** `worktree-DC-pitch-deck` · **PR:** #111 (OPEN, not merged)

## State

Shipped on the branch (3 commits, Codex-clean, build clean), **not yet merged or deployed**:
- **Deck** at unlisted `/pitch` — `src/pitch/` (15 slides, brand-faithful, `noindex`), wired in via
  one early return in `AppLayout` (`src/App.tsx`).
- **Cost model** — `docs/DragonCandy_Capital_Raise_Cost_Model.md` (~$3M seed, 18-mo, 50/30/20;
  infra 100→1M, staffing, Donny super-agent R&D, mobile, brand acquisition, 3-metro marketing).
- **Slides wired from the model** — Ask, Financials, Market, Model; new **Vision** slide (#12).
- PDF: `npm run pitch:pdf` → `dragoncandy-pitch.pdf` (gitignored, worktree-only, 15 pages).

## Open / next steps

1. **Merge PR #111**, then refresh local main (`git -C <main> fetch && merge --ff-only origin/main`).
2. **Upload the deck PDF** to the AIOS Workspace Drive — must be done manually (connector can't
   inline a 3.5MB binary). Use `/internal/workspace` or drag into the Drive folder beside the
   template. The PDF is gitignored → regenerate with `npm run pitch:pdf` if the worktree is gone.
3. **Founders finalize** the actual raise/valuation/structure (deck shows a recommended range) and,
   optionally, source real TAM/SAM/SOM to replace the Market `$[verify]` placeholders.
4. **Donny RAG:** the new wiki pages sync into `donny_knowledge` via `autoresearch sync-donny`
   (needs `SUPABASE_SECRET_KEY`) or the daily 3am AIOS freshness backstop.

## Gotchas

- Slides are a fixed **1280×720** canvas — verify `scrollHeight === 720` after any copy change.
- Deck renders only from the **production build** (`vite preview`), not `vite dev`.
- `dragoncandy-pitch.pdf` is **gitignored** — never arrives via PR; regenerate from code.
