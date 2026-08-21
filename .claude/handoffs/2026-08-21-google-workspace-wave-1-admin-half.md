# Google Workspace Wave 1 — the admin half (everything left is in a browser, not the repo)

**Status:** the code half is **done and in PR #453 (open, not merged)**. The admin-console half
is **not started**. Session ended 2026-08-21 for a MacBook reboot — Chrome would not open, and
the Claude browser extension was never connected.

**Read this with:**
- Plan: `docs/superpowers/plans/2026-08-20-google-workspace-wave-1.md` — the authority. Every
  step below is a summary of a task in there.
- Spec: `docs/superpowers/specs/2026-08-20-google-workspace-corporate-setup-design.md`
- Wiki: `docs/wiki/concepts/workspace-email-signatures.md`
- PR: https://github.com/Pdiamondz1/dragoncandy-v3-d783432b/pull/453

**Worktree:** `.claude/worktrees/dc-google-workspace`, branch `worktree-dc-google-workspace`,
pushed. Tree clean. 13 commits.

---

## What is DONE

- **Task 1 — the gate.** Workspace plan is **Business Standard**, founder-confirmed 2026-08-20.
  Shared drives are included, so the two-drive design holds. **Still worth 30 seconds:** confirm
  "Shared drives" actually appears in the Drive sidebar. Business Standard means the plan
  *includes* the feature, not that it is switched on — Admin → Apps → Google Workspace → Drive
  and Docs → Sharing settings has a per-OU *"Allow users to create shared drives"* toggle.
- **Task 2** — `public/brand/dc-mark-104.png` (104×122) + `dc-mark-512.png` (440×512), alpha
  preserved, plus a README.
- **Task 3** — `scripts/workspace/signature.js`, the pure renderer. 19 tests.
- **Task 4** — `scripts/workspace/Code.gs.js` + `build-gs.mjs` + `README.md`, the Apps Script
  installer and its build step.
- **Task 5** — three founders' titles fixed across nine files.
- Knowledge layer synced (wiki page, source, index, log, SHIPPED_LOG, PROJECT_CONTEXT §5).
- **Codex clean at rounds 3 and 4.** `npm run typecheck`, `npm run build`, 19 tests all pass.

## What is NOT done — all of it is browser work

Tasks 6, 7, 8, 9, 10 and 11. **No agent, connector or API available in a session can do the
first four.** They need super-admin, or the account holder in person.

---

## Do them in this order

### 1. Task 6 — two shared drives + eleven folders

`drive.google.com` as `dame@dragoncandy.com` → Shared drives → + New.

```
DragonCandy                       DragonCandy — Confidential
├─ 00 · Company                   ├─ 10 · Legal
├─ 01 · Product                   ├─ 11 · Finance
├─ 02 · Engineering               ├─ 12 · People (private)
├─ 03 · Strategy & GTM            └─ 13 · Board
├─ 04 · Sales
├─ 05 · People
└─ 06 · Brand
```

Em dash (—) in the second drive name; middle dot (·) in every folder. **Copy-paste, do not
retype.** The numeric prefixes are functional — Google sorts alphabetically and they are the
only way to control order.

**Add nobody to either drive yet.** Access goes on by Group in Task 9, and the Groups do not
exist until Task 8.

Also in this task: create a Sheet named **`Signature install log`** in `06 · Brand`, headers
`Timestamp | User | Title | Status | Detail`, and keep its file ID — it is the `LOG_SHEET_ID`
script property in Task 10. And reconnect the Claude **Drive connector to
`dame@dragoncandy.com`** — it is currently authenticated as `dwilliams@harbormill.net`
(verified 2026-08-20, recent files came back owned by harbormill). Nothing in Wave 1 needs it;
Wave 2 creates ~20 documents and must not put them in a personal Drive.

### 2. Task 7 — `adrian@dragoncandy.com`

Create the account. **Set the Job title to `Board Member` — this is required, not cosmetic.**
The installer refuses a user with no directory title rather than writing a signature with a
blank line, so skipping it makes Task 10 fail for him.

Share **`13 · Board` only** with him, as Content manager. Do **not** make him a member of
either shared drive — folder-level sharing grants that subtree alone; drive membership would
expose Legal, Finance and the private People folder. Verify from his side: `13 · Board`
reachable, neither drive visible in his sidebar.

### 3. Task 8 — nine Groups (the risky one; order is not optional)

`founders@ staff@ support@ sales@ info@ admin@ privacy@ legal@ appstore@`
(`legal@` is new. The other eight are currently **aliases on `dame@`**.)

**One address at a time: remove the alias → create the Group → add members → send an EXTERNAL
test → only then move to the next.** A Group cannot be created while an alias of the same
address exists, so it is tempting to strip all eight first — that leaves the entire shared
surface dark at once.

**`admin@` receives live Stripe dispute alerts** from `supabase/functions/stripe-webhook`.
Verify it explicitly after conversion; nobody will notice that sender failing.

Test from an address **outside** the domain. Internal sends can take a different path and do
not prove external delivery.

### 4. Task 8 Step 6 — the step that is easiest to skip and silently costs the most

**A Google Group is NOT a send-as identity.** `support@`, `sales@` etc. appear in Gmail's
send-as list only because they are aliases today — and that list is exactly where the installer
looks. The moment they become Groups they vanish from it, and Task 10 will run, **report
success, and install zero shared-mailbox signatures.** The registered address appears nowhere
and nothing errors.

So after the conversion, **each person adds and verifies each shared address on their own
account**: Gmail → Settings → Accounts and Import → *Send mail as* → Add another email address.

| Person | Should send as |
|---|---|
| Dame | `support@`, `admin@`, `appstore@`, `privacy@`, `legal@`, `info@` |
| Joe | `sales@`, `info@`, `privacy@`, `legal@` |

**No API, admin or script can do this for them.** Gmail requires the account holder to complete
verification. The code now warns on a zero-shared run, but a warning reports the problem — it
does not prevent it.

### 5. Task 9 — grant drive access by Group

`DragonCandy`: `staff@` **Contributor**, `founders@` Manager.
`DragonCandy — Confidential`: `founders@` Manager, and nothing else.
Add **no individuals**. Contributor (not Content manager) for staff is deliberate — they cannot
permanently delete or move files out of the drive.

### 6. Task 10 — deploy the signature automation

Follow `scripts/workspace/README.md`. Order matters:

1. **PR #453 must be merged and deployed first.** Then check the mark is really served:
   `curl -sI https://dragoncandy.com/brand/dc-mark-104.png | grep -i content-type`
   → must print `content-type: image/png`. **A 200 alone proves nothing** — the Vercel SPA
   catch-all returns 200 with `text/html` for a missing path, so a pre-deploy install caches a
   broken image behind a success status.
2. GCP project → service account → **domain-wide delegation**, scope
   `gmail.settings.basic` **only**. (The directory read runs as the script owner through the
   `AdminDirectory` advanced service — a separate auth path needing no delegated scope.)
3. Apps Script project, add the `AdminDirectory` advanced service, set the three script
   properties. `npm run build:workspace` then `clasp push` with `"rootDir": "dist"`.
4. Run `dryRun()` — every user must show a title. Note it does **not** authenticate, so it
   passes cleanly with a bad or missing key.
5. Run `installAllSignatures()` once by hand, then verify in a real inbox: Gmail web, Gmail
   mobile, **Outlook for Windows**, dark mode, and with images disabled. The last two are the
   whole reason the Badge design was chosen.
6. Only then add the daily trigger.

### 7. Task 11 — repo, and it is an agent task

Update the `DOMAIN MIGRATION STATUS` docblock in `src/lib/contactAddresses.ts` once the Groups
are live. It currently documents the alias arrangement as present-tense fact. Exact replacement
text is in the plan.

---

## Gotchas that will bite a fresh session

- **`npm run test` is red on this machine and it is not your fault.** Node 26 shadows jsdom's
  `localStorage`, breaking ~50 tests that pass in CI. Run only
  `npx vitest run scripts/workspace/signature.test.js` (19 tests).
- **Do not touch `docs/DragonCandy_Org_Staffing_Plan.html`.** It still says "Shareholder &
  Advisor" deliberately — its labels encode a working arrangement across a three-phase org
  chart, not a title. Correcting it is a founder content decision.
- **Do not "fix" the trailing whitespace on `package.json:25`.** The file is CRLF on all 138
  lines from this repo's Windows origin; `git diff --check` flags the CR on any added line.
- **The Claude Chrome extension was never connected** — `tabs_context_mcp` returned "Browser
  extension is not connected". If browser automation is wanted: install from
  https://claude.ai/chrome, sign in with the same account as Claude Code, restart Chrome.

## Open question for the founder

Two **dated bylines** ("Written 2026-08-19 by Damon 'Dame' Williams, co-founder & CPO") were
corrected on the assumption the repo had the title wrong all along, rather than the title having
changed on 2026-08-20. **If it genuinely changed this week, those two now overstate when Dame
became CTO** — two-line revert. This is the one place the session guessed at intent.

## After the PR merges

Refresh local main (`refresh-main` skill). The committed post-merge hook auto-syncs Donny's RAG
when `docs/` changed — do not hand-sync. Verify via `.git/knowledge-sync.log` (`errors=0`).

## Note on this file

Deliberately **not** copied into `docs/wiki/raw/sessions/`, despite the usual rule in
`CLAUDE.md`. This session's knowledge was already ingested on 2026-08-20 —
`raw/sessions/2026-08-20-google-workspace-signatures-wave-1.md` → the concept page, source page,
index and log. Copying this handoff there would file a second source for one session and
duplicate a page that already exists, against the wiki's own "compound, don't duplicate" rule.
This file is execution state; the wiki already has the knowledge.
