# Session — Google Workspace Wave 1 (code half): email signatures that install themselves

Date: 2026-08-20
Branch: `worktree-dc-google-workspace` (11 commits)
Spec: `docs/superpowers/specs/2026-08-20-google-workspace-corporate-setup-design.md`
Plan: `docs/superpowers/plans/2026-08-20-google-workspace-wave-1.md`

## What this session was

The founder set up DragonCandy's Google Workspace and asked for it to be organised "like
an official cool corporate workspace" — Drive structure, documents, email signatures,
branding. Brainstormed to a spec, planned Wave 1, executed the four tasks an agent can do.

**Status is split and the split matters.** The *code* half shipped (this branch). The
*admin console* half — two shared drives, nine Google Groups, `adrian@`, the service
account — cannot be done by any agent, connector or API available to a session. It is
pending the founder. Nothing in this branch is live until both halves land.

## What shipped

- `public/brand/dc-mark-104.png` (104×122) + `dc-mark-512.png` (440×512), both with the
  alpha channel preserved, plus `public/brand/README.md`.
- `scripts/workspace/signature.js` — a pure renderer, `renderSignature({name, title, email,
  includeAddress, showCompany})` → HTML. 19 unit tests.
- `scripts/workspace/Code.gs.js` + `build-gs.mjs` + `README.md` — a Google Apps Script that
  reads the Workspace directory and writes each user's Gmail signature via the Gmail API,
  using a service account with domain-wide delegation, on a daily trigger.
- Three founders' titles corrected across nine files.

## Founder decisions (interview, 2026-08-20)

| # | Decision |
|---|---|
| 1 | Drive connector reconnects to `dame@dragoncandy.com` (it was authenticated as `dwilliams@harbormill.net`) |
| 2 | **Two** shared drives, not one — forced by a permissions constraint, see below |
| 3 | Drive is for humans; the repo stays canonical. Drive documents link rather than restate |
| 4 | All four priority jobs in scope, staged into three waves |
| 5 | The **marketing** identity (`landing-*` palette, Bricolage/Instrument/Silkscreen) is the company identity, not the `dc-*` app system |
| 6 | Signature = Option B, "Badge": mark, hairline, text block |
| 7 | Registered address on shared mailboxes only; **no phone anywhere** |
| 8 | Signatures installed automatically by Apps Script + domain-wide delegation |
| 9 | The eight shared aliases become real Google Groups; `legal@` added, making nine |

Roster: Damon Williams / `dame@` / **CTO**; Joe Castelo / `joe@` / **CEO**; Juwan Robinson /
`jay@` / **Co-founder**; Adrian Vella / `adrian@` / **Board Member** (account not yet created).

## The constraints that actually shaped the design

Each of these changed a decision rather than decorating one.

1. **Webfonts do not exist in email.** Gmail, Outlook and Apple Mail strip `@font-face`.
   Bricolage Grotesque, Instrument Sans and Silkscreen — the entire brand type system —
   **cannot appear as text in a signature under any circumstances**, only inside an image.
   Every signature is therefore set in `Arial, Helvetica, sans-serif`. The mockups shown to
   the founder were deliberately rendered in Arial for this reason; showing them in the
   brand fonts would have been a lie.
2. **Outlook for Windows renders mail with the Word engine and cannot display WebP.**
   `public/logo.webp` was unusable in a signature. Hence the PNG exports.
3. **Transparency is load-bearing.** Apple Mail and Outlook auto-invert light signatures in
   dark mode; an opaque white-background mark becomes a glowing slab. `logo.webp` is 280×326
   *with* an alpha channel (verified), and the conversion preserves it.
4. **Images are blocked by default in many corporate inboxes**, which produced the governing
   rule: *the image is never load-bearing*. No name, title, address or contact detail lives
   only inside a picture. Strip every image and the signature is still complete. This is why
   Option B was chosen over the heavier Option C — B degrades to a complete text signature.
5. **In a Google shared drive, folder permissions can only ADD access, never remove it.** A
   drive member sees every folder in that drive. This single fact forced two drives instead
   of the one the founder initially chose — otherwise the incoming developers could read the
   cap table, comp bands and offer letters.
6. **Google Workspace has no built-in signature management.** There is no admin setting that
   applies a signature to everyone; the Gmail API is the only first-party mechanism. (Admin →
   Gmail → Compliance → *Append footer* exists but appends below the entire quoted thread, so
   on any reply it lands detached at the bottom. It is not a signature.)

## The sharpest thing found: a Google Group is not a send-as identity

Found by the **Codex second review**, and it overruled a call made earlier in the session.

`support@`, `sales@` etc. appear in Gmail's send-as list today **only because they are
aliases on `dame@`** — and the send-as list is exactly where the installer looks for shared
identities. Decision 9 converts those aliases to Groups, which **removes them from every
user's send-as list**. The installer would then run, report success, and install **zero**
address-bearing signatures — so the registered postal address that decision 7 puts on shared
mailboxes would silently appear nowhere.

An internal review round raised the same hazard and accepted a **documentation-only** fix.
Codex refused that, correctly: a doc does not make a silent failure visible. Resolution was
in three parts — the code now warns when a run installs zero shared signatures; the plan
gained an explicit founder step where each member re-adds their shared addresses; and the
spec records why decisions 9 and §7.3 interact.

**No API, admin or script can do that re-adding.** Gmail requires the account holder to
complete send-as verification. This is a genuine limit, not an automation gap.

## Other defects the review chain caught

- **The documented `clasp push` could not have worked.** The branch shipped no `.clasp.json`
  and no `appsscript.json`, so clasp would have uploaded `signature.js` *with its `export`
  keywords*, plus the vitest test file — each a V8 syntax error failing the whole Apps Script
  project at load. The build step existed precisely to prevent this and was being bypassed.
- **`https://dragoncandy.com/brand/dc-mark-104.png` returns HTTP 200 today, not 404** — the
  Vercel SPA catch-all serves `index.html`. So installing signatures before this branch
  deploys yields a broken image behind a *success* status, which image proxies cache. The
  verification must check `content-type: image/png`; a bare 200 proves nothing.
- **A 2am failure left no trace.** Per-user errors were caught into an array, the log Sheet
  may be unset, and a trigger discards the return value — and catching also suppresses Apps
  Script's automatic failure email. A revoked service-account key would have produced total
  silence. Now `console.error` per failure, so it reaches Executions and Cloud Logging.
- **`organizations[0].title` is not guaranteed to be the primary organization.** A
  multi-entry directory record could yield a stale title or a spurious refusal. Now selects
  the entry with `primary: true`.
- **Shared mailbox signatures read "DragonCandy" three times** ("DragonCandy / Support ·
  DragonCandy / support@…", plus the image alt). The renderer hardcoded `title · company`, so
  no call-site fix was possible; closed with an additive `showCompany` flag defaulting to the
  existing behaviour.
- **No test asserted `BRAND` was actually frozen**, so dropping `Object.freeze` would have
  passed all 15 tests silently. Closed, and the fix was verified *empirically* — removing the
  freeze was confirmed to make the new test fail.

## Titles: three founders were wrong in nine files

Confirmed by the founder: Dame is **CTO** (recorded as CPO), Juwan is **Co-founder**
(recorded as Shareholder & Advisor), Joe is **CEO** (recorded in the pitch deck as CRO).

The plan named three files. A pre-flight scan found six more — including **all four
`docs/hiring/` documents**, the pack merged the previous day in #452 that Adrian forwards to
candidates, telling applicants they report to a CPO who is the CTO. And
`src/pitch/slides/slides.tsx` is the **live investor deck**, where all three people were
wrong.

Bounded away from the historical record on the repo's own established rule from the domain
migration: *undated present-tense claims move, dated and historical text stays.* So
`docs/superpowers/**`, `docs/wiki/raw/**` and `docs/archive/**` keep the old titles.

**`docs/DragonCandy_Org_Staffing_Plan.html` was deliberately left alone** and still says
"Shareholder & Advisor". Its labels encode a working arrangement across a three-phase org
chart ("contributes on a flexible basis… not responsible for a specific department"), not a
title. Correcting it is a content decision for the founder, and a pattern-match sweep would
have destroyed the document's meaning.

## Assumption worth flagging

Two **dated bylines** ("Written 2026-08-19 by Damon 'Dame' Williams, co-founder & CPO") were
corrected on the assumption the repo recorded the title wrongly all along, rather than the
title having changed this week. If it genuinely changed on 2026-08-20, those two bylines now
overstate when Dame became CTO. Two-line revert.

## Not done, and gating

- **Task 1 gates everything**: shared drives require Business Standard or above. On Business
  Starter they do not exist and the whole §4 structure collapses to a My Drive folder.
  Unverified.
- The admin spine: two drives + eleven folders, nine Groups (with the create → verify →
  retire-alias ordering, because `admin@` receives live Stripe dispute alerts), `adrian@`,
  the service account with domain-wide delegation, the daily trigger.
- Wave 2 (the People document set, timed against the first hire) and Wave 3 (strategy, sales,
  and a *sendable* pitch deck — the current one is a React component and cannot be emailed).

## Files

Created: `public/brand/{dc-mark-104.png, dc-mark-512.png, README.md}`,
`scripts/workspace/{signature.js, signature.test.js, Code.gs.js, build-gs.mjs, README.md}`.
Modified: `package.json` (+`build:workspace`), `.gitignore` (+`scripts/workspace/dist/`),
`src/pitch/slides/slides.tsx`, `docs/PROJECT_CONTEXT.md`, `docs/dragoncandy-origin-story.md`,
`docs/DragonCandy_Tech_Department_Scope.md`, `docs/hiring/*.md` (4),
`docs/wiki/sources/project-context.md`, `docs/wiki/analyses/*` (2).

No migrations. No edge functions. No RLS changes.

## Also noticed

`PROJECT_CONTEXT.md` §5 has said the `google-chat-donny` bot is "blocked on creating the
DragonCandy Workspace org". The org exists and has since at least 2026-08-10 (recorded in
`src/lib/contactAddresses.ts`, which documents reading its admin console that day). That
pending clause has outlived its truth by the usual mechanism.
