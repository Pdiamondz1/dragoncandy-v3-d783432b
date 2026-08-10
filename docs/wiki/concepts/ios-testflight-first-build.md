---
title: iOS TestFlight First Build
type: concept
created: 2026-08-10
updated: 2026-08-10
sources: [raw/sessions/2026-08-09-ios-testflight-first-build.md]
tags: [ios, capacitor, testflight, cors, origin, bundle-id]
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
itself calls "cosmetic, not a security boundary"). It already holds the post-migration
value and never flips; migration Phase 2 moves `DEFAULT_ORIGIN` to meet it, not the other
way around.

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
  `DEFAULT_ORIGIN` `.io` → `.com` flip, which is a code change and would force a sweep,
  but is not currently listed in that migration's Phase 2.
- Push notifications and universal links (Slices A/D) remain out of scope — both need
  Apple enrollment, which is itself gated on this branch's bundle-ID merge.
- As of writing, Tasks 11–14 (founder Apple enrollment, the canaried edge-function
  redeploy, and the physical-device build + on-device verification) have not run; the
  branch is not yet merged.

## See Also

- [[Capacitor Native Shell]]
- [[Domain Migration (.io → .com)]]
- [[Edge-Function Deploy & Bundling]]
- [[Payments Split by Surface]]
