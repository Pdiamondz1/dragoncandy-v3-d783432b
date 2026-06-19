# Session Extract — Investor Pitch Deck + Capital Raise Cost Model

**Date:** 2026-06-17
**Branch:** `worktree-DC-pitch-deck` · **PR:** #111 (open at session end)
**Commits:** `809c7a50` (deck), `b540f977` (cost model + Ask/Financials), `66bb0384` (brands + Vision slide)

## What was built

1. **Investor pitch deck at `/pitch`** — a self-contained, brand-faithful HTML/React slide deck
   (15 slides) for VCs in tech/SaaS/AI/Marketing/Hospitality, modeled on the narrative arc of the
   "The Station" template deck (Joe Castelo's, in the AIOS Workspace Drive). Lives under
   `src/pitch/` (`PitchDeck.tsx`, `slides/slides.tsx`, `slides/SlideShell.tsx`, `slides/index.ts`,
   `pitch-print.css`). Reachable by URL only, `noindex`, no nav/Donny/auth chrome — one early
   return in `AppLayout` (`src/App.tsx`) renders it under the top-level providers. Brand: `dc-*`
   tokens, Outfit/Pacifico, `logo.webp`. **No dragon emoji, no gray.**

2. **Capital-raise cost model** — `docs/DragonCandy_Capital_Raise_Cost_Model.md`. An 18-month
   runway model backing a **~$3M seed** ($2.5–3.5M, ~$12–15M post-money, **50/30/20** use of
   funds: Engineering&Donny / GTM&metros / working capital). Sections: infra at 100→1M users
   (grounded 100–1K from the Infrastructure Capacity Report, 100K–1M illustrative, governed by the
   15%-of-revenue AI cap); phased **Donny super-agent R&D** (fine-tuned model + public API +
   standalone assistant — dominant cost is the AI-dev FTE, not compute, because 2026 fine-tuning is
   cheap); mobile (Apple $99/yr + Google $25, ~$5–10K incremental — iOS Capacitor Phase 1 already
   shipped); hybrid NYC-loaded staffing (the 7 requested roles + AE, phased); brand acquisition;
   sequenced 3-metro marketing. Every figure cites a repo doc or a 2026 external benchmark.

3. **Deck slides wired from the model** — Ask ($2.5–3.5M / ~$12–15M / 50·30·20, placeholders
   removed); Financials (18-month-raise reconciliation line); Market + Model (brands woven in).

4. **Brand acquisition added** (§6.1 + slides) — brand economics (CAC $1.5–3.5K, LTV $24–72K,
   ~$800/mo, LTV:CAC ~7–20:1); **lean founder + AE motion, no new hire** (Brand Partnerships Mgr
   stays a Year-3 hire); ~$30–50K brand GTM absorbed in the GTM bucket → **raise band unchanged**.
   Brand role is still behind the `BRAND_ROLE_ENABLED` flag; enabling it is dev time already in the
   staffing line. Brand revenue is upside, not a runway dependency.

5. **Vision slide (#12, new)** — Donny's trajectory: copilot → autonomous super-agent (value
   beyond the app via a public Donny API + standalone assistant) → AGI-adjacent self-improving
   agents. Right column = the adaptability thesis: **model-agnostic routing** (adopt the best/
   cheapest model the day it ships, backend-only via the `_shared/model-routing` seam),
   **provider-independent** (Anthropic + OpenAI today, any frontier lab tomorrow), **owns its data**
   (proprietary flywheel → fine-tune our own models). Punchline: "We don't bet on one model — we
   ride every model. Adaptability is the moat that compounds."

## Key decisions

- **Format:** in-repo HTML/React deck → PDF (pixel-perfect brand fidelity) over Google Slides.
- **Scope:** standard seed deck; grew from 14 → 15 slides when the Vision slide was added.
- **The raise is a recommended range**, not a fixed term sheet — valuation/structure left to founders.
- **Brands woven into existing slides** (Market/Model/Financials), not a separate slide, to keep it tight.
- **Vision got a dedicated slide** because it's genuinely new narrative and the user asked to "showcase" it.
- **Staffing framed as "what the raise buys over 18 months,"** explicitly reconciled against the
  lean staffing plan (which says no salesperson until paid ads work, no 2nd dev until AI can't keep
  up) — a raise funds the team you can't yet self-fund; lean rules become gates on the spend.

## Bugs / gotchas discovered

- **Fixed 1280×720 slide canvas:** adding copy silently overflows the page (content clips in the
  PDF, no error). Every touched slide must be verified `scrollHeight === 720` via a Playwright
  screenshot before shipping. The Market and Vision slides both overflowed on first pass and were
  tightened (spacing + copy) until they fit exactly.
- **PDF export** (`npm run pitch:pdf`) is self-contained: `vite build` → `vite preview` →
  Playwright captures each `.pitch-slide` as a 2× JPEG → hand-rolled image-per-page PDF
  (deterministic page count). The deck only renders from the **production build**, not `vite dev`
  (a dev module-init quirk falls through to the landing page). `dragoncandy-pitch.pdf` is
  **gitignored** — it lives only in the worktree, never in the PR.
- **Google Drive upload blocked:** the claude.ai Google Drive connector accepts content only as
  inline base64; a 3.5MB PDF (~1.2M tokens) cannot be passed through a tool call (no path/URL/
  resumable upload). Connector auth is fine (it can search Drive) — the wall is purely size. Manual
  upload via the AIOS Workspace hub (`/internal/workspace`) or drag into the Drive folder beside
  the template (`The_Station_Investor-2023-09-18.pdf`, folder `1nL2nPc6TIvXmf1tScgusYgejXxj_WWBt`).

## Process

`npm run typecheck` + `npm run build` clean after each change; per-slide overflow verified;
PDF regenerated (15 pages). **Codex second review run twice — both clean.** PR #111 opened against
`main` (pre-push build passed). Nothing merged or deployed at session end.
