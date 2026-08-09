# 2026-08-08 — `verify_jwt=true` is not authorization: 6 anon-key-reachable service-role functions

Direct follow-on from the `donny-dragonshare-score` removal earlier the same day. That work filed
two `[med]` leads; checking them found something bigger than either.

## The core fact

**The anon key is a valid JWT, and it ships in the frontend bundle.** So `verify_jwt: true` — the
platform default for any function without a `config.toml` entry — stops nothing. A function that
builds a service-role client and never reads an `Authorization` header answers **anyone on the
internet**, not merely "any authenticated user", which is how I first described it.

Proven against prod, not inferred:

| Probe | Result |
|---|---|
| `POST /dragonshare-notify`, no credentials | **401** (so the gate is on) |
| `POST /dragonshare-notify`, `Bearer <public anon key>` | **200** |
| `POST /fire-dragonshare-social-hook`, `Bearer <public anon key>` | reached its DB lookup → `{"error":"Boost not found"}` |

Neither probe fired a side effect: the first used an `event` string matching no branch, the second a
zeroed uuid that 404s before any write. **Do not "verify" a write-capable hole by performing the
write** — pick a payload that proves reachability and stops.

## The sweep

A mechanical scan of all 100 functions (`scan.mjs`, kept in scratch): builds a service-role client
**and** shows no caller-establishing signal (`auth.getUser` / `isAuthorizedIngest` / webhook
signature / shared secret). 18 candidates → triaged into three buckets.

- **Legitimately public (4):** `capture-lead`, `generate-anonymous-brief`, `landing-clips`,
  `verify-package-order-escrow`. The last is the interesting one — a guest returning from Stripe
  Checkout has no JWT, so its abuse control is the **Stripe binding** (`metadata.order_id` must
  equal the claimed order), not a token. `auth.getUser` would be the *wrong* fix.
- **Authorized by a mechanism the regex missed (8):** exact service-role compares
  (`resolve-dispute`, `donny-cost-rollup`, `generate-embedding`), an `x-cron-secret`
  (`donny-auto-pilot`), sha256 OAuth code/token lookups (`donny-oauth-token`/`-userinfo`), Google
  JWKS verification (`google-chat-donny`), a single-use email token (`verify-email`).
- **Genuinely unauthenticated and consequential (6).** Fixed 5.

**Both money functions came back clean** — `resolve-dispute` (exact service-role compare) and
`verify-package-order-escrow` (Stripe-bound). That was the outcome I most wanted to know and least
expected to be reassuring.

## What was actually wrong, and why each fix differs

The temptation is one guard everywhere. **Each function needed a different one**, decided by who
legitimately calls it — which is a `src/` grep, not a judgement call.

| Function | Real callers | Fix |
|---|---|---|
| `fire-dragonshare-social-hook` | service-role only | `isAuthorizedIngest` — drop-in, caller already sends the bearer |
| `dragonshare-notify` | **browser ×2 + service-role ×1** | split gate (`authz.ts`, 14 tests) |
| `social-caption` | browser ×3 + service-role ×3 | `auth.getUser`, id from the JWT; body id only behind ingest |
| `fire-campaign-social-hook` | browser only | `auth.getUser` + a purpose-built write gate (`authz.ts`, 12 tests) |
| `fire-promotion-social-hook` | browser only | ownership assertion (it already authenticated) |
| `toast-discount-push` | none | `isAuthorizedIngest` |

**I got the caller analysis wrong once and said so.** I told the founder both DragonShare hooks had
"exactly one caller, service-role→service-role". True for one; `dragonshare-notify` is called by the
browser twice (`useDragonShare`, `useDeclineDragonSharePost`). A blanket ingest guard would have
broken post submission and decline. The grep took thirty seconds and I did it *after* stating the
claim.

Beyond authorization, two **unpaired-id** defects — the same shape twice:

- `fire-dragonshare-social-hook` fetched the boost and the post independently and never
  cross-checked them, so **any boost paired with any post**.
- `fire-promotion-social-hook` fetched the submission by id alone, so a promotion owner could pull a
  *different* promotion's submission (customer name + video) into their draft. Fixed by
  `.eq('promotion_id', promotion_id)`.

And one data-shaped fix: `dragonshare-notify`'s `boost_paid` took `creator_id` **and
`creator_payout_cents`** from the body while sending a `role:'assistant'` Donny chat message — an
anonymous caller could make the platform's own AI tell any user they had been paid an arbitrary sum.
The handler already fell back to the boost row for both, so dropping the body values is
behaviour-preserving for the real caller and removes the attacker-chosen figure entirely.

## The review caught a conceptual error of mine

I first gated `fire-campaign-social-hook` with the shared `evaluateCampaignAccess`. That helper is
documented as answering *"can this actor **SEE** this campaign's detail data"* — a **read** gate. I
used it for a side-effecting **write** that mints 1-hour signed URLs over private deliverables. Its
`hasApplication && status === 'published'` arm therefore let a **pending or rejected applicant**
fire stage-4 into the restaurant's and brand's accounts.

**A read gate is not a write gate**, even when most of the clauses match. Replaced with a
purpose-built `authz.ts`: owner ∨ active org member ∨ active sponsoring brand. Creators are excluded
deliberately — no live caller is one, and a creator does not decide that content gets staged to the
business's social accounts. Duplicating two clauses is the correct price.

The brand arm is written despite `BRAND_ROLE_ENABLED` being `false`, because its future caller
(`useJointApproval`'s brand branch) swallows errors with `.catch(console.error)` — omitting it would
mean drafts silently never appear the day Brand launches, surfaced nowhere.

Also closed two existence oracles the review found: identity now resolves **before** the campaign is
read (so an anonymous caller can't distinguish 404-from-403 on a campaign id, nor make us run a
service-role query on an id of their choosing), and a missing post/campaign returns the same status
as "not yours".

## Where the sweep's own method fell short

`fire-promotion-social-hook` was **not** in my 18 candidates — my regex saw `auth.getUser` and
classified it authorized. It authenticates and never checks ownership.

**"Calls `getUser`" ≠ "authorizes."** A mechanical scan can only find the absence of a *signal*, and
the signal here is not the control. The scan is a lead generator; the classification was the
subagent's read, and the one it added that my regex could never have found was the most instructive.

## Two prod checks that changed the answer

- **Zero Toast tables exist on prod** (`information_schema` → no `%toast%` tables at all). So
  `toast-token-refresh` cannot disconnect a POS — its first query hits a missing table — and
  `toast-discount-push`'s "unauthenticated INSERT into `toast_sync_events`" was **never possible**.
  The guard on the latter is still right (it lands before the tables do; its own header comment says
  the stub becomes a real POST to a live discount config at partner tier), but the stated impact was
  overstated. Corollary worth raising: `PROJECT_CONTEXT.md` lists **Toast POS** under "Active
  integrations" — with no tables and no partner tier, that line is aspirational.
- **`is_active_group_member(p_group_id, p_creator_id)`** — the `p_` prefixes are real;
  `DATABASE_SCHEMA.md` writes the shorthand `(group_id, creator_id)`. A doc shorthand is not a
  signature.

## Verification

- 26 new unit tests across two pure `authz.ts` modules; `npm run lint` 0 errors; edge-typecheck
  66 clean.
- **The CI gate does not cover 4 of the 6 functions changed** — `social-caption`,
  `fire-campaign-social-hook`, `fire-dragonshare-social-hook` and `fire-promotion-social-hook` are
  all in `.typecheck-ignore`, so "66 clean" says nothing about them. Checked directly with the
  gate's own `deno check` invocation, before and after: **16 errors → 16 errors, all `TS18046` on
  pre-existing catch-variable lines. Zero introduced.** Whenever a change touches an ignore-listed
  function, the gate is not evidence — run the baseline comparison by hand.

## Left open, deliberately

- **`toast-token-refresh`** — its browser caller (`ToastConnectionCard`) refreshes **every tenant's**
  tokens, not just its own. That is a product decision, not a guard. Inert today (no tables).
- **`fire-campaign-social-hook`'s `file_uploads` query is not scoped per party** (pre-existing):
  filtered on `campaign_id` only, so on a multi-creator campaign creator A's draft carries working
  signed URLs to creator B's deliverables. It is the asset the new gate protects, but narrowing it
  changes feature behaviour and belongs in its own change.
- **`dragonshare-notify` residuals:** `submission` has no replay bound (`postDonnyChatMessage`
  inserts a new row each call, so a creator can flood the owner's Donny thread), and `declined`
  accepts any active org member while the underlying `decline_dragonshare_post` RPC requires
  owner/admin. Both strictly better than "anyone with the anon key", neither perfect.
- **`donny-oauth-token/index.ts:50-55`** — `oauthError()` references `req` at module scope, so every
  OAuth 4xx path throws `ReferenceError` and surfaces as a 500. Unrelated to auth; noted in passing.

## Not deployed

All six are code changes and are **inert until deployed**. Merging closes nothing here — the
opposite of the sibling `donny-dragonshare-score` change, where deletion needed an undeploy. Both
halves of that asymmetry are the same underlying fact: **the repo is not production.**
