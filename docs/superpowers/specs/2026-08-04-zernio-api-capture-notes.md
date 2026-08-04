# Zernio API — captured shapes (Phase 0)

> Live capture against a real Zernio account, 2026-08-04. **These supersede every inferred shape
> in `zernio-map.ts` / `zernio.ts`**, which were written from reading docs. Anything still marked
> UNCONFIRMED below has not been observed and must not be trusted.

## Base URL

`/v1` and `/api/v1` are **both live and return identical bodies** on `api.zernio.com`.
`zernio.com/api/v1` also answers. The adapter's default `https://api.zernio.com/v1` is **correct** —
this risk is retired.

The **connect** flow, however, lives on `zernio.com/api/v1`, not `api.zernio.com` (see below).

## Response envelopes — there is no consistent wrapper

Each endpoint wraps differently. This is the single biggest source of mapper breakage.

| Endpoint | Envelope |
|---|---|
| `GET /accounts` | `{"accounts":[...],"hasAnalyticsAccess":true}` |
| `GET /posts` | `{"posts":[...],"pagination":{page,limit,total,pages}}` |
| `GET /analytics` | `{"overview":{totalPosts,publishedPosts,scheduledPosts,lastSync,dataStaleness:{staleAccountCount,syncTriggered}},"posts":[...],"pagination":{...},"accounts":...}` |
| `GET /inbox/conversations` | `{"data":[...],"pagination":{hasMore,nextCursor},"meta":{accountsQueried,accountsFailed,failedAccounts,lastUpdated}}` |
| `GET /profiles` | `{"profiles":[...]}` |
| `GET /webhooks` | **HTML** — not an API path. Webhook registration is elsewhere (dashboard). |

### CONFIRMED BUG — `listAccounts` can never return an account

`adapters/zernio.ts`:

```ts
const raw = (await request('GET', '/accounts')) as unknown[];
return (Array.isArray(raw) ? raw : []).map((a) => fromZernioAccount(a as never));
```

The real body is an **object** (`{accounts:[...]}`), so `Array.isArray(raw)` is always false and this
returns `[]` **unconditionally**. It would present as "no accounts connected" rather than as a
parsing bug. Must read `raw.accounts`.

**CORRECTION:** an earlier revision of this file speculated that `getPostAnalytics` was broken the
same way. **It is not.** `?postId=` *is* honored and returns a post-scoped object whose metrics nest
under `analytics` — exactly what `fromZernioPostAnalytics` reads. That mapper is correct as written.

`?accountId=`, by contrast, **is silently ignored** — the filtered and unfiltered bodies are
byte-identical. Account filtering must happen client-side.

## Profiles — a real container the contract does not model

`GET /profiles` → `{"profiles":[{"_id":"…","userId":"…","name":"Default","isDefault":true,
"color":"#ffeda0","createdAt":"…","updatedAt":"…","__v":0}]}`

- Mongo-style: `_id` (not `id`), plus `__v`.
- A `Default` profile is auto-created with the account.
- The dashboard scopes **every connection to a profile** ("Choose a profile and platform to
  connect"), and the profile id rides in the OAuth `state`.
- `src/integrations/social/contract.ts` has no profile concept. For a single-profile tenant the
  Default is implicit, so parity does not require modelling it — but multi-location businesses
  (`org_units`) map naturally onto profiles later. Decide deliberately; do not model it by accident.

## Connect flow — observed from a real OAuth round-trip

Clicking Instagram → in the dashboard redirects to Instagram with:

- `redirect_uri` = `https://zernio.com/api/v1/connect/instagram/callback`
- `state` = `{userId}-{profileId}-{timestampMs}-{returnUrl}`
  e.g. `6a71e8f7…-6a71e8f8…-1785858138889-https://zernio.com/dashboard/connections?profile=6a71e8f8…&group=profile`
  The `{profileId}` matches the Default profile `_id`. **The post-connect return URL is carried in
  `state`** — that is the seam for landing on our own callback page in Phase 2.
- `flow` = `ig_biz_login_oauth`; Zernio's Meta `client_id` = `1387147079198980`.
- `scope` = `instagram_business_basic`, `instagram_business_manage_comments`,
  `instagram_business_manage_messages`, `instagram_business_content_publish`,
  `instagram_business_manage_insights`

**Consequence:** these are `instagram_business_*` scopes — Instagram **Business or Creator**
accounts only. A personal Instagram account cannot connect. Same constraint likely applies to the
Facebook page path.

`content_publish` + `manage_insights` are both granted, so posting and analytics are available on
the free tier (`hasAnalyticsAccess: true` corroborates).

The adapter's `getConnectUrl` guess (`GET /connect/{platform}?redirectUri=…` → `{url|connectUrl|authUrl}`)
is **not yet confirmed** — the dashboard's own redirect is what was observed. Confirm the
programmatic call before relying on it.

## Analytics freshness — not a simple read

`/analytics` exposes `overview.lastSync` and `overview.dataStaleness.{staleAccountCount,
syncTriggered}`. Numbers are **cached server-side and may be stale**. Phase 6's
`content-performance-capture` must not assume a plain GET returns current data — establish whether
a sync must be triggered and how long it takes, or milestone snapshots will record stale values.

## Pricing / entitlement observed

Free-credit balance of **$12.00** granted with **no payment method** attached. First 2 connected
accounts are free. Step 2 of onboarding ("add a payment method for $5 credit") is skippable.

## Account object (live, `GET /v1/accounts`)

Health is **not** `isActive`. On connect: `isActive:true`, `enabled:true`,
`needsReconnection:false`, `platformStatus:"active"`, `intentionalDisconnectAt:null`,
`tokenExpiresAt` **~60 days out**. When a token dies Zernio sets `needsReconnection`/`platformStatus`
and **leaves `isActive` true** — so keying off `isActive` alone reports a dead account as healthy.

Other useful fields: `username`, `displayName`, `profilePicture`, `profileUrl`, `followersCount`,
`externalPostCount`, `permissions[]`, `platformUserId`, `analyticsLastSyncedAt`,
`metadata.profileData.extraData.accountType` (`"BUSINESS"`).

**Inconsistency:** `profileId` is an **object** `{_id,name}` on `/accounts` but a **plain string** on
`/analytics`. Do not assume one shape.

## Post analytics — a superset of both our stores

Real per-post `analytics`:

```
impressions, reach, likes, comments, shares, saves, clicks, views, follows,
engagementRate, igReelsAvgWatchTime, igReelsVideoViewTotalTime,
videoDurationSeconds, lastUpdated
```

- Contract `PostAnalytics` (impressions/likes/comments/shares/clicks) — all present.
- `content_performance` (views/likes/comments/shares/saves/reach/engagement_rate) — all present.

Zernio supplies everything both stores need, so no metric is lost either way.

Account-level analytics have **no rollup**: `followers` comes from `accounts[].followersCount`,
`postsCount` from `overview.publishedPosts`, and reach/engagementRate must be aggregated from
`posts[].platforms[]`, which carries `accountId` + its own `analytics` per account.

## External post back-fill — relevant to Phase 6

On connect, Zernio ingested **10 pre-existing Instagram posts** (`externalPostCount: 10`) with full
analytics, flagged `isExternal: true`, including a real DragonCandy campaign post from 2026-06-09
(`#DragonDashed`) and its Instagram permalink.

**Consequence:** post-level analytics do **not** strictly require a post to originate in Zernio —
only that we know its Zernio `_id`, obtainable by listing posts and matching on
`platformPostUrl`/`platformPostId`. The spec's Phase 6 sequencing (after the UI swap) remains correct
and simpler, and with only 3 legacy `social_post_log` rows a back-match is not worth building. Worth
knowing that the option exists.

## Multi-tenancy — VERIFIED end-to-end 2026-08-04

The question that matters for DragonCandy is not "how many connections" but "can thousands of
**distinct** businesses and creators each connect their own accounts and read their own analytics."
Answer: **yes**, via **Profiles**. Proven against the live account, not just read in docs:

| Step | Call | Result |
|---|---|---|
| Create a tenant | `POST /v1/profiles {name,color}` | new `_id`, `isDefault:false`, same platform `userId` |
| Scope a connect | `GET zernio.com/api/v1/connect/{platform}?profileId=X` | `{authUrl, state}` — **the passed profileId is embedded in `state`** |
| Isolate accounts | `GET /v1/accounts?profileId=X` | Default → 1 account; new profile → **0**. The filter is honored |
| Delete a tenant | `DELETE /v1/profiles/{id}` | 200 |

Docs (`/guides/multi-tenant`): *"one profile per customer, their connected accounts inside it, and
your database holding the mapping."* Profiles live **inside your team** — not separate Zernio user
accounts — and **one API key serves all tenants**. No documented profile cap. Scoped/read-only API
keys exist for stricter per-tenant isolation.

Note `?profileId=` on `/accounts` **is** honored, in contrast to `?accountId=` on `/analytics`,
which is silently ignored. Do not assume filter params work — each one needs checking.

### Gap this exposes in our contract

`src/integrations/social/contract.ts`'s `TenantCtx` is `{userId, businessId, orgUnitId, provider}` —
**no `profileId`** — and `business_outstand_accounts` has no profile column. Outstand's model was
flat (one org key; accounts distinguished only by id), so nothing in the seam carries a tenant
container.

Without a profile per customer, **every business's accounts land in the single `Default` profile**.
That still functions at small scale — `social-proxy` scopes by `user_id` in our own DB — but it
forfeits Zernio-side isolation and is painful to retrofit at thousands of tenants. Phase 2 must
provision a profile per business, persist the id (additive nullable column), and thread it through
`getConnectUrl` + `listAccounts`.

### Scale caveats

- **Rate limits are per BILLING TEAM, not per tenant.** 60 req/min (0–2 accounts) → 600 (3–2,000) →
  1,200 (2,001+), sliding window; analytics endpoints are per-SECOND (6/10/20 req/s). At thousands
  of tenants that ceiling is **shared**, so simultaneous bursts contend. Reinforces bulk
  `/analytics` paging over per-post polling.
- **Billing is per connected account, not per profile** — profiles appear free. Graduated: 2 free,
  then $6 (3–10) / $3 (11–100) / $1 (101+), with no cap on the $1 tail.

## Still UNCONFIRMED — do not trust the code's guesses

- `uploadMedia` — adapter guesses `POST /media` → `{id,url}`. Flagged in code, unobserved.
- `finalizeConnection` — returns `[]` today; the real callback payload is unobserved.
- Single-post shape from `GET /posts/{id}` (only the empty list envelope was seen).
- Post-analytics object shape (needs a real published post).
- Account object fields (needs a connected account).
- Comment object shape; webhook event payloads and signature scheme.

Everything in this last group is blocked on a connected account plus one published post — i.e. the
Phase 0 gate.
