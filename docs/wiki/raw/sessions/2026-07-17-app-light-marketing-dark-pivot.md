# Session — App theme pivot: light app + dark marketing (2026-07-17)

**PRs:** #275 (light app / dark marketing) + #277 (washed-auth fix). Both merged + deployed.
Supersedes the app-dark half of #269 (the "force the whole app dark" experiment).

## Trigger
Same-day founder feedback (with a screenshot of the mobile business dashboard) on the just-shipped
force-dark app (#269): **(1)** the dark app is "too dark," **(2)** some content text is "too dark to
read" (dark-on-dark), **(3)** "some parts of the app pages that are white … look poorly designed" (the
phased-rollout two-toned state). The dark **landing + login/sign-up** were explicitly liked. Decision
(AskUserQuestion): **light working app, dark marketing/entry surfaces.**

## What shipped
- **App reverted to LIGHT** — the 35 app files converted dark in #269 (dashboards, chrome/nav, Donny
  panel + interior, DragonShare tiles, first-run) were restored to their pre-dark versions via
  `git checkout b0a7c65f -- <files>` (b0a7c65f = the parent of the #269 commit; verified no other PR had
  touched those 35 files, so the checkout is a clean per-file revert). Foundation files
  (`index.html`, `App.tsx`, `sonner`) likewise restored; `ThemeToggle` import removed from the restored
  `DashboardLayout` (the component stays deleted).
- **Dark kept for landing + auth + onboarding.** Landing already self-scopes `.dark`. Auth + onboarding
  keep their #269 dark literals.
- **`ThemeProvider` = `defaultTheme="light"`** (not `forcedTheme`). Codex caught that `forcedTheme="light"`
  would re-assert `<html class="light">` and break the dark `/internal` (which adds `<html class="dark">`
  via `InternalLayout`); `defaultTheme="light"` gives fresh users light while letting route effects add a
  sticking `<html class="dark">`.
- First-run page lightened (`bg-gray-400`→`bg-gray-100` + readable teal chrome); Sonner pinned `theme="light"`.

## The washed-auth regression + fix (#277, the keystone learning)
After #275 deployed, the **prod auth page rendered washed-out gray**, not dark — even though the auth
root computed `bg #1A1A2A` (dark) with no ancestor opacity/backdrop-filter. Root cause: the app is now
light, so `<body>` is white; the auth page's **two translucent radial-gradient glows + `GlowBackdrop`**
composite over the white body and wash the page to gray. It only looked dark in #269 because the whole
`<body>` was dark. **Fix:** a **`useDarkHtml()`** hook (`src/hooks/useDarkHtml.ts`) — a `useEffect` that
adds `dark` to `<html>` on mount and removes it on unmount — called by AuthPage + the 5 auth-adjacent
pages + OnboardingWizard. This makes `<body>` dark (via the `.dark` `--background` token) so the glows sit
on dark. Mirrors `InternalLayout`'s `/internal` mechanism. Verified dark on dev + prod after deploy.

## Diagnostic notes (durable)
- **A scoped-div `.dark` is not enough for a dark page in a light app** — `<body>` stays light and any
  translucent/glow layers composite over white. The surface needs a dark `<body>` (`useDarkHtml`), not
  just a dark root div. This is the same reason the landing hand-writes dark literals on its portaled
  Sheet, and why `/internal` sets `<html class="dark">`.
- Browser-MCP screenshots timed out repeatedly on prod; the **computed-style + `elementsFromPoint` +
  ancestor-chain JS probes** (`getComputedStyle`, `document.elementsFromPoint`) were the reliable
  diagnostic that isolated "root is dark, body is white → glow washes over white."
- The two-color-system model (semantic tokens flip; `dc-*`/literals don't) is what made the revert
  clean — restoring the literal files brought the light app back exactly.

## Files
Revert: 35 app files (restored from b0a7c65f) + `index.html`/`App.tsx`/`sonner`/`DashboardLayout`
+ `ThemeProvider` (`defaultTheme="light"`) + first-run light fix. New: `src/hooks/useDarkHtml.ts` +
its call in `AuthPage`, `ForgotPassword`, `UpdatePassword`, `VerifyEmail`, `RestoreAccountPage`,
`InviteAcceptPage`, `OnboardingWizard`. No schema/edge-fn/secret change. Concept:
`docs/wiki/concepts/dark-luxe-app-theme.md`. DESIGN_SYSTEM.md "Theme" section rewritten to
"Light app, Dark marketing/entry."
