# 2026-08-26 — §5 regrew to 155 KB, and the fix that "makes it stick" did not

Branch `docs/project-context-index`. Session goal as stated by the founder: "we need to clean up
the Project_context doc."

## The measurement

`docs/PROJECT_CONTEXT.md` was **170,999 B / 1,968 lines**. §5 "Active Workstreams" was
**154,964 B — 90% of the file**. The two largest single entries (Instagram and YouTube
connectors) were **13 KB each**.

§5's own header has said *"Index only — one line per entry"* since July 2026.

The July split (#294, #295) cut the file **176,620 → 73,742 B** and, in its own words, *"both
generators were amended so it cannot regrow"*. It regrew to within 3.2% of its pre-split size in
about six weeks. **That claim is now falsified and is corrected in place on the wiki page.**

## What was done

§5 rewritten as a strict index — one or two lines per entry, `**Pending:**` kept verbatim where
work is genuinely blocked, narrative dropped. Result: file **170,999 → 47,384 B (−72%)**, §5
**154,964 → 31,349 B (−80%)**.

New **`### Open items — founder action`** subsection hoists the 11 blockers engineering cannot
close into one list, ordered by what blocks launch. Previously these were scattered across ~20
entries, which **hid a real connection**: turning the site gate on returns 401 on `/` and
`/privacy`, which breaks Google's, Meta's, TikTok's and X's app reviews — a fact stated in two
separate entries that never referenced each other.

### Nothing was destroyed, and that was checked before cutting

All **79** referenced wiki pages exist, and each is *larger* than the §5 entry it backs.
`SHIPPED_LOG.md` carries full session prose for every entry. §5 was a **third copy**. The 12
pages whose direct pointer was folded into a grouped one-liner are all catalogued in
`docs/wiki/index.md`, verified by name rather than assumed.

## Five wrong claims, found by checking the things themselves

All 111 cited PRs were checked against the repo's 530 in one API call.

| Claim | Reality |
|---|---|
| #444, #452 "open" | both **MERGED** |
| "#387 and #396 merged" | **#387 was CLOSED unmerged** 2026-08-08 |
| #249 shipped `find_creators` | **CLOSED unmerged**; landed via #251, cards via #254 |
| "13 edge functions answer `.io`" | **12**, measured |

**#387 is the one that matters.** The work is real — all three migrations are in #396's merge
commit `ea5d93c8`, and `can_notify_user` is referenced 7× in `create-notification/index.ts` on
`origin/main`. Only the attribution was wrong. But a reader who runs `gh pr view 387` gets
**CLOSED** and reasonably concludes a security fix never landed. *A wrong PR number on a true
claim is worse than no PR number, because it invites a check that returns the wrong answer.*

**The 12 vs 13.** Re-measured by preflighting all 125 edge functions from
`capacitor://localhost`: 93 answer correctly, 18 have no CORS header (all cron/webhook — correct),
**12** answer `https://dragoncandy.io`. The doc said "almost exactly the money surface"; it is
*exactly* the money surface — every payout, escrow, refund, invoice and withdrawal function, now
named individually. **Control:** the same function echoes `.com` for a `.com` origin, so the `.io`
answer is real and not a probe artifact.

## Two workstreams were missing entirely

The **TikTok read-only analytics connector** (#525, #529 — four deployed functions, five
migrations) had **no §5 entry at all**, and neither did the **email-verification rework** (#527,
#528, #530). None of #525–#530 has reached `SHIPPED_LOG.md` or the wiki either, so the knowledge
layer owes five PRs. Both new entries say so rather than implying coverage.

*An index that omits shipped work fails in the direction that matters more than bloat: a reader
concludes the work does not exist.* The cleanup found these only because a `git fetch` mid-session
moved `origin/main` and prompted a check of what had landed.

## The guard

`src/projectContextSize.test.ts` — per-entry line cap, §5 and whole-file byte caps, and the rule
text staying present. **A written rule that nothing enforces is not a control**; that is the
lesson the July cleanup had to learn twice, and it is the same reason `brandLogo.test.ts`,
`profilesWriteGrants.test.ts` and `migrations.test.ts` exist.

All failure branches were **forced, not assumed**: a 31-line entry fails and names itself; 400
short entries trip both byte caps; changing `- **` to `* **` fires the parser control.

### The Codex finding, and why it was right

Codex filed one **P2** against the first draft's control, which asserted *"§5 parses at least 40
entries"*. That is **a content floor, not a parser check** — and §5 getting *smaller* is the
entire point of the file, so the floor would eventually fail on correct maintenance and pressure
an author into keeping stale entries or deleting the guard. The guard would have ended up
fighting the behaviour it exists to encourage.

Replaced with two content-independent controls: `parseEntries()` against a **fixed fixture** with
exact expected line counts, and **parser count === raw bullet count** on the live file. The raw
counter matches any list marker (`/^[-*+] +\*\*/`) **on purpose** — if §5 switches to `* **`, the
counter still sees 85 while the parser sees 0, and the mismatch fails. A `-`-only regex would drop
to 0 alongside the parser and the two would agree about nothing.

Proven both directions: the syntax swap fails with *"expected +0 to be 85"*, and a §5 shrunk to
**2 entries passes** — which would have failed under the old floor.

**Note on the citation.** Codex cited `AGENTS.md`, which `CLAUDE.md` flags as a stale duplicate
and which caused a refuted P1 on #519. The claim was therefore checked against `CLAUDE.md` itself,
where the same *"one-line-per-entry index"* sentence appears — so the finding stood on the
authoritative file, not the stale one. **Check the citation, not just the claim.**

## What could NOT be verified

The **database half** of the sweep. Both paths refused with an explicit *Unauthorized* rather than
a wrong answer: the Supabase MCP reports `✔ Connected` but holds no `SUPABASE_ACCESS_TOKEN` (the
trap `CLAUDE.md` documents — `list_migrations` is the probe that exposes it), and
`.env.sync.local` is gitignored, so it exists only in the main checkout, which a worktree session
cannot reach.

So these are **unverified, not verified-true**, and were left as written: migrations *applied* to
prod, cron run counts, and the `SOCIAL_LOGIN_ENABLED` / `READINESS_GATE_ENABLED` flag rows.
*A refusal that names itself is the good failure — the bad one is a probe that cannot tell a true
answer from a false one, which this project has already recorded in the SMTP `RCPT TO` case.*

## Lead, not a finding

`outstand-proxy` and `social-proxy` answer `Access-Control-Allow-Origin: *` where the other 93
functions use the allow-list. Both authenticate by bearer token, and `*` does not permit cookie
credentials. **Exploitability untested** — recorded as a lead for an owner, deliberately not
called a defect.

## Verification

3,546 tests pass (315 files); production build clean. `npm run typecheck` reports one
**pre-existing** error — `middleware.ts(30): Cannot find module '@vercel/functions'` — on a file
this branch does not touch; Codex independently confirmed it as outside the patch. Codex clean at
round 2.
