# DragonCandy iOS — First Signed Build to TestFlight

**Date:** 2026-08-09
**Status:** Draft — pending spec review
**Author:** Dame (with Claude Code)
**Predecessor:** [2026-06-01 Apple App Store Readiness & Launch](./2026-06-01-apple-app-store-design.md)

---

## Goal

Get a signed DragonCandy build onto the founder's physical iPhone via TestFlight, and use
that device to verify the three native features that shipped in June but have **never once
executed on iOS hardware**.

This is not the start of the iOS project. Phase 1 and four slices already shipped. This spec
covers the remaining distance between "code exists" and "it runs on a phone."

## Non-Goals

- Public App Store listing — screenshots, metadata, App Privacy labels, reviewer notes,
  submission. The listing is gated behind content-delivery stability, the same thing gating
  production launch.
- Push notifications (Phase 2 Slice A) and universal links (Phase 2 Slice D). Both genuinely
  require Apple enrollment, so neither could have preceded this work.
- Codemagic or any cloud-Mac CI. **Deleted from scope** — see Build Environment.
- macOS development-environment setup (repo, worktrees, Node, Supabase CLI, Claude Code).
  Explicitly excluded by the founder, though it must happen before anything here can be built.
- Capacitor version upgrade, unless Apple's current minimum SDK forces one.
- Android, iPad-optimized layouts, offline support.

---

## Background — What Is Already Built

Verified by direct inspection of this worktree on 2026-08-09, not read off the June spec:

| Shipped | Evidence in repo |
|---|---|
| Phase 1 — Capacitor foundation | `capacitor.config.ts`, `ios/App/` Xcode project, `cap:sync`/`cap:open`/`cap:copy` scripts, `src/lib/platform.ts` |
| Phase 2 Slice B — native camera | `@capacitor/camera` ^6.1.3, `src/lib/nativeCamera.ts` |
| Phase 2 Slice C — native share sheet | `@capacitor/share` ^6.0.4, `src/lib/nativeShare.ts` |
| Phase 3a — purchase-CTA gating | `src/components/platform/WebOnly.tsx` — 8 gated blocks across 7 files |
| Phase 3b — UGC block + report | `user_blocks` / `user_reports`, prod-verified 2026-06-07 |
| Phase 0 partial | `/privacy` + `/terms` live; `docs/app-store/app-privacy-data-inventory.md`; account deletion already exists |

Two things the June spec worried about are already correct and need no work. The CSP in
`index.html` is properly Capacitor-aware (`capacitor://localhost` present in `default-src`,
`connect-src`, `img-src`, `media-src`). `Info.plist` carries both `NSCameraUsageDescription`
and `NSPhotoLibraryUsageDescription`.

The shell is also structurally correct: `webDir: 'dist'` with **no `server.url`**, so the app
ships its bundle locally and serves from `capacitor://localhost`. It is a real app, not a
remote-URL wrapper — which is what keeps guideline 4.2 defensible.

### The app has moved on without the shell

`git log --since=2026-06-01 -- src` shows **233 commits and 31 new pages** since the iOS
scaffold was generated. The Donny-first dashboard, `/rewards`, the rebuilt DragonFeed and
creator packages have never been examined through an iOS lens.

The shell itself cannot go stale — `npx cap sync` copies whatever `npm run build` produces —
but the *compliance and suitability review* of those 31 pages has never happened.

---

## How the Claims Below Were Established

Because a spec's own evidence deserves the same scepticism as anything else, each factual claim
here is one of three kinds, and they are not interchangeable:

- **Grepped** against this worktree on 2026-08-09 — the origin inventory, the 82 CORS importers,
  the `WebOnly` sites, the plist keys, the CSP, the bundle-ID references.
- **Probed** against prod on 2026-08-09 — the GoTrue allow-list table in Finding 4, run with a
  mandatory unlisted control.
- **Read from git** on 2026-08-09 — the 233-commit / 31-page counts (`git log --since=2026-06-01`).

One claim is **neither**, and is marked as such where it appears: Apple's current minimum Xcode
and SDK. That is checked on the Mac in Phase 2, not assumed here.

## Findings That Drive This Design

### Finding 1 — `window.location.origin` is a lie inside the shell

In Capacitor, `window.location.origin` evaluates to `capacitor://localhost`. A full grep of
`src/` (verified 2026-08-09) finds **21 occurrences across 14 files**. They do not all want the
same treatment, and that distinction is the actual design problem — a flat list would let an
implementer break auth while fixing share links.

**Category A — the value leaves the device. Must be repointed.**

| Sites | Breakage |
|---|---|
| `AuthForm.tsx:50`, `AuthenticationModal.tsx:44`, `ForgotPassword.tsx:22`, `VerifyEmail.tsx:33,48` | GoTrue gets a `capacitor://localhost/…` redirect. Unopenable from Mail. **Password reset is dead in the native app.** |
| `PromotionCard.tsx:57`, `PromotionDetailPage.tsx:291`, `CreatorPackages.tsx:34` | Slice C's share sheet would share `capacitor://localhost/promo/<id>` — **a shipped feature broken on the only platform it was built for.** |
| `useProjectComplete.ts:151,173,207,227`, `useSponsorshipComplete.ts:111,133,164,187` | `actionUrl` handed to `create-notification`, which **emails it to a different user.** A dead `capacitor://` link lands in someone else's inbox. Worse than the share case, and "mark project complete" is a core business action. |
| `ConnectedAccountsList.tsx:39`, `AccountsTab.tsx:33` | Outstand OAuth `redirect_uri`. See Known Limitations — repointing alone does not make this work. |

**Category B — the value is an in-app navigation base. Must NOT be repointed.**

`AuthPage.tsx:63,194` resolve a `returnTo` against the origin and then assign
`window.location.href`. Repointing them would **eject the user out of the app into Safari
mid-auth.** These keep `window.location.origin`.

**Category C — `safeUrl.ts:4`, resolved.**

It resolves a possibly-relative URL then applies a protocol whitelist; on native a relative
input resolves to `capacitor:`, is dropped, and renders `href="#"`. Reading all eight call
sites settles it: `DragonSharePostCard.tsx:42`, `CreatorDragonShare.tsx:277`,
`CampaignDetailModal.tsx:329`, `RestaurantProfileCard.tsx:90-101`,
`CreatorProfileModal.tsx:175-268` and `MessageBubbleEnhanced.tsx:192` all pass **absolute
external URLs read from the database** (`post_url`, `file_url`, `website_url`, social URLs,
`attachment_url`), so the base argument is never used and they are unaffected either way.

The single exception is `DonnyMessage.tsx:84`, where Donny's generated markdown may carry a
**relative in-app route** — Category B. The split is clean and the helper is not doing two
jobs, so this is a one-line confirmation during Component 1, not open design work.

**The rule an implementer applies, so a future re-grep is decidable:** if the resulting string
is consumed by anything outside the WebView — an email, a share sheet, a third party, another
user — it is Category A. If it is consumed by in-app navigation, it is Category B.

### Finding 2 — the native origin is not trusted by any edge function, and fixing it requires a fleet redeploy

`supabase/functions/_shared/origins.ts` composes **7 origins** into `cors.ts`.
**`capacitor://localhost` is not among them.** Supabase REST and Auth send permissive CORS of
their own, so login and direct table queries would work — but the custom edge functions would
fail. That is Donny, campaign generation, payments, essentially the product.

**The part that changes the plan:** `_shared/*` is bundled into each function *at deploy time*.
A grep confirms **85 imports of `_shared/cors.ts` or `_shared/origins.ts` across 82 function
files.** Editing the allow-list is therefore **inert on prod until each consuming function is
redeployed** — precisely what `docs/wiki/concepts/domain-migration-io-to-com.md` records about
why the `.com` expansion needed 82 individual redeploys.

So a deploy phase is mandatory, not optional, and PR #415 just made fleet redeploys a
known-risk operation with a canary rule. Three functions need nothing: `outstand-proxy:45` and
`social-proxy:44` hardcode `Access-Control-Allow-Origin: *`, and `verify-on-password-reset:6`
echoes the origin.

This has never fired because the app has never run on a device. It fires on first install.

### Finding 3 — the bundle ID predates the domain decision

`capacitor.config.ts` carries `appId: 'io.dragoncandy.app'`, chosen when `.io` was the only
domain. A bundle ID is **immutable once the App Store Connect record exists**; changing it
afterwards means a new listing, losing reviews, ratings and TestFlight testers. Today it is a
two-file edit.

### Finding 4 — the domain migration is two phases behind the founder's understanding

The founder stated that `dragoncandy.io` now redirects to `dragoncandy.com`. **It does not
yet.** Probed against prod on 2026-08-09 using a bogus-token `/auth/v1/verify` with a
mandatory unlisted control:

| `redirect_to` sent | `Location` returned | Meaning |
|---|---|---|
| `https://dragoncandy.com/auth/update-password` | echoed back | `.com` **is** allow-listed |
| `https://dragoncandy.io/auth/update-password` | echoed back | `.io` is allow-listed |
| `https://dragoncandy.com/` | echoed back | The **bare apex** is listed — this is what `AuthForm.tsx:50` and `AuthenticationModal.tsx:44` send after repointing |
| `https://www.dragoncandy.com/` | echoed back | `www` is listed too |
| `https://unlisted-control-probe.invalid/x` | `https://dragoncandy.io/` | **Site URL is still `.io`** |

The control behaving differently from all four test rows is what makes the result trustworthy;
without it, an endpoint that echoed everything would look identical to a correct allow-list.

This matches `docs/wiki/concepts/domain-migration-io-to-com.md`: Phase 1 (EXPAND) shipped,
Phase 2 (SWITCH — Site URL, `APP_URL`) and Phase 3 (REDIRECT — the `.io` 301) have not.

**Consequence for this design: none, by construction.** `publicOrigin()` reads the canonical
constant rather than hardcoding, and the value stays correct after Phase 2 flips.

One distinction to hold onto, because these two facts sit close together and collapsing them
would be costly: `.com` is allow-listed **and deployed** across the 82 functions — that was
migration Phase 1, which shipped. The `capacitor://localhost` addition in Component 2 is a
*new* edit to the same file and is **not** deployed. The first does not discharge the second.

Note the Vercel
apex currently 308s to `www`, so a `.com` link takes one extra hop; both are allow-listed and
browsers reapply the URL fragment across a redirect, so auth returns survive it.

---

## Design

### Component 1 — `CANONICAL_APP_ORIGIN` and `src/lib/publicOrigin.ts`

**First, a canonical-origin contract that does not currently exist.** The obvious move —
deriving from `APP_ORIGINS[0]` — is wrong. That array is an *allow-list*; its ordering carries
no stated meaning, and its own comment says both TLDs stay listed with `.io` removed "last, or
never." A reorder would silently repoint the native app.

**`DEFAULT_ORIGIN` is not the alternative, and calling it the canonical marker would be a
misreading.** `_shared/origins.ts:44-51` states plainly that it is the ACAO value emitted when
the caller's `Origin` is absent or untrusted — "a cosmetic default, not a security boundary."
It answers a different question entirely.

So: introduce **`CANONICAL_APP_ORIGIN = 'https://dragoncandy.com'` in
`src/lib/allowedOrigins.ts` only.** Frontend-only, because `publicOrigin()` is the only
consumer this spec creates — the same reasoning that removes the frontend CORS mirror in
Component 2, applied symmetrically. If a Deno consumer appears later (the migration doc records
hard-coded `|| 'https://dragoncandy.io'` fallbacks in edge secrets at
`domain-migration-io-to-com.md:106-109`), adding the constant there is that workstream's call,
not this one's.

**It is deliberately ahead of `DEFAULT_ORIGIN`, and it never flips.** `CANONICAL_APP_ORIGIN`
holds the post-migration value today; migration Phase 2 closes the gap by moving
`DEFAULT_ORIGIN` `.io` → `.com` to meet it. Nothing about this constant changes at Phase 2 —
an instruction to "flip it alongside" would send a future engineer to edit a value that is
already correct.

**Test invariants**, chosen to survive every migration phase rather than merely detect the
`APP_ORIGINS` reorder they were written for: assert `APP_ORIGINS.includes(CANONICAL_APP_ORIGIN)`
and `ALLOWED_REDIRECT_ORIGINS.has(CANONICAL_APP_ORIGIN)` — *a link we mint must be one we accept
back* — and keep a literal assertion alongside them.

**Then the seam**, following the pattern `nativeCamera.ts` and `nativeShare.ts` established: a
plain function, not a hook, gated by the existing `isNativeApp()`.

```
publicOrigin(): string
  web    → window.location.origin      (byte-identical to today)
  native → CANONICAL_APP_ORIGIN
```

**Only Finding 1's Category A sites are repointed.** Category B keeps
`window.location.origin` — including `DonnyMessage.tsx:84`, the single `safeUrl` site Finding 1
resolves as Category B. That resolution stands; confirm it in passing rather than re-deriving
it. Web behavior is unchanged everywhere.

### Component 2 — native origin in the CORS allow-list, then a canaried redeploy

Add a `NATIVE_APP_ORIGINS` group to `supabase/functions/_shared/origins.ts` containing
`capacitor://localhost`, composed into **`cors.ts` only** — deliberately not into the
email-redirect allow-list, which must keep pointing at real web URLs.

**Do not mirror this group into `src/lib/allowedOrigins.ts`.** That file exports exactly one
consumed value, `ALLOWED_REDIRECT_ORIGINS`, used only at `AuthPage.tsx:64,195` to decide where
a session `access_token` may be sent. There is no CORS consumer in the Vite bundle, so a mirror
is either dead code or — worse — an implementer folds the native origin into the app's one
credential boundary. This group is Deno-only. `src/lib/allowedOrigins.test.ts` should assert
that `ALLOWED_REDIRECT_ORIGINS` does **not** contain `capacitor://localhost`, so the mistake
cannot be made later.

**This weakens nothing.** CORS is enforced by browsers; a non-browser caller ignores it
entirely, so it was never the security boundary. Authorization continues to rest on the JWT.

**The redeploy is part of this component, not a footnote.** Per Finding 2 the edit is inert
until each function ships. Follow #415's canary rule: deploy **`donny-orchestrator` alone
first**, prove it from the device (checklist #3), then fan out. Scope and remainder are handled
in Phase 1b, which states the predicate mechanically rather than by description.

### Component 3 — bundle ID, and the five documents that forbid it

`capacitor.config.ts:4` `appId` → `com.dragoncandy.app`, plus `PRODUCT_BUNDLE_IDENTIFIER` at
`ios/App/App.xcodeproj/project.pbxproj:357` and `:376` — Debug and Release. Verified those are
the only references in `ios/`.

**Five committed documents currently say this identifier must not change**, one of them a wiki
page synced into Donny's RAG. They are Component 3 deliverables, not follow-up:
`docs/wiki/concepts/domain-migration-io-to-com.md:119-124` (a "Must NOT change" section naming
it explicitly), `docs/runbooks/capacitor-ios.md:25`,
`docs/wiki/entities/capacitor-native-shell.md:20` and `:53`, and
`docs/wiki/sources/apple-app-store-capacitor-phase1-session.md:18`. The wiki's own rule is to
flag contradictions rather than silently resolve them; leaving these would put a false
constraint into Donny's retrieval.

**Ordering rule:** this merges *before* the App Store Connect record is created. The record is
what freezes the identifier.

### Component 4 — bounded purchase-CTA audit

Split deliberately, because "audit 31 pages" is unbounded and would swallow the spec.

**Static pass (bounded, mechanical).** A grep over a fixed predicate set —
`create-checkout-session`, `create-billing-portal-session`, `checkout_url`, `billingRoute`,
`/pricing`, `"Upgrade"` — which today returns a small closed set: `PricingPage.tsx:32,37`,
`OrgBillingPage.tsx:59,137,141`, `DonnyChatView.tsx:98`, and the three Outstand upgrade links.
All are already gated (`PricingPage.handleSelectTier` is unreachable because
`TierComparisonGrid.tsx:121` wraps its only caller). The deliverable is confirming that set is
still closed after 233 commits, and gating anything new.

**Device pass (bounded by naming).** Checklist #6 walks an explicitly named short list, not
"31 pages" — many of those need data states a single founder account cannot produce in one
sitting (a package order, a guest order token, a crew, a pending invite, a completed
collaboration, and brand role behind `BRAND_ROLE_ENABLED`). The list is fixed in the plan.

### Component 5 — `ITSAppUsesNonExemptEncryption`

`ios/App/App/Info.plist` lacks this key. Without it **every** upload parks in App Store Connect
awaiting the export-compliance questionnaire before the build is installable — friction landing
squarely on Wednesday's critical path, removed permanently by one plist key.

### What does not change

The web app at dragoncandy.io / dragoncandy.com. Supabase schema, RLS, auth. Routing, React
Query patterns, the design system. Marketplace Stripe Connect flows. **No database migration is
required** — but an edge function deploy is, per Component 2.

---

## Build Environment

**The founder's 14-inch MacBook Pro (M5 Pro) arrives Wednesday 2026-08-12, which deletes the
entire cloud-CI phase.** The June spec called Phase 4 the highest-friction step in the project;
a local Mac removes it rather than solving it.

What the Mac provides that Codemagic could not: Xcode with automatic signing (materially
gentler than CI signing), the iOS Simulator, `npx cap open ios`, direct TestFlight upload, and
**Safari Web Inspector against a physical iPhone** — the only real debugger for a `WKWebView`
app, and macOS-only.

CI is deferred until builds are routine, which is when CI actually earns its keep.

---

## Sequencing

### Phase 0 — today, in parallel with repo work

1. Create the Apple ID against `appstore@dragoncandy.com` (Workspace is live), with 2FA on a
   trusted number.
2. Enroll **Individual** at $99/yr. Approves in 24–48h, needs no D-U-N-S and no verification
   call — so it is approved and waiting by Wednesday. Migration to an Organization account is
   deferred to before public launch, as previously decided.
3. **Do not create the App Store Connect app record yet** — it waits on the bundle-ID merge.

### Phase 1 — repo work, today through Tuesday

Components 1–5 above, on the existing `worktree-dc-apple-store` branch. `npm run build`,
`npm run typecheck`, `npm run lint`, `npm run test`, then the `data-exposure-reviewer` subagent
(Component 2 touches an allow-list), then the mandatory Codex second review, then PR.

### Phase 1b — canaried edge function deploy, before Wednesday

Merging ships the frontend only. Deploy **`donny-orchestrator` alone** and verify the deployed
source actually carries `capacitor://localhost` — reading the source, not the version number,
because "merged ≠ deployed" has bitten this project repeatedly. Do this *before* Wednesday so
the device session is not spent diagnosing a deploy.

**The scope predicate, stated mechanically** so the plan can enumerate it rather than argue
about it: grep `supabase.functions.invoke(` in `src/`, minus callers reachable only from
`/internal`. The honest predicate is narrower than "functions the app calls" — a function
invoked server-to-server or by cron carries no browser `Origin`, and CORS applies only to the
outermost response, so inner hops need nothing.

**What a partially-deployed fleet looks like on the device, because this is the expected
Wednesday state and not a failure.** An un-deployed function answers a `capacitor://localhost`
caller with `Access-Control-Allow-Origin: https://dragoncandy.io`; `WKWebView` blocks the
response and supabase-js surfaces a generic fetch error **indistinguishable from "this feature
is broken on iOS."** Anticipating that is most of Phase 1b's value.

**Open — the remaining ~77 functions have no owner.** An earlier draft deferred them to the
domain-migration workstream "which already owns fleet redeploys." That is not supported: the
82-function sweep was migration **Phase 1 (EXPAND), already shipped**, and the remaining phases
at `domain-migration-io-to-com.md:104-113` are secrets, GoTrue Site URL, the Vercel apex↔www
primary, the `.io` 301, content and mail — none of which is a redeploy, and changing edge
secrets requires none. The natural closure condition is the `DEFAULT_ORIGIN` `.io` → `.com`
flip, which *is* a code change in `_shared/origins.ts` and would force a sweep — but migration
Phase 2 does not currently list it. **Filed here as an open item rather than assigned to a
workstream that has not agreed to it.**

### Phase 2 — Wednesday, on the Mac

Environment setup (out of scope here, but blocking). Then `npm install`, `npm run build`,
`npx cap sync ios`, `npx cap open ios`. Sign in to Xcode, select the team, automatic signing.
Run the Simulator first — free and fast, and it catches boot failures, CSP blocks and layout
breakage immediately. Then run on the physical iPhone over cable with Web Inspector attached.

Verify Apple's current minimum Xcode and SDK for new submissions **on the Mac, from Apple** —
the project targets iOS 13.0 on Capacitor 6, and whether that still satisfies Apple in August
2026 is not something to assume. Upgrade Capacitor only if forced.

### Phase 3 — TestFlight

Archive, upload, internal tester (founder only). External testers are out of scope.

---

## On-Device Verification Checklist

This is the actual deliverable. Three shipped features have never executed on iOS.

**Carry Phase 1b's deployed-function list into the session as a reference sheet.** The walk in
#6 touches surfaces calling functions outside the fan-out set, and per Phase 1b an un-deployed
function fails in a way indistinguishable from a genuine iOS bug. Without that list in hand the
session cannot interpret its own failures — which would corrupt the one output the whole
exercise exists to produce.

| # | Check | Why it matters |
|---|---|---|
| 1 | App boots; Web Inspector console is clean | Proves CSP and the bundle are sound |
| 2 | Login succeeds | Supabase Auth path |
| 3 | **Donny responds** | The single best proof the CORS fix works — highest-value edge function |
| 4 | Native camera capture with a real camera | Slice B, never run; the Simulator cannot fake this |
| 5 | Share sheet emits `https://dragoncandy.com/...`, not `capacitor://...` | Slice C, currently broken by Finding 1 |
| 6 | Walk the 8 known purchase CTAs plus the named short list from Component 4 | Guideline 3.1; a single miss is a rejection. **Named list, not "31 pages"** — see Component 4 |
| 7 | Safe area at notch and home indicator | `dvh` and `env(safe-area-inset-bottom)` were tuned for mobile Safari, not `WKWebView` |
| 8 | `#main-content` scrolling behaves | This app's document deliberately never scrolls |
| 9 | Password reset reaches Safari and works | Known limitation, verified rather than assumed |

---

## Testing

`publicOrigin()` gets a unit test in the node environment mocking `@capacitor/core`, mirroring
`platform.test.ts` and `nativeShare.test.ts`. Both branches asserted.

The CORS change has no meaningful unit test; it is proven by check #3 on a real device.

Everything else on the checklist is manual device verification. Automating it would be theatre —
the entire point is that a real `WKWebView` on real hardware behaves differently from every
environment we can reach from Windows.

Repo gotcha to respect: Vitest's global environment is `node`, and DOM tests need
`// @vitest-environment jsdom` as line 1. `publicOrigin` is a plain function, so it needs
neither.

---

## Known Limitations, Shipped Knowingly

- **No push notifications, no universal links.** Slices A and D remain.
- **Auth emails open in Safari, not the app, and that session does not carry across.** A
  consequence of deferring universal links. Acceptable for a founder-only TestFlight on an
  existing account; **not acceptable for public release**, and it must be closed by Slice D.
- **Signing up for a new account inside the iOS app does not work end to end.** `AuthForm.tsx:50`
  sends the confirmation to the canonical web origin, so the user confirms in Safari and never
  returns to the app. Log in with an existing account for TestFlight.
- **Outstand social-account linking is web-only in the iOS app until Slice D.** Repointing the
  `redirect_uri` to the canonical origin stops the provider rejecting it, but the callback then
  completes in Safari against the web app and has no route back into the shell — there is no
  `@capacitor/app`, no `appUrlOpen` listener and no `@capacitor/browser` anywhere in the tree.
  Repointing converts a hard rejection into a silent dead end, which is not obviously better;
  the honest fix is to surface it as unavailable on iOS and close it with Slice D.
- **Camera is photo-only** — Capacitor's Camera plugin cannot record video. Video stays on the
  file picker.
- iPad runs in iPhone compatibility mode.

## Expected Friction on First Upload (not failures)

- **`ITMS-91053` privacy-manifest warning email.** There is no `PrivacyInfo.xcprivacy` in
  `ios/`. Informational for TestFlight; noted here so it does not read as a rejection on the day.
- **The app icon is still the Capacitor template.** `AppIcon.appiconset/` contains only
  `AppIcon-512@2x.png`. Upload validation passes, but confirm it is DragonCandy's icon before
  archiving.

---

## Risks & Open Questions

1. **The `WKWebView` may misbehave in ways nobody has predicted.** This is the accepted purpose
   of the exercise, and Web Inspector is the mitigation. It is also the largest unknown.
2. **The edge function redeploy is the highest-risk step in Phase 1.** PR #415 established that
   a bundler change can boot-break a function, hence the canary. If the canary fails, Wednesday
   proceeds without checklist #3 — but that outcome is **Success Criterion 2 unmet and the
   build reported as a partial success**, not a pass. Stated this way deliberately: "still
   better than no build" is true and is also exactly how an incomplete result gets written up
   as done.
3. **Apple's current minimum SDK is unverified** and may force a Capacitor upgrade, which would
   expand scope beyond this spec. Checked in Phase 2; if it forces an upgrade, that becomes its
   own spec.
4. **macOS environment setup is out of scope but on the critical path**, and it lands the same
   day as the build. Realistically it consumes some of Wednesday.
5. **The Component 4 audit may surface more than purchase CTAs.** Findings that are not
   rejection-blocking should be filed, not fixed inline, or this spec grows without bound.
6. **Open — and the only genuinely unassigned item in this spec:** the ~77 edge functions
   outside Phase 1b's canary and fan-out set have no owner and no trigger. See Phase 1b. This
   does not block TestFlight; it does mean the allow-list is half-applied on prod indefinitely
   unless someone names the closure condition.

---

## Success Criteria

1. A signed build reaches the founder's physical iPhone through TestFlight.
2. Login and Donny both work on device — proving the edge-function path end to end.
3. Native camera capture produces a real photo upload.
4. The share sheet emits an openable `https://dragoncandy.com/...` link.
5. No purchase or subscription CTA is reachable anywhere in the iOS app.
6. The web surface is provably unregressed: `publicOrigin()`'s web branch returns
   `window.location.origin` (asserted by unit test), and the Vite build output for the touched
   files is otherwise unchanged. Stated this way because "byte-unchanged" is unfalsifiable once
   the seam lands.
