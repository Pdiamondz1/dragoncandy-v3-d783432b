# DragonCandy Visual Pages Crash Fix — Claude Code Prompts

**Run from:** `C:/GIT/dragoncandy/` in Claude Code CLI
**Launch window:** Production launch imminent. Crash fixes only. No visual polish, no redesigns, no infrastructure migrations.
**Protected:** Desktop Tailwind `lg:` classes. Do not modify.
**Slash command note:** If `/find-skills` or `/using-superpowers` are named differently in your local setup, find-and-replace before pasting.

---

## RUN ORDER

```
Prompt 1 (skills)  →  [review list]
Prompt 2 (grep)    →  [review audit-part-a-repo.md]
Prompt 3 (browser) →  [YOU run DevTools, paste findings]
Prompt 4 (supabase)→  [YOU run dashboard checks, paste findings]
Prompt 5 (assemble)→  [review visual-pages-audit-report.md, APPROVE each P0]
Prompt 6 (kickoff) →  [paste once to start Phase 2]
Prompt 7 (fix)     →  [REUSE once per approved P0, then once per P1]
```

**Human-executed prompts:** 3 and 4 (Claude Code cannot drive Chrome DevTools or the Supabase dashboard UI).
**Reusable prompt:** 7. Fill in the P0 name and file path each time.
**Hard gate:** Do not paste Prompt 6 until every P0 in the audit report is explicitly approved by you.

---

## PROMPT 1 — Skill Discovery

```
Run /find-skills with the query: "debugging React rendering crashes image optimization Supabase storage realtime subscription cleanup"

List every skill returned. For each: name, one-line purpose, relevance to a crash on pages rendering creator lists, thumbnails, and reels.

Do NOT auto-execute any skill. If the frontend-design skill appears, note it for reference only — it is explicitly out of scope for this crash fix work and must not be invoked to restyle components.

Stop after the list. Wait for my acknowledgment before proceeding.
```

---

## PROMPT 2 — Repo Grep Sweep (Phase 1, Part A)

```
READ-ONLY. Do not modify any file.

Perform a repo-wide grep sweep on C:/GIT/dragoncandy/ and produce audit-part-a-repo.md at the repo root with these sections:

1. getPublicUrl — every call site. For each, flag whether the URL is passed to an <img>/<video> without going through /storage/v1/render/image/public/...?width=...&quality=75.
2. <img / <Image — every usage rendering creator, campaign, reel, or content item media. Flag any missing loading="lazy", explicit width/height, or null-src fallback.
3. .map( — every loop over creators/campaigns/reels/content items that dereferences an image field. Flag missing null-guards.
4. supabase.channel( and .subscribe( — every Realtime subscription. Flag any whose useEffect does not return a cleanup calling removeChannel or unsubscribe.
5. onAuthStateChange — flag any data-fetching useEffect that depends on session/user in a way that causes refetch storms on token refresh.
6. ErrorBoundary — which routes it wraps; whether it logs caught errors with stack traces.
7. <video> — any tag sourcing directly from supabase.storage. List all.

For every finding include: file path, line number, current code snippet.

Do NOT triage yet. Do NOT propose fixes yet. Just catalog.

Stop when audit-part-a-repo.md is written. Do not proceed.
```

---

## PROMPT 3 — Browser Diagnostics Checklist (Phase 1, Part B — HUMAN-EXECUTED)

```
I need to run browser diagnostics manually because you cannot drive Chrome DevTools.

Give me a copy-pasteable checklist for me to run in Chrome DevTools against dragoncandy.io (incognito window) for these pages:
- Creators page
- Reels / feed page
- One campaign preview page

The checklist must cover, for each page:
- Console tab: every error and warning during load and a 10-second scroll
- Network tab (Img filter): total image count, total transferred size, largest single image size, ratio of object/public vs render/image/public URLs
- Performance tab: JS heap peak and any long tasks > 200ms during a 10-second scroll
- Desktop Chrome 1920x1080: does the crash/reset reproduce? What triggers it?
- iPhone 12 Pro emulation + 4x CPU throttle: does the crash reproduce? What triggers it?

Format the checklist so I can fill it in inline and paste it back to you.

After I paste my filled-in findings, write audit-part-b-browser.md at the repo root verbatim from what I pasted. Do not interpret or triage yet.
```

---

## PROMPT 4 — Supabase Dashboard Checklist (Phase 1, Part C — HUMAN-EXECUTED)

```
I need to run Supabase dashboard checks manually.

Give me a copy-pasteable checklist covering:
- Storage → buckets holding creator avatars, campaign thumbnails, reels. Public/private setting, size limits, file count.
- Database → Indexes on creators, campaigns, content_items (or equivalent). Which columns used in ORDER BY / WHERE for list queries lack indexes?
- Logs → Postgres and Edge Function errors tied to these pages in the last 24h.

Format so I can fill in inline and paste back.

After I paste findings, write audit-part-c-supabase.md at the repo root verbatim. Do not triage yet.
```

---

## PROMPT 5 — Audit Report Assembly (Phase 1, Part D)

```
Read audit-part-a-repo.md, audit-part-b-browser.md, and audit-part-c-supabase.md.

Produce visual-pages-audit-report.md at the repo root with P0/P1/P2 triage:
- P0 = directly causes the crash/reset on desktop OR mobile
- P1 = performance degradation that could trigger the crash under load
- P2 = hygiene only

For each P0 include: file path, line number, current code, proposed one-sentence fix, blast radius (how many files/components affected), and which viewport it affects (desktop / mobile / both).

Order P0s by highest leverage first — the single fix most likely to eliminate the crash at the top.

After writing the report, stop and wait for me to explicitly approve each P0 by name before any code changes are made. Do not proceed to Phase 2 on your own.
```

---

## PROMPT 6 — Phase 2 Kickoff

```
Invoke /using-superpowers to enforce disciplined one-commit-at-a-time execution for Phase 2.

Phase 2 rules:
- One P0 fix per commit. No batching.
- Do NOT modify any Tailwind lg: class.
- Do NOT change colors, fonts, spacing, or layout for any reason other than fixing the crash. If you catch yourself about to restyle something, STOP — that is post-launch polish work and out of scope.
- No new dependencies without my explicit approval.
- No RLS or bucket permission changes.
- No schema migrations except adding indexes, one per commit, only after I approve each one.
- Scope stop condition: if a fix requires touching more than 3 files or rewriting a component, STOP and surface as a separate planning item.
- Reels short-term mitigation only (poster images + <video preload="none">). No migration to Mux/Cloudflare Stream/Bunny Stream this week.

Confirm you understand these rules. Then wait for me to specify the first P0 to fix using Prompt 7.
```

---

## PROMPT 7 — Per-Fix Execution (REUSABLE TEMPLATE)

Fill in `[P0_NAME]` and `[FILE_PATH]` each time you paste this. Reuse once per approved P0, then once per approved P1.

```
Fix: [P0_NAME]
File: [FILE_PATH]

Execute the 8-step loop exactly:

1. git pull origin main --rebase
2. State the single fix you are about to make, files touched, and whether it affects desktop, mobile, or both.
3. Make the change. Touch nothing else. Do NOT modify any lg: class. Do NOT restyle anything.
4. npm run build — fix any errors before continuing.
5. Dual-view verification (BOTH required before committing):
   - Desktop Chrome 1920x1080: load page, scroll, navigate away and back. Zero console errors, zero reset.
   - iPhone 12 Pro emulation + 4x CPU throttle: same checks.
   Report results for both viewports.
6. git add only the files changed for this fix. Commit with a descriptive message (e.g., "fix(creators): switch avatar URLs to Supabase image transform endpoint").
7. git push origin main.
8. Report completion with a one-line summary: what was changed, which viewport(s) verified, commit hash.

Stop after step 8. Wait for me to paste the next Prompt 7 instance for the next fix.

If any step fails, STOP immediately and report the failure. Do not attempt to work around it without my input.
```

---

## DEFINITION OF DONE

- Every approved P0 fixed, pushed, verified on desktop Chrome + iPhone 12 Pro emulation.
- Creators, Reels, and one campaign preview survive 3 consecutive navigate-away-and-back cycles with scroll on both viewports — zero console errors, zero resets.
- `npm run build` passes clean.
- Desktop `lg:` layouts unchanged from pre-audit (spot-check 3 pages).
- Summary paragraph appended to `visual-pages-audit-report.md` listing: what was fixed, what was deferred, what's flagged for the post-launch polish playbook.

---

## OUT OF SCOPE (post-launch polish playbook)

- `/frontend-design` visual refinement
- Mux / Cloudflare Stream / Bunny Stream migration
- Design tokens, typography, color system updates
- Loading skeletons, empty states, micro-interactions
- CDN swap away from Supabase Storage

These belong in `prompts-visual-pages-polish.md`, to be written in Week 2 post-launch once real user traffic data is available.
