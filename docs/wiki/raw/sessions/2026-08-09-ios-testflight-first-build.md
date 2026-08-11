# iOS — first signed build to TestFlight (2026-08-09/10)

Branch `worktree-dc-apple-store`. Spec:
`docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md`. Plan:
`docs/superpowers/plans/2026-08-09-ios-testflight-first-build.md`. Ledger:
`.superpowers/sdd/2026-08-09-ios-testflight-first-build/progress.md`.

## The goal

Get a signed DragonCandy build onto the founder's physical iPhone via TestFlight, and use
that device to verify three native features that shipped in June (Capacitor foundation,
native camera, native share sheet) but had **never once executed on iOS hardware.** Not
the start of the iOS project — the distance between "code exists" and "it runs on a
phone."

## What shipped (Tasks 1–9, all agent-executable repo work)

Three things blocked the shell from working at all, found by grepping this worktree
before any code was written:

1. **`window.location.origin` is a lie inside the shell.** In Capacitor it evaluates to
   `capacitor://localhost` — 21 occurrences across 14 files, sorted into categories by
   whether the value leaves the WebView (must be repointed), is an in-app navigation base
   (must not be), or leaves the device but can't be fixed by repointing alone (the
   Outstand OAuth `redirect_uri` — see below).
2. **No edge function trusted the native origin.** `capacitor://localhost` was absent
   from every CORS allow-list, so the app would reach Supabase REST/Auth but not one
   custom edge function — Donny, campaign generation, payments.
3. **The bundle ID predated the domain decision.** `capacitor.config.ts` carried
   `appId: 'io.dragoncandy.app'`, chosen when `.io` was the only domain, and a bundle ID
   is immutable once an App Store Connect record exists.

Shipped in order:

- **Task 1 — `CANONICAL_APP_ORIGIN` + `publicOrigin()` seam.** A plain function
  (`src/lib/publicOrigin.ts`), following the `nativeCamera.ts`/`nativeShare.ts` pattern:
  returns `window.location.origin` on web (byte-identical) and the new
  `CANONICAL_APP_ORIGIN = 'https://dragoncandy.com'` (in `src/lib/allowedOrigins.ts`) in
  the native shell. Deliberately not derived from `APP_ORIGINS[0]` (an allow-list with no
  ordering contract) or `DEFAULT_ORIGIN` (the CORS fallback, which `_shared/origins.ts`
  itself calls "cosmetic, not a security boundary"). It already holds the post-migration
  value and never flips; migration Phase 2 moves `DEFAULT_ORIGIN` to meet it, not the
  other way around.
- **Task 2 — auth/email redirects repointed** (`AuthForm.tsx`, `AuthenticationModal.tsx`,
  `ForgotPassword.tsx`, `VerifyEmail.tsx`). Password reset and email verification were
  handing GoTrue `capacitor://localhost/…` in the native shell — unopenable from Mail, so
  password reset was dead in the app.
- **Task 3 — shareable links repointed** (`PromotionCard.tsx`, `PromotionDetailPage.tsx`,
  `CreatorPackages.tsx`). The June share sheet would have shared
  `capacitor://localhost/promo/<id>` — a link nobody could open, from the one feature
  whose entire purpose is producing an openable link.
- **Task 4 — notification `actionUrl`s repointed** (`useProjectComplete.ts`,
  `useSponsorshipComplete.ts`, 8 call sites). These are emailed to a **different user** by
  `create-notification` — the worst instance of the bug, since a dead link would land in
  a creator's inbox after their project was marked complete.
- **Task 5 — Outstand OAuth declared unavailable on iOS, not repointed.** Repointing
  `redirectUri` alone stops the provider rejecting a `capacitor://` value, but the OAuth
  callback then completes in Safari against the web app with no route back into the shell
  (no `@capacitor/app`, no `appUrlOpen` listener, no `@capacitor/browser` anywhere in the
  tree) — trading a visible rejection for a silent dead end. New
  `ConnectAccountButtonGroupGated` says so explicitly instead of trying, deliberately not
  `<WebOnly>` (which renders `null` — an unexplained missing button is worse).
- **Task 6 — `capacitor://localhost` trusted in the CORS allow-list.** New
  `NATIVE_APP_ORIGINS` in `supabase/functions/_shared/origins.ts`, composed into
  `cors.ts` **only** — deliberately not mirrored into the frontend's
  `ALLOWED_REDIRECT_ORIGINS` (a credential boundary gating where a session
  `access_token` is sent; a non-browser scheme has no business there). CORS is
  browser-enforced, so this weakens nothing — authorization still rests on the JWT. Inert
  on prod until each of the ~82 `_shared/cors.ts`-importing functions redeploys; the
  canary (`donny-orchestrator` alone, then a named fan-out set) is Task 12, deliberately
  **not** run by this agent session — it needs a prod deploy.
- **Task 7 — bundle ID `io.dragoncandy.app` → `com.dragoncandy.app`.** Merged **before**
  any App Store Connect record exists, because the record is what freezes it permanently
  — today it was a free two-file edit. Five committed documents said this must not
  change; the actual count, found only by running the inventory rather than trusting the
  brief, was **seven documents / eight locations** (two more: a live "do not change it
  later" instruction in the June Phase-1 plan, and a "Must NOT change" row in the
  *shipped* domain-migration spec, both missed by the original audit). All updated with a
  superseded note rather than silently overridden — the wiki's own rule is to flag
  contradictions, not resolve them quietly.
- **Task 8 — `ITSAppUsesNonExemptEncryption`.** One `Info.plist` key. Without it every
  TestFlight upload parks behind the export-compliance questionnaire before it's
  installable — friction that would have landed squarely on the Mac-build day.
- **Task 9 — bounded purchase-CTA audit.** A fixed grep predicate, not a 31-page walk.
  Conclusion: the 8-CTA gated set is **still closed** after 233 commits since the iOS
  scaffold. Two additional hits outside the predicate table were read in context and
  judged safe (one already independently gated, one dead code with a destination-less
  span).

## The process record — arguably the more useful part

Five distinct defects were found in the **plan itself**, not the code, each caught by a
different party than its author:

1. **Task 4 — a wrong grep count.** The brief predicted `grep -c "publicOrigin()"` would
   return 5 per file (4 usages + the import line); the import line has no parentheses, so
   the correct count is 4. The implementer reported the true number honestly instead of
   fudging the report to match the brief.
2. **Task 5 — an `as never` test fixture that could not typecheck.** Under this repo's
   strict config, a `never`-typed fixture fails `TS2698` ("Spread types may only be
   created from object types") on a JSX spread — and would not have type-checked
   anything even if it had compiled. Replaced with
   `Parameters<typeof ConnectAccountButtonGroupGated>[0]`, judged by review as
   *stronger* than the original brief, not just a fix.
3. **Task 6 — `npx supabase functions download` reverted committed work and truncated a
   live file to 0 bytes.** The brief's own Step 5 instructed running this command to
   typecheck the Deno side. It overwrites local source with the **currently deployed**
   bundle: it silently reverted `_shared/cors.ts` and `_shared/origins.ts` to their
   pre-Task-6 content — undoing the very change under review — and truncated
   `donny-orchestrator/types.ts`, which nine other files import, to **0 bytes**. The
   *commit* was always correct; only the working tree was clobbered, and a routine
   `git add -A` afterward would have silently shipped the reverted CORS fix with no error
   anywhere. Caught by the reviewer noticing three identical file mtimes 17 seconds after
   the commit — not by any typecheck or build, both of which stayed green throughout.
   Repaired with `git checkout --` on the three files (reverting environment damage, not
   a code finding, so it produced no diff and needed no fix round) and the plan corrected
   to a local `deno check` instead.
4. **Task 9 — a hardcoded dead route reintroduced a documented historical bug.** The
   device-pass checklist named `/settings/billing`, which is **not a route in this app**.
   `src/lib/donnyRoutes.ts` carries its own comment recording that this exact path was
   once hardcoded in 8 places and every "Upgrade" CTA 404'd (PR #409, fixed 2026-08-09 —
   two days before this branch). A tester following the stale checklist on build day
   would have 404'd at the one screen holding the two most sensitive gated CTAs. Fixed by
   writing out both real routes, verified line-by-line against `src/App.tsx`.
5. **Task 10 — an expected-hit-count that contradicted the plan's own earlier decision.**
   The pre-PR gate expected exactly 3 remaining `window.location.origin` hits after the
   full sweep; there are 5. The two extra are the Outstand `redirectUri` sites, which are
   correct-by-design **because Task 5 gated the consumer instead of repointing the
   value** — the plan's Step 2 gate had not been updated to reflect the plan's own Task 5
   design. Verified harmless by reading the component: on native,
   `ConnectAccountButtonGroupGated` returns early and never reads `props`, so the
   `capacitor://` value is computed and discarded.

Two separate environment casualties, both downstream of the same Task 6 troubleshooting:

- **`npx supabase functions download`** (defect 3 above) — reverted `cors.ts`/
  `origins.ts` and zeroed `types.ts`.
- **`deno install`**, run after `deno check` failed to resolve `npm:` specifiers locally.
  It rewrites `node_modules/` into Deno's own layout: it deleted npm's
  `.package-lock.json` marker and installed **vitest 4.1.10** under
  `node_modules/.deno/` in place of the lockfile's pinned **4.1.2**. Every subsequent
  `vitest run` then died with `ERR_PACKAGE_PATH_NOT_EXPORTED: './module-runner'` — while
  `npm run build` and `npm run lint` kept passing, so the damage stayed **invisible for
  four tasks** (Tasks 6 through 9) until Task 10 ran the full gate suite and every test
  file failed at once. The implementer's own report *did* say "`deno install` ran but did
  not resolve the issue" — the controller read past that line, so the miss belongs to
  the review process, not just the tooling. Recovered with `npm ci` (vitest back to
  4.1.2, `.deno` directory removed, lockfile marker restored). Side effect: `tsc --noEmit`
  dropped from ~420s to ~69s once the tree was clean again, so part of the "seven-minute
  typecheck" earlier in the branch was itself the damaged environment.

The plan was corrected in place after each defect rather than silently worked around, and
each correction is visible in `.superpowers/sdd/.../progress.md` as its own dated entry.

## Gate results (Task 10, on commit `69ca2ad8`)

Category B (in-app navigation) verified protected — `AuthPage.tsx:63,194` and
`safeUrl.ts:4` still hold raw `window.location.origin`. Lint 0 errors / 119 warnings, all
pre-existing. Build clean. Tests: 3 files / 11 tests passed (post-`npm ci` recovery).
`npx tsc --noEmit -p tsconfig.app.json` exits 0 in 69s. The `data-exposure-reviewer`
subagent **PASSED**, tested rather than accepted the "CORS is not authorization" claim —
enumerated all 11 origin/referer reads in `supabase/functions`, none is an access
decision; confirmed no `Access-Control-Allow-Credentials` anywhere; confirmed
`NATIVE_APP_ORIGINS` is absent from all three other consumer sets; confirmed
`ALLOWED_REDIRECT_ORIGINS` still holds exactly 6 members. The mandatory Codex second
review came back **CLEAN** with an explicit "no discrete introduced issues" verdict (not
a blank run). Steps 6–7 of Task 10 (push, open PR, merge) were **deliberately not run** —
outward-facing, needs founder authorization; nothing left this machine as of the gate.

## The final fix wave (this document's own session)

A whole-branch review of the merged-but-not-yet-pushed work surfaced five findings, all
documentation/comments — **no code defect was found, no behaviour changed**:

- **A missing known limitation.** A completion notification triggered from the iOS app
  now deep-links its recipient to `.com`, while every other transactional email that same
  recipient gets still points at `.io` (the domain migration's `APP_URL` flip is Phase 2,
  not yet done). Verified against `send-notification-email/index.ts` before writing
  anything: the four templates the eight `actionUrl` call sites select render
  `href="${data.actionUrl || ...}"`, so Task 4's `publicOrigin()` value flows straight
  into the link, while every other template hardcodes `${baseUrl}`. Sessions are
  origin-scoped `localStorage` and the `.com` apex 308s to `www` (both allow-listed), so
  a recipient with a live `.io` session who clicks the `.com` link lands **signed out**.
  Added to the spec's Known Limitations and as a new on-device verification step in the
  plan's Task 14.
- **The knowledge layer itself was the merge blocker** — none of it existed before this
  session: no `docs/SHIPPED_LOG.md` entry, no `PROJECT_CONTEXT.md` refresh, no wiki
  ingest. This document, the accompanying concept-page update, the `index.md`/`log.md`
  updates, and the `PROJECT_CONTEXT.md` §5 line are that gap closed.
- **A weaker justification on the RAG-visible copy.** The domain-migration spec's "Must
  NOT change" row was corrected in place ("presumed a listing and users; there were
  neither"), but the wiki page synthesized from it still led with the original
  unqualified sentence, correcting it only in a trailing callout — and the wiki page,
  not the spec, is what feeds Donny's `donny_knowledge` RAG. Brought into line with the
  spec's wording.
- **The origin-classification rule undocumented in code.** `publicOrigin.ts` named only
  one of the four files that deliberately keep raw `window.location.origin`
  (`AuthPage.tsx`). Extended to name all four and why each stays raw; added a one-line
  comment at `safeUrl.ts:4`, the one site among them where repointing would actually
  change behaviour and which had no note anywhere in code; and fixed the spec's own
  Finding 1 table, which still filed the two Outstand sites under "Category A — must be
  repointed" even though the shipped design (Task 5) leaves them raw and gates the
  consumer instead — the plan's fifth defect, still visible in the merged artifact.
- **The mirror-rule exception undocumented on one side.** `allowedOrigins.ts` says a host
  added to one origin file "almost always belongs in the other." `NATIVE_APP_ORIGINS` is
  a deliberate exception, Deno-side only — the Deno file already said so;
  `allowedOrigins.ts` did not. Added the note there too.

## State as of writing

All five findings applied as documentation/comment-only edits; `npm run build` verified
clean. Work sits on `worktree-dc-apple-store`, not yet pushed or opened as a PR — that
step, and Tasks 11–14 (founder Apple enrollment, the canaried edge-function redeploy, and
the physical-device build + on-device verification once the founder's Mac arrives
2026-08-12), are all still ahead.
