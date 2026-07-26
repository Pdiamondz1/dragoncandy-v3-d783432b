---
title: Supabase .in() Header Overflow
type: concept
created: 2026-07-26
updated: 2026-07-26
sources: [2026-07-26-200k-load-run-and-header-overflow.md]
tags: [supabase, postgrest, node, failure-mode, debugging, sim]
---
# Supabase .in() Header Overflow

**An unbounded `.in(column, ids)` is a latent 16 KB bomb, and when it goes off it lies about
what it is.** It surfaces as `TypeError: fetch failed` — indistinguishable, at the call site,
from the network being down.

## The mechanism

1. `.in()` serialises **every** value into the URL query string:
   `?email=in.("a@x","b@x",…)`.
2. PostgREST echoes the full request URI back in the **`Content-Location` response header**.
3. Node's HTTP client (undici) enforces a **16 KB `maxHeaderSize`**. A response header past
   that aborts the response with `UND_ERR_HEADERS_OVERFLOW`.
4. Because the failure is at the transport layer, it is **not a `PostgrestError`** — it never
   reaches the `if (error)` branch that would have named it. supabase-js surfaces the wrapped
   `TypeError: fetch failed`.

The request is well-formed and the server is healthy. Only the *echo* is too big.

## Measured thresholds (prod REST, one process, 2026-07-26)

| ids | URL chars | result |
|-|-|-|
| 50 | 2,124 | HTTP 200 |
| 250 | 10,475 | HTTP 200 |
| 400 | 16,775 | `UND_ERR_HEADERS_OVERFLOW` |
| 500 | 20,975 | `UND_ERR_HEADERS_OVERFLOW` |

Roughly **~42 chars per email**, **~39 per UUID** — so the practical ceiling is around
**380–400 values**, and it is a cliff, not a slope. Chunking at **100** leaves ~4× margin.

## Why it reads as a network outage (and how to tell)

This cost about two hours in the [[Synthetic Weight Engine]] 20-shard seed. Four consecutive
CI dispatches died ~1 s in on `TypeError: fetch failed`; `npm ci` in the same job succeeded.
The investigation went to Supabase network restrictions, network bans, and the status page —
all negative — before the actual discriminator turned up, and it had been in the log the
whole time:

> **A successful Supabase call earlier in the same process disproves a connectivity theory.**

`cmdBulkSeed` runs `bootGate` (a real query — `readKillSwitch`) *before* the pre-flight. The
error came from the pre-flight, so the database had answered milliseconds earlier over the
same socket pool. That single ordering fact makes "this runner cannot reach Supabase"
impossible.

The generalisable checks, cheapest first:

- **Did anything else in this process already talk to the same host?** If yes, it is not the
  network.
- **How big is the payload?** Count the values in the `.in()` before blaming the network.
- **Read `err.cause`.** `TypeError: fetch failed` is a wrapper; the cause carries the real
  code (`UND_ERR_HEADERS_OVERFLOW` vs `ENOTFOUND` / `ECONNRESET` / `ETIMEDOUT` — DNS vs TCP
  vs reset).
- **Does the failure scale with input size?** A network fault does not care how many ids you
  passed. Bisect on `n`.

## The fix

Chunk at a fixed batch size and preserve the original failure semantics:

```ts
const CHUNK = 100; // ~39–42 chars/value ⇒ ≪ 16 KB echoed header
for (let i = 0; i < ids.length; i += CHUNK) {
  const { data, error } = await client.from(table).select(cols).in(col, ids.slice(i, i + CHUNK));
  if (error) throw new Error(...);   // still fail-loud, still on the FIRST bad batch
  out.push(...(data ?? []));
}
```

Assert **the real constraint** in tests — that the built PostgREST URL stays under 16 KB —
not the chunk size, which is an implementation detail that will drift.

## Where it bit, and where it nearly did

Both sites are in `sim/` (fixed in **PR #345**, `d2a5b040`):

- `sim/seed.ts` `assertActiveNamespaceFree` — the confirmed break: 500 bot emails ≈ 21 KB.
- `sim/mint.ts` `selectIn` — **latent and worse**. `readCohort` passes every session-capable
  bot id to `synthetic_users` / `creator_groups` / `campaigns`; the live 25 + a 20-shard
  500-bot cohort = 525 UUIDs = 20,590 chars. It would have broken the **daily `tick` cron**
  had a matrix cohort ever been left seeded — a scheduled job failing on a payload size that
  depends on how much *other* work is currently parked in the database.

**It stayed latent because a different constant was holding it back.** Slice 1's
`MAX_SHARDS = 10` capped the cohort at 250 emails, just under the wall; Slice 2 raised it to
20 → 500, and the first dispatch that could hit it did, deterministically. A limit raised in
one file detonated an unbounded query in another — neither change is wrong in isolation.

## Known issues

- The app has **89 `.in()` call sites across 39 files** (`src/hooks/**` mostly). Most are
  bounded by a user's own small collections — their campaigns, their conversations — but
  **none have been audited** against this ceiling. The rule of thumb: a list bounded by a
  page size or one user's own rows is fine; a list derived from a table scan, a cohort, or an
  admin/service-role sweep is a bomb waiting for its input to grow.
- Edge functions run on Deno, not undici, so the exact 16 KB limit is Node-specific — but the
  same "unbounded ids in a URL" shape has its own ceilings there (URL length limits at the
  gateway). Chunking is the portable answer.

## See Also
- [[Synthetic Weight Engine]] — where this broke (the 20-shard seed) and the 200K-band run it blocked.
- [[Reading Agent Traces]] — the sibling supabase-js trap: `.then(ok, fail)` hides Postgrest
  errors entirely, because the builder resolves rather than rejects. Same lesson from the
  other side — **the client can make a real failure look like something it isn't.**
- [[Supabase]] — the backend entity.
- [[Error Handling Patterns]] — app-level error surfacing conventions.
