# Session — media ownership scoping, atomic schedule completion, delegation flag

Date: 2026-08-06 → 2026-08-07
Branch: `fix/media-scope-and-schedule-completion` (off `a25d9be4`)

Four queued items taken after PR #368 merged: #48, #49, #44, and the #43 decision.

## #48 — `/media` was unscoped across every tenant

`outstand-proxy`'s `enforceScope` allowed `/media`, `/media/upload`, `/media/{id}`
and `/media/{id}/confirm` for **every method** to **any** authenticated caller,
under the comment *"Media is org-level in Outstand — allow read/write for
authenticated users."*

The premise was accurate and the conclusion inverted. The Outstand key is
**org-wide**, so "org-level" means every DragonCandy tenant's uploads share one
pool: any authenticated user could list every tenant's media — filenames and
URLs — and **DELETE any of it**. The vendor SDK calls all four endpoints
including `DELETE /media/{id}`, so this was a live UI path.

**Ownership cannot be derived from the row.** The SDK's `MediaFile` is
`{id, url, filename, contentType, size, status, created_at, expires_at}` — no
account, user or org field — and the provider exposes no per-tenant scope. There
is literally nothing on a media row to filter by. So ownership is recorded on our
side at the only moment both facts exist together: the proxy authenticates the
caller (`ctx.userId`) and proxies `POST /media/upload`, so it sees the provider's
own response id. Same argument as `outstand_post_ownership`; the new
`outstand_media_ownership` mirrors it exactly, table-level REVOKE and all.

**Strict from day one**, unlike `outstand-webhook`. Justified rather than
stylistic: `GET /media` returns `count: 0` on prod, so there is no pre-binding
population to strand. Doing it before the first upload is cheaper than after.

## #49 — delegated posting was offered and could not work

The card was live in Social Media → Accounts and would record a grant, but the
post would then fail: `outstand-proxy` builds `ownedIds` from the **grantee's**
accounts, so the grantor's are never in it. The permission row is written, the
creator sees success, and nothing can ever publish through it.

Gated behind `DELEGATED_POSTING_ENABLED` (false) rather than deleted. Verified
first: `delegated_posting_permissions` has **zero rows** on prod, so nothing was
taken away.

## #44 — a finished schedule could never say so

`campaigns.posting_schedule_status` has a CHECK permitting `'completed'` and
`CampaignScheduleSection` renders a card for it ("All Posts Published"). **Nothing
ever wrote that value.** A campaign whose posts all published sat on the
"scheduled" card forever — the success state existed in the schema and in the UI
and was unreachable in between.

Wired at `outstand-webhook`, the one place that learns a post went live.

## #43 — deferred, with the reason recorded

Whether amplification rows should be editable in `ScheduleReviewScreen`.
Deferred: amplification is brand-only and no brand account has a social
connection, so designing an edit flow for it means guessing at behaviour nobody
can observe.

## What the reviews caught — mostly my own mistakes

Five rounds of Codex plus a `data-exposure-reviewer` pass. Every finding was
real and treated as blocking. The ones worth remembering are the ones I caused:

1. **I reintroduced a cross-tenant WRITE.** The completion loop derived campaign
   ids from the query matching on the **client-writable** `metadata->>outstand_post_id`,
   and `donny_scheduled_posts.campaign_id` has nothing in its INSERT policy
   constraining it. A planted row naming a victim's campaign would have had the
   service-role update flip **their** campaign to "All Posts Published".
   `confirm-posting-schedule` had already been hardened against this exact write
   with `.eq('user_id', user.id)` — the webhook reopened it through a door with
   no authenticated user. Fixed by carrying `(campaign_id, user_id)` **pairs**
   and scoping every read and the write to that user.

2. **`social-proxy` creates media and minted nothing** — the two-gateway shape
   `outstand-post-ownership-store.ts` exists to prevent, repeated one `case`
   block away. Both gateways now go through a shared store.

3. **The media binding was not provider-gated.** `social-proxy` is
   provider-agnostic; with Zernio active it would have written a **Zernio** media
   id into the Outstand-keyed table, which `outstand-proxy` then trusts as
   authorization. The post path already had exactly this guard.

4. **I broke every media upload.** Narrowing the upload body to an allow-list, I
   kept `contentType` — the camelCase name in the SDK's *TypeScript signature* —
   when the **wire field is `content_type`**. Read off the bundle:
   `api.post("/media/upload", { filename, content_type: contentType })`. Every
   real upload would have reached Outstand with no MIME type.

5. **Read-then-write left a race that could strand a campaign forever.** When the
   last two posts publish concurrently, each webhook could read the other's row
   as pending, both decline, and — those being the last two — nothing ever
   re-evaluates. Fixed with an atomic SECURITY DEFINER RPC **plus** an hourly
   sweep, because narrowing the window still leaves it non-zero and only a sweep
   can rescue a campaign that lost.

6. **Silent caps.** `listOwnedMediaIds` asked for *all* the caller's ids —
   unbounded, silently capped, so a heavy user's own media would vanish from
   their own gallery. Inverted to "of the ids on THIS page, which are mine?",
   which is bounded by page size. The sweep's `.limit(500)` was capped while its
   comment promised every in-flight campaign.

7. **My comment asserted the opposite of the truth.** I wrote that offset paging
   was safe "because completed rows only ever drop OUT" — rows dropping out is
   *precisely* what shifts the window and makes offset paging skip. Replaced with
   keyset paging and the correct reasoning, kept visible rather than deleted,
   because the next reader will have the same instinct.

8. **An unbounded safety net could take down the run it protects.** The sweep
   ignored the function's existing `RUN_BUDGET_MS`; thousands of sequential RPCs
   past the deadline means the function returns nothing at all.

**The edge-function typecheck gate added in the previous branch caught one of
these before review** — the wrong client variable in `reconcile-social-posts`,
which is in the checked set. First time that gate paid for itself.

## Known limits, recorded rather than hidden

- **`GET /media` paginates over the org pool before filtering.** Once several
  tenants have uploads, a caller can get an empty first page while their own
  media sits further down. Errs toward showing too *little*, never another
  tenant's. Fixing it means paging over the caller's own ids; not built because
  `count: 0` today and guessing a shape before data exists is how the analytics
  components went wrong.
- **`schedule-completion.ts` was deleted.** The rule now lives in SQL, and
  keeping a TS copy nothing calls is the drift the migration comment warns about.

## Deploy order — load-bearing

Migrations `20260807030000` (media ownership) and `20260807040000` (completion
RPC) **first**, then `outstand-proxy`, `social-proxy`, `outstand-webhook`,
`reconcile-social-posts`. Reversed, every `/media/{id}` call 403s (fails closed,
no leak) and the completion RPC does not exist.
