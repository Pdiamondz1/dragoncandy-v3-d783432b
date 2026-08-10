# iOS Purchase-CTA Audit — 2026-08-09

**Branch:** `worktree-dc-apple-store` · **HEAD at audit time:** `a30b534f1e8c0fe98491139593e08d8c0493a280`
**Scope:** Task 9 of `.superpowers/sdd/2026-08-09-ios-testflight-first-build/` — confirm the
digital-subscription purchase-CTA gate set closed in an earlier pass is still closed after 233
commits / 31 new pages. Bounded, predicate-driven audit, not a full page walk.

**Why this exists.** Apple takes 30% of digital-subscription purchases made inside an iOS app, so
DragonCandy sells subscriptions on the web only; the iOS build must show no in-app buy affordance
for them. Marketplace payments (campaign payments, boosts, escrow, sponsorships, creator payouts —
all Stripe Connect, real-world services) are explicitly **in scope to leave alone** — they are not
digital-goods purchases and Apple permits them. This audit only concerns subscription /
plan-upgrade / AI-credit purchase CTAs.

**The gating primitive:** `src/components/platform/WebOnly.tsx` — renders `children` on web,
`null` when `useNativePlatform().isNative` is true:

```tsx
export function WebOnly({ children }: { children: ReactNode }) {
  const { isNative } = useNativePlatform();
  return isNative ? null : <>{children}</>;
}
```

## Step 1 — Run the predicate set

Command run exactly as specified (executed via PowerShell, since the sandboxed Bash tool in this
environment has no `grep` on PATH — `C:\Program Files\Git\usr\bin\grep.exe` was used directly):

```
grep -rn "create-checkout-session\|create-billing-portal-session\|checkout_url\|billingRoute\|/pricing\|>Upgrade\|Upgrade<" src/ --include=*.tsx --include=*.ts
```

Full output (34 lines):

```
src/App.tsx:215:          <Route path="/pricing" element={<PricingPage />} />
src/components/campaigns/CampaignFinalizeStep.tsx:27:import { SoftPaywallSheet } from '@/components/pricing/SoftPaywallSheet';
src/components/dashboard/BrandFreeTrioHero.tsx:10:import { SoftPaywallSheet } from '@/components/pricing/SoftPaywallSheet';
src/components/dashboard/BrandFreeTrioHero.tsx:148:            onClick={() => navigate('/pricing')}
src/components/donny/DonnyChatView.tsx:14:import { billingRoute } from '@/lib/donnyRoutes';
src/components/donny/DonnyChatView.tsx:98:                  <Link to={billingRoute(userRole)}
src/components/dragonshare/boostOutcome.test.ts:6:  it('returns checkout when a checkout_url is present', () => {
src/components/dragonshare/boostOutcome.test.ts:7:    expect(resolveBoostOutcome({ checkout_url: 'https://stripe/cs_test_1' }))
src/components/dragonshare/boostOutcome.ts:10:  if (typeof d.checkout_url === 'string') return { kind: 'checkout', url: d.checkout_url };
src/components/outstand/DonnyAutoPilot.tsx:10:import { billingRoute } from '@/lib/donnyRoutes';
src/components/outstand/DonnyAutoPilot.tsx:58:            <p>Auto-Pilot requires Growth plan or higher. <WebOnly><a href={billingRoute(profile?.role)} className="underline text-dc-teal">Upgrade</a></WebOnly></p>
src/components/outstand/DonnyPerformanceInsights.tsx:7:import { billingRoute } from '@/lib/donnyRoutes';
src/components/outstand/DonnyPerformanceInsights.tsx:72:        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <WebOnly><a href={billingRoute(profile?.role)} className="underline text-dc-teal">Upgrade</a></WebOnly></p>
src/components/outstand/DonnyWeeklyPlanner.tsx:7:import { billingRoute } from '@/lib/donnyRoutes';
src/components/outstand/DonnyWeeklyPlanner.tsx:44:        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <WebOnly><a href={billingRoute(profile?.role)} className="underline text-dc-teal">Upgrade</a></WebOnly></p>
src/components/outstand/DragonDashRushButton.tsx:34:          <span className="text-xs font-semibold text-gray-400">Upgrade to unlock Rush Posting</span>
src/components/pricing/SoftPaywallSheet.tsx:5:import { getFeature, TIER_PRICES, type TierName } from '@/lib/pricing/tier-features';
src/components/pricing/SoftPaywallSheet.tsx:40:    navigate(`/pricing?highlight=${requiredTier}`);
src/components/pricing/TierComparisonGrid.tsx:11:} from '@/lib/pricing/tier-features';
src/hooks/useTierGate.ts:5:import { getFeature, tierMeetsRequirement, type TierName } from '@/lib/pricing/tier-features';
src/lib/donnyRoutes.ts:18:  "/pricing",
src/lib/donnyRoutes.ts:115:export function billingRoute(role: string | undefined): string {
src/lib/internalHost.test.ts:52:    expect(isAllowedOnInternalHost('/pricing')).toBe(false);
src/lib/siteGate.ts:9:  '/pricing',
src/pages/OrgBillingPage.tsx:17:import { TIER_PRICES } from '@/lib/pricing/tier-features';
src/pages/OrgBillingPage.tsx:59:      const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
src/pages/OrgBillingPage.tsx:126:                  <p className="text-sm font-medium text-teal-800">Upgrade to add teammates</p>
src/pages/OrgBillingPage.tsx:137:                          const { data, error } = await supabase.functions.invoke('create-checkout-session', {
src/pages/OrgBillingPage.tsx:141:                          if (data?.checkout_url) window.location.href = data.checkout_url;
src/pages/PricingPage.tsx:3:import { TierComparisonGrid } from '@/components/pricing/TierComparisonGrid';
src/pages/PricingPage.tsx:5:import { TIER_ORDER, TIER_PRICES, type TierName } from '@/lib/pricing/tier-features';
src/pages/PricingPage.tsx:32:      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
src/pages/PricingPage.tsx:36:      if (data?.checkout_url) {
src/pages/PricingPage.tsx:37:        window.location.href = data.checkout_url;
src/pages/PricingPage.tsx:53:        path="/pricing"
```

34 lines total.

## Step 2 — Classification of every hit

| # | File:Line | What it is | Classification | Reasoning |
|---|---|---|---|---|
| 1 | `App.tsx:215` | `<Route path="/pricing">` | Not a CTA | Route registration only. |
| 2 | `CampaignFinalizeStep.tsx:27` | `import { SoftPaywallSheet }` | Not a CTA | Import statement. The file's own paywall UI is a plain-text banner ("Upgrade your plan to publish more campaigns simultaneously.", line 674, no `onClick`) plus a `<SoftPaywallSheet>` render (line 678) whose internal Upgrade button is independently gated — see #17. |
| 3 | `BrandFreeTrioHero.tsx:10` | `import { SoftPaywallSheet }` | Not a CTA | Import statement. |
| 4 | `BrandFreeTrioHero.tsx:148` | `onClick={() => navigate('/pricing')}` ("See plans →") | **New hit, not in known table — read as SAFE, no gate needed** | Plain in-app navigation to `/pricing`, no steering text, no external link, no checkout call. Its own destination's buy button is already `<WebOnly>`-gated (verified in #31/#32 below), so following this link on native lands on a page with tier cards and **no** purchase button. Reachable only from `/dashboard/brand`, itself behind `BRAND_ROLE_ENABLED` (default off). |
| 5 | `DonnyChatView.tsx:14` | `import { billingRoute }` | Not a CTA | Import statement. |
| 6 | `DonnyChatView.tsx:98` | `<Link to={billingRoute(userRole)}>` | **Known set — gated** | Wrapped in `<WebOnly>` (lines 97–102). |
| 7 | `boostOutcome.test.ts:6-7` | `checkout_url` in a unit test | Out of scope | DragonShare **boost** checkout — a marketplace/Stripe-Connect payment between people, explicitly out of audit scope per the task brief. |
| 8 | `boostOutcome.ts:10` | `checkout_url` resolution | Out of scope | Same DragonShare boost flow as #7. |
| 9 | `DonnyAutoPilot.tsx:10` | `import { billingRoute }` | Not a CTA | Import statement. |
| 10 | `DonnyAutoPilot.tsx:58` | Upgrade link in locked-tooltip | **Known set — gated** | Wrapped in `<WebOnly>` inline. |
| 11 | `DonnyPerformanceInsights.tsx:7` | `import { billingRoute }` | Not a CTA | Import statement. |
| 12 | `DonnyPerformanceInsights.tsx:72` | Upgrade link in locked card | **Known set — gated** | Wrapped in `<WebOnly>` inline. |
| 13 | `DonnyWeeklyPlanner.tsx:7` | `import { billingRoute }` | Not a CTA | Import statement. |
| 14 | `DonnyWeeklyPlanner.tsx:44` | Upgrade link in locked card | **Known set — gated** | Wrapped in `<WebOnly>` inline. |
| 15 | `DragonDashRushButton.tsx:34` | `<span>Upgrade to unlock Rush Posting</span>` | **New hit, not in known table — read as SAFE, no gate needed** | Static `<span>` inside a non-interactive `<div>` (the `tierLocked` branch, lines 30–37) — **no `onClick`, no handler at all**. Read-only status text, same pattern the design system calls out as fine. Additionally, both current call sites (`SponsorshipAmplificationPrompt.tsx:166`, `SocialPostPrompt.tsx:708`) never pass `tierLocked`, so this branch is dead code today — it cannot render. Note this button's *unlocked* state triggers `RushConfirmDialog`, which is the DragonDash rush **surcharge** — a marketplace/Stripe payment, explicitly out of scope. |
| 16 | `SoftPaywallSheet.tsx:5` | `import { ... TIER_PRICES ... }` | Not a CTA | Import statement; `TIER_PRICES` used only for read-only price display (`Starting at $X/mo`). |
| 17 | `SoftPaywallSheet.tsx:40` | `navigate(...)` inside `handleUpgrade` | **Known set — gated** | `handleUpgrade`'s only caller is the `<Button>` at lines 64–66, wrapped in `<WebOnly>` (lines 63–67). |
| 18 | `TierComparisonGrid.tsx:11` | `import ... from '@/lib/pricing/tier-features'` | Not a CTA | Import statement (part of the "known set — gated" file; the actual CTA is item #33). |
| 19 | `useTierGate.ts:5` | `import { getFeature, tierMeetsRequirement ... }` | Not a CTA | Hook definition file — computes `allowed`/`requiredTier`; never renders UI or triggers checkout itself. |
| 20 | `donnyRoutes.ts:18` | `"/pricing"` in a route array | Not a CTA | Routing data/config. |
| 21 | `donnyRoutes.ts:115` | `export function billingRoute(...)` | Not a CTA | Helper function definition, not a rendered affordance. |
| 22 | `internalHost.test.ts:52` | `isAllowedOnInternalHost('/pricing')` | Not a CTA | Unit test assertion. |
| 23 | `siteGate.ts:9` | `'/pricing'` in a route array | Not a CTA | Site-gate config data. |
| 24 | `OrgBillingPage.tsx:17` | `import { TIER_PRICES }` | Not a CTA | Import statement. |
| 25 | `OrgBillingPage.tsx:59` | `create-billing-portal-session` invoke | **Known set — gated** | Called only from `handleManageBilling`, whose only caller — the "Manage billing" `<Button>` — is wrapped in `<WebOnly>` (lines 82–88). |
| 26 | `OrgBillingPage.tsx:126` | `<p>Upgrade to add teammates</p>` | Not a CTA | Heading text with no handler, immediately followed (lines 130–154) by the actual `<WebOnly>`-gated "Upgrade plan" button — read-only context around a gated CTA, exactly the pattern the task brief asks to preserve. |
| 27 | `OrgBillingPage.tsx:137` | `create-checkout-session` invoke | **Known set — gated** | Same button as #26/#28, wrapped in `<WebOnly>` (lines 130–154). |
| 28 | `OrgBillingPage.tsx:141` | `checkout_url` redirect | **Known set — gated** | Same button. |
| 29 | `PricingPage.tsx:3` | `import { TierComparisonGrid }` | Not a CTA | Import statement. |
| 30 | `PricingPage.tsx:5` | `import { TIER_ORDER, TIER_PRICES }` | Not a CTA | Import statement. |
| 31 | `PricingPage.tsx:32` | `create-checkout-session` invoke inside `handleSelectTier` | **Known set — gated, reachability independently verified** | See Step 2b below. |
| 32 | `PricingPage.tsx:36-37` | `checkout_url` redirect | **Known set — gated, reachability independently verified** | Same function as #31. |
| 33 | `PricingPage.tsx:53` | `path="/pricing"` (SEO prop) | Not a CTA | Canonical-URL metadata, not a rendered affordance. |

**Result: every hit is either not a CTA, in the known-gated set, out of scope (marketplace), or a
new hit that a manual read confirms is safe with no functioning purchase mechanism.** Nothing
required gating.

## Step 2b — `PricingPage.tsx` `handleSelectTier` reachability (verified independently)

The brief's claim: `handleSelectTier` is unreachable because `TierComparisonGrid.tsx:121` wraps its
only caller in `<WebOnly>`.

Verification performed (not just accepted):

1. `grep -rn TierComparisonGrid src` → **exactly two matches in the whole tree**: the import and
   `<TierComparisonGrid ... onSelectTier={handleSelectTier} />` render, both in `src/pages/PricingPage.tsx`
   (lines 3 and 84–87). No other file imports or renders `TierComparisonGrid`, so there is no second
   consumer that might call `onSelectTier` outside a `<WebOnly>` guard.
2. Inside `TierComparisonGrid.tsx`, `onSelectTier` is referenced **exactly once** in the whole file:
   line 123, `onClick={() => onSelectTier?.(tier)}`, on the `<Button>` at lines 122–131. That
   `<Button>` is the sole child of `<WebOnly>` (opens line 121, closes line 132).
3. No other event handler, `useEffect`, or ref in either file calls `handleSelectTier` /
   `onSelectTier`.

**Verdict: confirmed.** On native (`isNative === true`), `<WebOnly>` returns `null`, so the
`<Button>` never mounts, its `onClick` is never wired, and `handleSelectTier` — which is the only
function in the codebase that calls `create-checkout-session` from `PricingPage.tsx` and redirects
to `data.checkout_url` — has zero reachable call path. This is not a coincidental read; it was
checked at the call-graph level, not assumed from the brief.

## Step 3 — Gate-count check

Command run:

```
grep -rln "WebOnly" src/ | sort
```

Output (10 files, not the expected 9):

```
src/components/donny/DonnyChatView.tsx
src/components/outstand/ConnectAccountButtonGroupGated.tsx
src/components/outstand/DonnyAutoPilot.tsx
src/components/outstand/DonnyPerformanceInsights.tsx
src/components/outstand/DonnyWeeklyPlanner.tsx
src/components/platform/WebOnly.test.tsx
src/components/platform/WebOnly.tsx
src/components/pricing/SoftPaywallSheet.tsx
src/components/pricing/TierComparisonGrid.tsx
src/pages/OrgBillingPage.tsx
```

**Discrepancy explained, not a new purchase-CTA finding.** `ConnectAccountButtonGroupGated.tsx`
(`git log`: commit `edbfe264`, "feat(ios): say social-account linking is web-only in the app") was
added earlier in *this same worktree/branch* by Task 5 of this plan (Outstand OAuth web-only on
iOS) — it predates this audit but postdates the 2026-08-09 brief's baseline count. It matches the
`WebOnly` grep only because its own doc comment explains **why it deliberately does not use**
`<WebOnly>` ("Deliberately NOT `<WebOnly>`, which renders null — an unexplained missing button is
worse than a sentence explaining where to go"): it renders informational text on native instead.
It imports `useNativePlatform` directly, not the `WebOnly` component, and it concerns social-account
OAuth linking, not any subscription/billing purchase. **The purchase-CTA gate count — files that
actually render `<WebOnly>` around a buy affordance — is unchanged: `OrgBillingPage.tsx`,
`TierComparisonGrid.tsx`, `SoftPaywallSheet.tsx`, `DonnyChatView.tsx`, `DonnyAutoPilot.tsx`,
`DonnyPerformanceInsights.tsx`, `DonnyWeeklyPlanner.tsx` (7 gated call sites) plus the primitive's
own `WebOnly.tsx` / `WebOnly.test.tsx` = 9, matching the brief exactly.**

## Additional manual-reading checks (beyond the fixed predicate)

Per the task's instruction to look for differently-worded CTAs the predicate would miss, these
extra searches were run:

- `grep -rn "[Uu]pgrade" src --include=*.tsx` → same 10 files as the predicate set, plus
  `src/components/org/InviteModal.tsx`. Read: line 53 sets
  `error: 'Upgrade to Starter to add teammates.'` into a `results` array item, rendered at line 90
  as plain `<span>` text next to a failed-invite row. No `onClick`, no navigation — a read-only
  failure reason, not a CTA. **Safe, no gate needed.**
- `grep -rn "[Ss]ubscribe\b|[Bb]uy [Nn]ow|[Gg]o [Pp]remium|[Gg]o [Pp]ro\b|Unlock (Pro|Growth|Starter|Premium)" src`
  → no purchase-CTA matches. One hit, `src/pitch/slides/slides.tsx:373` ("Restaurants subscribe;
  brands sponsor…"), is descriptive copy inside the standalone, unlisted `/pitch` investor deck
  (`App.tsx:457`, no nav chrome, no AppShell) — plain text about the business model, not a button,
  and not part of any normal user flow. **Safe, no gate needed.**
- Confirmed `DragonDashRushButton`'s two call sites (`SponsorshipAmplificationPrompt.tsx`,
  `SocialPostPrompt.tsx`) never pass `tierLocked`, so its locked-state branch is currently
  unreachable in the app regardless of platform.

No upgrade affordance was found that the predicate missed and that also constitutes a real,
clickable purchase mechanism.

## Verdict

**The known-closed set from 2026-08-09 is still closed.** No ungated purchase CTA was found. Two
predicate hits fall outside the brief's table (`BrandFreeTrioHero.tsx:148`,
`DragonDashRushButton.tsx:34`) and one file appeared in the Step 3 gate-count that wasn't expected
(`ConnectAccountButtonGroupGated.tsx`); all three were read in context and are safe — the first two
because they contain no functioning purchase mechanism (a safe navigation to an already-gated page,
and inert/unreachable status text respectively), the third because it's an unrelated OAuth gate
added earlier in this same branch. `PricingPage.tsx`'s `handleSelectTier` unreachability was
independently verified at the call-graph level, not just accepted from the brief.

**Step 5 (gate anything ungated) is skipped — nothing was ungated.** No `.tsx`/`.ts` files were
changed by this task, so `npm run build` was not run (per the task's own instruction: build only if
a `.tsx` file changed).

## Named short list for the on-device (Wednesday) pass

Per the task brief, not "31 pages" — named screens, because most need data states one test account
cannot produce in a sitting:

1. **`/pricing`** — confirm the tier-comparison grid renders with **no** "Choose Plan"/"Get Started"
   buttons on-device (covers this CTA regardless of entry point — direct nav, `BrandFreeTrioHero`'s
   "See plans", or `SoftPaywallSheet`'s "Upgrade").
2. **`/settings/billing`** (`OrgBillingPage`) — confirm "Manage billing" and "Upgrade plan" do not
   render; confirm the informational "Current Plan" / "Available Plans" cards still do (read-only
   context must survive).
3. **The Donny chat panel** — trigger an error state containing "Upgrade" (e.g. exceed a tier's
   rate limit) and confirm `DonnyChatView`'s "Upgrade Plan" link is absent, and "Try Again" still
   works for non-upgrade errors.
4. **The three Donny lock cards** (`DonnyAutoPilot`, `DonnyPerformanceInsights`,
   `DonnyWeeklyPlanner`) — on a free/starter-tier org, confirm the locked-state card shows its
   status text ("Requires Starter plan or higher." / tooltip) with no "Upgrade" link.
5. **`/dashboard/business`** and **`/dashboard/creator`** — general smoke pass; no known CTA here
   but both are high-traffic entry points worth a console-error check.
6. **`/rewards`** — no purchase CTA found in the predicate or manual read; included for a general
   data-state/console-error pass.
7. **DragonFeed** — same as above; also the reachable surface closest to `SocialPostPrompt` /
   `DragonDashRushButton`, worth confirming the (currently-dead) `tierLocked` branch still shows no
   clickable "Upgrade" if it's ever wired up later.

This list is unchanged from the brief's suggested list — the audit's two new-but-safe hits
(`BrandFreeTrioHero`'s "See plans", `DragonDashRushButton`'s locked text) don't need their own
device-pass entries: the former's safety is fully covered by testing `/pricing` directly (item 1),
and the latter is unreachable code today (no call site passes `tierLocked`), so there is nothing to
observe on-device.

## Commands log (for reproducibility)

```bash
# Step 1
grep -rn "create-checkout-session\|create-billing-portal-session\|checkout_url\|billingRoute\|/pricing\|>Upgrade\|Upgrade<" src/ --include=*.tsx --include=*.ts

# Step 3
grep -rln "WebOnly" src/ | sort

# Supporting checks
grep -rn "TierComparisonGrid" src
grep -rn "onSelectTier" src/components/pricing/TierComparisonGrid.tsx
grep -rn "[Uu]pgrade" src --include=*.tsx
grep -rn "[Ss]ubscribe\b|[Bb]uy [Nn]ow|[Gg]o [Pp]remium|[Gg]o [Pp]ro\b|Unlock (Pro|Growth|Starter|Premium)" src
grep -rn "tierLocked|DragonDashRushButton" src/components/outstand/SponsorshipAmplificationPrompt.tsx src/components/outstand/SocialPostPrompt.tsx
git log --oneline -- src/components/outstand/ConnectAccountButtonGroupGated.tsx
```
