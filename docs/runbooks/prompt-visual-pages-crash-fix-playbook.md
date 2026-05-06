# Visual Pages Crash Fix Playbook — DragonCandy Pre-Launch

**Repo:** `C:/GIT/dragoncandy/`
**Scope:** Creators page, Reels/feed, campaign previews, any grid of user-uploaded media.
**Symptom:** Pages "reset" / remount / crash when loading reels, thumbnails, and creator lists — on both desktop and mobile.
**Launch window:** Production launch is imminent. Crash fixes only. Visual polish is explicitly deferred to a separate post-launch playbook.
**Rule:** One surgical change at a time. No batching. No new dependencies without approval. Desktop Tailwind `lg:` classes are PROTECTED.

> **Note on slash commands:** This playbook uses `/find-skills`, `/using-superpowers`, and references `frontend-design`. If any command name differs in your local Claude Code CLI, find-and-replace before running.

---

## PHASE 0 — SKILL DISCOVERY (5 minutes, no code changes)

1. Run `/find-skills` with the query: **"debugging React rendering crashes image optimization Supabase storage realtime subscription cleanup"**
2. List every skill returned. For each, note: name, one-line purpose, whether it's relevant to this crash.
3. Do NOT auto-execute any skill. Just catalog them. The `frontend-design` skill, if surfaced, is for reference only in this playbook — it is NOT the primary driver and must not be invoked to restyle components in Phase 2.
4. Output the skill list to console and stop for my acknowledgment before proceeding to Phase 1.

---

## PHASE 1 — READ-ONLY DIAGNOSTIC AUDIT (NO CODE CHANGES)

Produce `visual-pages-audit-report.md` at the repo root. Touch no other files.

### 1. Repo grep sweep
- [ ] `getPublicUrl` — every call site. Flag any whose result feeds an `<img>`/`<video>` without going through `/storage/v1/render/image/public/...?width=...&quality=75`.
- [ ] `<img` / `<Image` — every usage on creator, campaign, reel, or content item media. Flag any missing `loading="lazy"`, explicit `width`/`height`, or null-src fallback.
- [ ] `.map(` over creators, campaigns, reels, content items — flag any that dereference image fields without null-guards.
- [ ] `supabase.channel(` / `.subscribe(` — every Realtime subscription. Flag any whose enclosing `useEffect` does not return a cleanup calling `removeChannel` or `unsubscribe`.
- [ ] `onAuthStateChange` — flag any data-fetching `useEffect` that depends on `session`/`user` in a way that causes refetch storms on token refresh.
- [ ] `ErrorBoundary` — confirm which routes it wraps and whether it logs caught errors with stack traces.
- [ ] `<video>` — any tag sourcing directly from `supabase.storage`? Flag all. (Reels on Supabase Storage is a flagged architectural issue; short-term mitigation only in Phase 2 — no Mux/Cloudflare Stream migration this week.)

### 2. Browser diagnostics (manual, Chrome DevTools on dragoncandy.io incognito)
For Creators page, Reels page, and one campaign preview:
- [ ] **Console tab:** every error/warning during load and scroll, copied verbatim.
- [ ] **Network tab (Img filter):** total image count, total transferred size, largest single image, `object/public` vs `render/image/public` ratio.
- [ ] **Performance tab:** 10-second scroll trace, JS heap peak, long tasks > 200ms.
- [ ] **Desktop Chrome at 1920x1080** — reproduce crash? Note exact trigger.
- [ ] **iPhone 12 Pro emulation + 4x CPU throttle** — reproduce crash? Note exact trigger.
- [ ] **Real mobile device if available** — same checks.

### 3. Supabase dashboard (read-only)
- [ ] Buckets holding avatars, thumbnails, reels — note public/private, size limits.
- [ ] Indexes on `creators`, `campaigns`, `content_items` — flag missing indexes on columns used in `ORDER BY` / `WHERE` for list queries.
- [ ] Postgres + Edge Function logs, last 24h, errors tied to these pages.

### 4. Produce `visual-pages-audit-report.md`
Triage every finding:
- **P0** — directly causes the crash on desktop or mobile
- **P1** — perf degradation that could trigger crash under load
- **P2** — hygiene

For each P0: file path, line number, current code, proposed one-sentence fix, blast radius estimate, and which view (desktop / mobile / both) it affects.

**STOP. Wait for explicit approval of each P0 before Phase 2.**

---

## PHASE 2 — CRASH FIXES, ONE AT A TIME (via /using-superpowers)

Invoke `/using-superpowers` at the start of Phase 2 to enforce disciplined execution. For each approved P0, then each approved P1, run this loop exactly:

1. `git pull origin main --rebase`
2. State the single fix, file(s) touched, and whether it affects desktop view, mobile view, or both.
3. Make the change. Touch nothing else. Do NOT modify any `lg:` Tailwind class. Do NOT restyle, recolor, or reflow any component — this is a crash fix, not a redesign.
4. `npm run build` — fix errors before continuing.
5. **Dual-view verification (both required):**
   - Desktop Chrome 1920x1080 — page loads, scrolls, navigates away and back, no console errors, no reset.
   - iPhone 12 Pro emulation + 4x CPU throttle — same checks.
6. `git add` only the files for this fix. Commit with descriptive message (e.g., `fix(creators): switch avatar URLs to Supabase image transform endpoint`).
7. `git push origin main`.
8. Report completion. Wait for approval before the next fix.

### Expected highest-leverage fixes (based on my upstream diagnosis)
- **Switch `getPublicUrl` → `render/image/public?width=X&quality=75`** per call site. One commit per component. This is likely the single biggest win.
- **Null-guard image fields in `.map()` loops** with explicit fallbacks.
- **Add `useEffect` cleanup** to leaking Realtime subscriptions.
- **Decouple list-query `useEffect`s from `session` identity changes** so token refreshes don't trigger refetch storms.
- **Short-term reels mitigation only:** poster images + `<video preload="none">` + lazy mount. No infrastructure migration.

### Hard constraints
- No new dependencies without explicit approval.
- No bucket permission or RLS changes — flag in report, don't modify.
- No schema migrations except adding indexes, one per commit, only after explicit approval.
- **Scope stop condition:** if a fix requires touching more than 3 files or rewriting a component, STOP and surface as a separate planning item.
- **Styling stop condition:** if you find yourself about to change a color, font, spacing value, or layout class for any reason other than fixing a crash, STOP. That is Phase 3 work and Phase 3 is a different playbook.

---

## DEFINITION OF DONE
- All approved P0 items fixed, pushed, and verified on desktop Chrome + iPhone 12 Pro emulation.
- Creators, Reels, and one campaign preview page survive 3 consecutive navigate-away-and-back cycles with scroll on both viewports — zero console errors, zero resets.
- `npm run build` passes clean.
- Desktop `lg:` layouts visually unchanged from pre-audit (spot-check 3 pages side-by-side).
- A one-paragraph summary appended to the audit report listing what was fixed, what was deferred, and what's flagged for the post-launch polish playbook.

---

## OUT OF SCOPE (deferred to post-launch polish playbook)
- `/frontend-design` visual refinement of creator cards, reel players, campaign previews
- Reels migration to Mux / Cloudflare Stream / Bunny Stream
- Design system updates, typography, color tokens
- New loading skeletons, empty states, micro-interactions
- CDN swap away from Supabase Storage

These will be handled in `prompt-visual-pages-polish-playbook.md` in Week 2 post-launch, informed by real user traffic data.
