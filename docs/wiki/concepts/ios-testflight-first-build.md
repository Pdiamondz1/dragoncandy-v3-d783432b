---
title: iOS TestFlight First Build
type: concept
created: 2026-08-10
updated: 2026-08-14
sources: [raw/sessions/2026-08-09-ios-testflight-first-build.md, raw/sessions/2026-08-14-ios-first-physical-device-build.md]
tags: [ios, capacitor, testflight, cors, origin, bundle-id, safe-area, xcode]
---
# iOS TestFlight First Build

Not the start of the iOS project ([[Capacitor Native Shell]] covers Phases 1–2) — the
distance between "code exists" and "it runs on a phone." Three shipped native features
(the Capacitor shell, native camera, native share sheet) had **never once executed on iOS
hardware** before this work, because nothing in the app's origin handling or backend
allow-lists had ever been checked against what Capacitor actually does.

## Why `window.location.origin` cannot be trusted inside the shell

In Capacitor the app serves its bundle locally (`webDir: 'dist'`, no `server.url`), so
`window.location.origin` evaluates to `capacitor://localhost` — a scheme no mail client,
share target, or OAuth provider can open. A grep of `src/` found 21 occurrences across 14
files, and they do not all want the same fix — a flat "replace every occurrence" sweep
would break auth while fixing share links. The dispositive question for each site: **does
the resulting value leave the WebView?**

- **Leaves the device, must be repointed** — auth email redirects, share links,
  notification `actionUrl`s emailed to a different user. Fixed by routing through a new
  seam, `publicOrigin()` (`src/lib/publicOrigin.ts`): returns
  `window.location.origin` on web (byte-identical) and a new constant,
  `CANONICAL_APP_ORIGIN = 'https://dragoncandy.com'`
  (`src/lib/allowedOrigins.ts`), in the native shell.
- **In-app navigation base, must NOT be repointed** — `AuthPage.tsx` resolves a
  `returnTo` against the origin and then assigns `window.location.href`; swapping in the
  canonical origin would eject the user into Safari mid-auth.
- **Leaves the device, but repointing alone doesn't close the gap** — the Outstand OAuth
  `redirect_uri`. Repointing stops the provider rejecting a `capacitor://` value, but the
  callback then completes in Safari with **no route back into the shell** (no
  `@capacitor/app`, no `appUrlOpen` listener, no `@capacitor/browser` anywhere in the
  tree) — trading a visible rejection for a silent dead end. Fixed by gating the
  *consumer* instead of the value: `ConnectAccountButtonGroupGated` returns explanatory
  copy on native before ever reading its props, so the raw `capacitor://` value is
  computed and discarded either way. Deliberately not `<WebOnly>`, which renders `null` —
  an unexplained missing button reads worse than a sentence.

`CANONICAL_APP_ORIGIN` is deliberately **not** derived from `APP_ORIGINS[0]` (an
allow-list whose ordering carries no contract — see [[Domain Migration (.io → .com)]])
and is **not** `DEFAULT_ORIGIN` (the Deno CORS fallback, which `_shared/origins.ts`
itself calls "cosmetic, not a security boundary"). It already held the post-migration
value and never flipped; migration Phase 2 moved `DEFAULT_ORIGIN` to meet it, not the
other way around — so the two now agree, having arrived from opposite directions.

## `capacitor://localhost` had to be added to the backend's trust list too

Getting the frontend right is necessary but not sufficient: no edge function trusted the
native origin either. `NATIVE_APP_ORIGINS` was added to
`supabase/functions/_shared/origins.ts`, composed into `cors.ts` **only** — the app
reaches Supabase REST/Auth (which send their own permissive CORS) regardless, but every
custom edge function (Donny, campaign generation, payments) would 4xx/5xx without it.
**CORS is browser-enforced, so this weakens nothing** — authorization still rests on the
JWT, verified by the `data-exposure-reviewer` subagent rather than assumed.

Deliberately **not mirrored** into `src/lib/allowedOrigins.ts`'s
`ALLOWED_REDIRECT_ORIGINS` — that set is a credential boundary (it gates where a session
`access_token` is sent), and a non-browser scheme has no business in it. The two origin
files otherwise say "a host added to one almost always belongs in the other"
(`allowedOrigins.ts`'s own docblock); `NATIVE_APP_ORIGINS` is the one deliberate,
documented exception on both sides.

Per [[Edge-Function Deploy & Bundling]], this edit is **inert on prod until every
consuming function redeploys** — the same 82-function fan-out class the domain migration
needed. The canary (`donny-orchestrator` alone, verified by reading the deployed source,
then a named fan-out set) is a separate step, deliberately not run by the same session
that wrote the code.

## Bundle ID: the ordering rule, not just the value

`capacitor.config.ts`'s `appId` changed from `io.dragoncandy.app` to
`com.dragoncandy.app` to match the now-primary domain. The value matters less than the
**ordering**: a bundle ID is immutable *once an App Store Connect record exists* — the
record is what freezes it, not the code. Since no record existed, the change was free
today and would not be later. **Seven** committed documents said this must not change
(the original audit found five; running the inventory rather than trusting the brief
found two more — a live instruction in the June Phase-1 plan and a "Must NOT change" row
in the *shipped* domain-migration spec). All seven were updated with a superseded note
rather than silently overridden, per the wiki's own rule to flag contradictions instead
of resolving them quietly.

## Process lessons — the more durable part

**A plan step that reads as diagnostic tooling can be destructive tooling.**
`npx supabase functions download <fn>` overwrites local source with the *currently
deployed* bundle. Run mid-branch to "typecheck the Deno side," it silently reverted two
just-edited files to their pre-task content and truncated a third
(`donny-orchestrator/types.ts`, imported by nine files) to **0 bytes** — while the
git commit remained correct throughout, so only the working tree was clobbered. Neither
`npm run build` nor `npm run lint` caught it; a reviewer noticed three identical file
mtimes 17 seconds after the commit. **Never run this to inspect a deployed function's
source when the same file is under active local edit** — use `deno check` against local
files instead, and accept that Deno may not resolve this repo's `npm:` specifiers rather
than reaching for a fix that fetches the deployed bundle.

**`deno install` and `npm`-managed `node_modules` do not coexist.** Run once to try to
resolve `deno check`'s `npm:`-specifier failure, it rewrote `node_modules/` into Deno's
own layout — deleting npm's `.package-lock.json` marker and swapping the lockfile's
pinned vitest 4.1.2 for 4.1.10. Every subsequent `vitest run` died with
`ERR_PACKAGE_PATH_NOT_EXPORTED: './module-runner'`, while `npm run build` and `npm run
lint` kept passing — so the damage was invisible for four tasks until a full gate run hit
every test file at once. Recovery is `npm ci`. **A failing `deno check` on an npm-managed
frontend repo is an accepted, documented gap — not a problem `deno install` should ever
be reached for.**

**A hardcoded route in a plan can reintroduce an already-fixed bug.** A device-pass
checklist named `/settings/billing`, a route this app does not have —
`src/lib/donnyRoutes.ts` records in its own comment that this exact path was hardcoded in
8 places and every "Upgrade" CTA 404'd, fixed two days before this branch (PR #409). A
plan written without checking it against the current router would have sent a real
tester to 404 at the two most sensitive gated CTAs in the app.

**A gate's expected count must track the plan's own later decisions, not just the code.**
The pre-PR gate expected exactly 3 remaining `window.location.origin` hits; there are 5.
The extra two are the Outstand sites, correct-by-design because a *later* task (5) chose
to gate the consumer instead of repointing the value — the earlier gate step was never
updated to match. Same shape as the spec's own Finding 1 table drifting the same way (see
Known Issues below) — a decision made once needs to be re-asserted everywhere it was
previously assumed, not just where it was made.

## It ran on hardware (2026-08-14) — what the device taught that nothing else could

The Mac arrived, enrollment was approved, and the app ran on a physical iPhone (iOS 26.6) for the
first time. Boot, login and **Donny** all pass — the last of those is the end-to-end proof that the
`capacitor://localhost` CORS path works, which no amount of local reasoning could establish.

**The spec's biggest open risk was a non-issue, and only a build could say so.** Risk 3 read
*"Apple's current minimum SDK is unverified and may force a Capacitor upgrade."* Xcode **26.6**
compiled the project at **iOS 13.0 on Capacitor 6** with no error and no deprecation warning — read
off the compiler invocation (`--deployment-target 13.0`,
`--target-triple arm64-apple-ios13.0-simulator`), not inferred from a green build. No
deployment-target bump, no Capacitor 7. Worth separating: the risk was correct to *hold* and cheap
to *resolve*; its cost was entirely in planning.

**The one real UI defect was invisible to every check this project already runs.** `index.html`
sets `viewport-fit=cover`, so the layout viewport extends under the status bar and Dynamic Island —
and `src/` used `safe-area-inset-top` exactly **once** against **eight** uses of `-bottom`. On the
device the landing logo rendered on top of the clock. In mobile Safari the URL bar occupies that
space, so the page never sits under the status bar and `viewport-fit=cover` costs nothing;
**only a chromeless `WKWebView` exposes it.** Neither `verify-prod`'s both-viewport pass nor
responsive emulation could ever have found it. Fixed across the five real chrome components and
codified in `DESIGN_SYSTEM.md` — full mechanics and the padded/not-padded split in
[[Mobile Viewport & Fixed Positioning]].

**The repo could not build its own native features.** `npx cap sync ios` added
`pod 'CapacitorCamera'` and `pod 'CapacitorShare'` to `ios/App/Podfile` — neither had ever been
committed. A `pod install` without a preceding `cap sync` yields a build with **no camera and no
share sheet**, the two features the device session existed to verify. Wrong in git since the
scaffold; invisible because nobody had ever built the project. `Podfile.lock` and
`App.xcworkspace/contents.xcworkspacedata` were untracked for the same reason and are now committed.

**A whole class of gate can be missing on a new machine.** `codex` — the mandatory second reviewer —
simply did not exist on the new Mac, and a branch could have been finished without anyone noticing
its absence. Neither did the Supabase CLI or `gh`. **When the machine changes, the toolchain that
enforces your rules is itself unverified**; check the enforcers, not just the code.

## Known Issues

- **A completion notification sent from the iOS app deep-links its recipient to `.com`
  while their other transactional emails still point at `.io`.** `useProjectComplete.ts`
  / `useSponsorshipComplete.ts` build `emailData.actionUrl` via `publicOrigin()`, which
  `send-notification-email` renders directly for the `completion_request` /
  `project_completion` / `sponsorship_completion_request` / `sponsorship_completed`
  templates; every other template hardcodes `${baseUrl}` = `APP_URL`, still `.io`
  (domain-migration Phase 2 not done). A recipient with a live `.io` session who clicks
  the `.com` link lands signed out at `/auth` — strictly better than the unopenable
  `capacitor://` link it replaces, and closes when domain-migration Phases 2–3 land.
- **The ~77 edge functions outside the canary/fan-out set have no owner and no trigger**
  for picking up `NATIVE_APP_ORIGINS`. Not on the TestFlight critical path (the app only
  calls a named subset), but the allow-list stays half-applied on prod indefinitely
  unless something names the closure condition — most naturally the domain migration's
  `DEFAULT_ORIGIN` `.io` → `.com` flip, which is a code change and would force a sweep.
  **That flip has now landed** (Phase 2 — it was missing from that phase when this page
  was written, and Codex caught the omission). It does not *compel* the sweep, though:
  a non-redeployed function keeps emitting `.io` as its ACAO fallback, which is cosmetic
  and harmless, so mixed state costs nothing and nothing forces the issue. What the flip
  supplies is a *reason* to sweep that someone owns — the sweep itself is still unowned.
  ~~"cosmetic and harmless"~~ — **corrected 2026-08-14: harmless on the WEB, fatal in the
  native app.** A browser calling from `https://dragoncandy.com` gets its own origin
  echoed and never notices. A `capacitor://localhost` caller gets `https://dragoncandy.io`,
  `WKWebView` blocks the response, and supabase-js surfaces a **generic fetch error
  indistinguishable from "this feature is broken on iOS"** — which is precisely the
  diagnostic trap the spec's Phase 1b warned about. The 13 affected functions are the
  payment surface, so on iOS today every payout, escrow, withdrawal and refund path fails
  this way. The sweep is still unowned, but it is no longer optional-looking: **the same
  mixed state that is cosmetic for the web is a broken feature for the shell.**
- Push notifications and universal links (Slices A/D) remain out of scope — both need
  Apple enrollment.
  ~~"which is itself gated on this branch's bundle-ID merge"~~ — **corrected 2026-08-10:**
  that gate is cleared. The branch merged as **#425** (verified via `gh pr view 425`:
  MERGED 2026-08-10T06:58:20Z), and enrollment was **submitted the same day**
  (Organization enrollment `5HA89RBHQH`). ~~The blocker is now Apple's response, not ours.~~
  **Cleared 2026-08-14: enrollment `5HA89RBHQH` is APPROVED** (founder-confirmed; exact
  approval date unrecorded). Apple is no longer a gate on anything.
- ~~"As of writing, Tasks 11–14 … have not run; the branch is not yet merged."~~ —
  **corrected 2026-08-10.** The branch **is** merged (#425), and ~~the
  `capacitor://localhost` CORS widening rode along with the domain-migration Phase 2
  fleet deploy and was verified live by preflight probe, so the canaried redeploy is
  done too.~~ **FALSIFIED 2026-08-14 — this is true of some functions and false of
  thirteen.** Probing all 50 functions `src/` invokes, with a `https://dragoncandy.com`
  control alongside each `capacitor://localhost` probe, found 13 that answer
  `https://dragoncandy.io` for the native origin while correctly echoing `.com` for a
  `.com` origin — i.e. they are on the Phase-1 allow-list but their bundled
  `_shared/origins.ts` has no `NATIVE_APP_ORIGINS`. They are **almost exactly the money
  surface**: `release-creator-payout`, `release-package-payout`,
  `release-sponsorship-payout`, `withdraw-pending-balance`, `create-package-order-escrow`,
  `verify-campaign-escrow`, `verify-package-order-escrow`, `verify-sponsorship-payment`,
  `refund-package-order`, `check-creator-payout-status`, `disconnect-stripe-account`,
  `get-stripe-dashboard-link`, `invoice-rush-surcharges`. **The lesson is about the
  original verification, not the deploy:** "verified live by preflight probe" was true of
  the function that was probed and got generalised to the fleet. A sample proves a sample —
  and the `.com` control is what made this readable at all, since without it the `.io`
  answer looks like a dead endpoint rather than a fallback. ~~What genuinely remains: Apple's **approval** of `5HA89RBHQH` (submitted, not
  granted) and the physical-device build + on-device verification, which waits on the
  founder's Mac (expected 2026-08-12).~~ **Both gates cleared 2026-08-14** — enrollment is
  approved, and the Mac arrived and is provisioned (Xcode 26.6, CocoaPods 1.17.0, pods
  resolved). What genuinely remains is now only the **build itself**: the first
  physical-device build + on-device verification, which nothing external blocks. Left
  struck rather than deleted because a reader who acted on "not yet merged" needs to see
  it withdrawn.
- **Apple verifies an Organization enrollment partly by visiting the company website**, and
  until 2026-08-10 dragoncandy.com named no legal entity anywhere — a common cause of
  enrollment stalling, and a dependency this page did not know it had. Closed by
  [[Legal Entity Identity]] (PR #439). That page also owns a trap worth reading before
  touching any published entity detail: the IRS and D&B records **disagree** on the
  street line, and only the D&B form is the one Apple matches.

## See Also

- [[Capacitor Native Shell]]
- [[Legal Entity Identity]]
- [[Domain Migration (.io → .com)]]
- [[Edge-Function Deploy & Bundling]]
- [[Payments Split by Surface]]
