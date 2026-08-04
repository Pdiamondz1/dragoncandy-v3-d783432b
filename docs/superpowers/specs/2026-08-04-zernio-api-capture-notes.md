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

Audit every other call site for the same assumption — `getPostAnalytics` requests
`/analytics?postId=…` and hands the whole `{overview, posts, pagination, accounts}` envelope to
`fromZernioPostAnalytics`, which expects a post-analytics object.

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

## Still UNCONFIRMED — do not trust the code's guesses

- `uploadMedia` — adapter guesses `POST /media` → `{id,url}`. Flagged in code, unobserved.
- `finalizeConnection` — returns `[]` today; the real callback payload is unobserved.
- Single-post shape from `GET /posts/{id}` (only the empty list envelope was seen).
- Post-analytics object shape (needs a real published post).
- Account object fields (needs a connected account).
- Comment object shape; webhook event payloads and signature scheme.

Everything in this last group is blocked on a connected account plus one published post — i.e. the
Phase 0 gate.
