# Synthetic avatar pool — design

**Date:** 2026-07-26
**Status:** proposed
**Related:** [[Living Synthetic Marketplace]] · [[Synthetic Weight Engine]] ·
`docs/wiki/concepts/living-synthetic-marketplace.md`

## 1. Problem

The 2,000-profile synthetic marketplace is browsable on prod today and has no imagery. Verified
against prod on 2026-07-26:

| Surface | Rows | With a real image |
|-|-|-|
| `creator_profiles.avatar_url` (depth lane) | 1,484 | **0** — renders initials |
| `creator_profiles.avatar_url` (active lane) | 16 | **0** — see below |
| `business_profiles.logo_url` | 509 | **0** — see below |
| `profiles.avatar_url` (all synthetic, incl. the live 25 crew bots) | 2,025 | **0** |

The 24 profiles that *appear* to have an image point at a **160-byte, 8×8 solid-colour JPEG** —
`generatedImage()` in `sim/marketplace/content.ts`, the fallback the seeder uses because
`sim/marketplace/assets/` contains only a `.gitkeep`. The same 160-byte object is also each active
creator's entire `portfolio_urls` array.

**Why this matters:** `useCreatorBrowse` selects `creator_profiles` where `is_completed = true`, and
all 1,484 depth creators have it set — so every one of them is already on the Find Creators page,
blank. The lane that exists *purely to be browsed* is the lane with nothing to look at.

**What is already built and works:** `uploadAsset()` (`sim/marketplace/content.ts`) uploads to the
public `profile-assets` bucket using a uid-first object path (`<uid>/<subpath>`) that satisfies the
bucket's storage-RLS folder check, and `run.ts`'s `completeProfiles` writes the resulting public URL
to `creator_profiles.avatar_url` / `business_profiles.logo_url`. This path is prod-proven. It is
being fed placeholder bytes, and it only runs for the ~24 bots that authenticate.

## 2. Goals / non-goals

**Goals**
- A real, distinct photoreal face on every synthetic creator profile (1,500).
- A real logo mark on every synthetic business profile (509).
- `profiles.avatar_url` populated in step with the role tables, so messaging and crew surfaces —
  which read `profiles` first — match the browse page.
- Re-seeding after a cohort purge costs **$0**.
- No new permanently-deployed surface, and no new credential in a deployed function.

**Non-goals**
- Portfolio / work-sample imagery (explicitly deferred by the founder). 1,500 creator profiles will
  still show no work. This is the largest remaining cosmetic gap after this change and should be
  stated plainly rather than implied away.
- Any change to how real users' avatars work.
- Imagery for load cohorts (`botla`/`botseed_`), which are minted and torn down per run.

## 3. Founder decisions already settled

1. **Photoreal faces**, not illustrated/geometric avatars. The impersonation trade-off was raised and
   accepted: these profiles are browsable by real businesses, and a photoreal face reads as a real
   person. Mitigation retained: every row stays `is_synthetic`, excluded from founder metrics.
2. **Avatars only** — no portfolio generation.
3. **Paid generation (~$17)** rather than a free dataset. The free, high-volume face datasets are
   research/academic-licensed (verified only by description — the Kaggle page is JS-rendered and
   `generated.photos` returned 403, so this is stated as *unverified*), and the clearly
   commercial-use-permitted free set found was 223 images, which across 1,484 creators is ~7× reuse
   of every face.
4. **Local script**, not an edge function. `.env.sync.local` already holds the **prod service-role
   key** — a strictly more powerful credential than an OpenAI key — so "no key on disk" is not a
   property the project currently has, and an edge function would leave a permanently deployed,
   key-bearing surface whose only job runs once.

## 4. Architecture

Three separable units. Each is independently testable and has one job.

```
generate (paid, once)        assign (pure)              apply (service-role)
┌───────────────────┐        ┌──────────────────┐       ┌─────────────────────┐
│ OpenAI images API │        │ userId → poolIdx │       │ UPDATE creator_/    │
│  → local cache    │──────▶ │ (deterministic,  │─────▶ │ business_profiles   │
│  → pool upload    │        │  no PII input)   │       │ + profiles          │
└───────────────────┘        └──────────────────┘       └─────────────────────┘
      faces/NNNN.jpg              pure function              idempotent upsert
```

### 4.1 The pool (durable, shared)

Faces are uploaded **once** to a durable prefix and shared by reference:

```
profile-assets/synthetic/faces/0000.jpg … <poolSize-1>.jpg   (uploaded as service-role)
profile-assets/synthetic/logos/0000.png … <logoCount-1>.png
```

`avatar_url` points **directly at a pool object**. No per-user copy is created.

This is the main departure from the existing seeder, and it buys:
- **No duplicated bytes** — 1,500 objects instead of 1,500 copies of the same 1,500 images.
- **Teardown has nothing per-user to clean.** The URL dies with the row. The PR #340 failure mode (a
  marketplace teardown that missed its storage objects) cannot recur for avatars, because avatars
  never become per-user objects.
- **Re-seeding is free.** Purge the cohort, re-seed, re-assign — the pool is still there.

The pool is an explicitly **durable asset library**, not user data: `purge_synthetic_marketplace_cohort()`
does **not** touch it. It gets its own separate, deliberate cleanup command (§4.5).

### 4.2 Generation (`sim/avatars/generate.ts`)

- Calls OpenAI's image API at 1024×1024, lowest quality tier — avatars render at 40–64 px in the
  browse grid, so quality above that tier is spend with no visible return.
- **The model is a config value, not a hardcoded string:** `SIM_IMAGE_MODEL`, defaulting to the
  current generation image model at implementation time. It must **not** be pinned to `gpt-image-1`,
  which OpenAI retires on 2026-10-23. The implementer verifies the available model against OpenAI's
  live model list before the first paid run, and records the chosen model in the run manifest so a
  later pool top-up can match it.
- **Prompt varies across a demographic matrix** (age band, gender presentation, skin tone, hair,
  build, setting, lighting) so the pool looks like a real US creator population across 24 cities.
- **Faces are never matched to a profile's name, city, or any other attribute.** Assignment is by
  id hash only (§4.3). Inferring ethnicity from a surname is both unreliable and wrong; the pool is
  varied and the mapping is blind.
- Prompts explicitly exclude resemblance to real or public figures.
- Writes each image to a **gitignored local cache** (`sim/.avatar-cache/`) before upload, so a bucket
  wipe or a failed upload never means paying to generate again.
- **Checkpointed and resumable**: a JSON manifest records each index → cache path → uploaded flag.
  Re-running skips completed work. A crash at image 900 costs nothing.
- Bounded concurrency (default 4) with retry + exponential backoff on 429/5xx. A hard `--limit` and a
  `--dry-run` that generates nothing and prints the cost estimate.

**Refusals are expected and handled.** Image APIs intermittently refuse person prompts. A refusal is
logged, skipped, and retried once with the next prompt variant; the run continues. The pool may
legitimately end at 1,480 rather than 1,500 — assignment (§4.3) does not require pool size to equal
profile count.

### 4.3 Assignment (`sim/avatars/assign.ts` — pure, no I/O)

```ts
poolIndex(userId: string, poolSize: number): number   // stable hash → [0, poolSize)
```

Deterministic, so re-running produces identical assignments and the operation is idempotent. Inputs
are the user id and the pool size — **never** a name, location, or any profile attribute. If the pool
is smaller than the cohort, faces repeat; at 1,500 faces for 1,500 creators the mapping is
effectively 1:1, and the spec accepts incidental collisions rather than adding a scarce-resource
allocator.

### 4.4 Application (`sim/avatars/apply.ts`)

Runs as **service-role** (the depth lane never authenticates, so the existing as-the-bot upload path
cannot reach it). For each synthetic creator/business:

- creators → `creator_profiles.avatar_url` **and** `profiles.avatar_url`
- businesses → `business_profiles.logo_url` **and** `profiles.avatar_url`
- scoped strictly to ids present in `synthetic_users` — the query is anchored on the registry, so a
  real user cannot be touched even by a malformed filter
- chunked at **100 ids per request** — mandatory, see [[Supabase .in() Header Overflow]]; a 1,500-id
  `.in()` is exactly the 16 KB header bomb that broke the 20-shard seed
- idempotent: re-running rewrites the same URLs

**The 24 existing placeholders are repaired in the same pass** — repointed at pool objects, and their
160-byte `<uid>/avatar.jpg` objects deleted. `portfolio_urls` on those 16 creators is **cleared to
empty** rather than left pointing at a headshot: a "portfolio" containing one 160-byte square is
worse than an honest empty state, and portfolio imagery is out of scope.

### 4.5 Cleanup (`sim/avatars/purge.ts`)

A separate, explicit command that deletes the pool prefixes and nulls the columns it set (registry-
scoped). Not wired into `purge_synthetic_marketplace_cohort()` — the pool deliberately survives a
cohort purge so re-seeding stays free. Storage deletion must go through the `storage.allow_delete_query`
path (PR #340's lesson).

## 5. Business logos

A human face is the wrong image for a restaurant. Logos are **generated locally at zero cost**: a
monogram mark (1–2 initials from the business name) on a deterministic brand-palette background
(`dc-teal` / `dc-pink` / `dc-teal-btn`), varied by id hash.

Implementation note: the `profile-assets` bucket's `allowed_mime_types` are
`image/jpeg|png|webp|gif` + video — **`image/svg+xml` is not allowed**, so an SVG upload is rejected
at the API. Logos are therefore emitted as **PNG** via a small hand-rolled encoder over `node:zlib`
(no new dependency; ~60 lines; deterministic output). This is directly unit-testable: assert the PNG
signature, the IHDR dimensions, and that the pixel data round-trips through inflate.

## 6. Cost

| Item | Count | Unit | Total |
|-|-|-|-|
| Faces (low quality, 1024²) | ~1,500 | ~$0.011 | **~$17** |
| Logos (local PNG) | 509 | $0 | $0 |
| Re-seed after a purge | — | $0 | **$0** (pool persists) |

Storage: ~1,500 × ~120 KB ≈ **180 MB** in a bucket that already exists.

**This spend is seed capex, not Donny runtime**, so it is deliberately **not** written to
`donny_cost_ledger` — that ledger is the source of truth for the ≤15%-of-revenue AI kill-switch, and
polluting it with a one-off seeding charge would trip the `ai-cost-vs-cap` verdict against a cost the
cap was never meant to govern. The spend is recorded here and in `SHIPPED_LOG.md` instead.

## 7. Testing

Pure units get real tests; the paid and networked edges are kept thin and injected.

- `poolIndex` — determinism, range, distribution across 1,500 ids, stability when pool size changes.
- PNG encoder — signature, IHDR dimensions, inflate round-trip, deterministic bytes for a given seed.
- Monogram derivation — initials from multi-word / single-word / punctuation-heavy / non-ASCII names.
- `apply` — chunking at 100 (asserting the built URL stays under 16 KB, per the header-overflow
  lesson), registry scoping, idempotent re-run, and that a non-synthetic id is never included.
- Generation is **injected** (`generateImage: (prompt) => Promise<Uint8Array>`), so the batch loop,
  checkpointing, resume, and refusal-handling are tested against a fake with zero API spend.

Verification on prod after the run: counts of non-null avatar columns; a spot-check that objects are
> 20 KB (the placeholder was 160 bytes, so byte size is the honest discriminator); and a both-viewport
screenshot of Find Creators.

## 8. Risks

| Risk | Mitigation |
|-|-|
| Real businesses believe these creators exist and try to hire them | Accepted by the founder (§3.1). Rows stay `is_synthetic` and metric-excluded. Generated images retain their C2PA provenance metadata. |
| Image API refuses person prompts | Skip + one retry with the next variant; pool size is allowed to land short (§4.2). |
| Spend overrun | `--dry-run` cost estimate, hard `--limit`, local cache so a re-run never re-pays. |
| A malformed filter touches real users | Every write is anchored on `synthetic_users`; `apply` tests assert a non-synthetic id is never in the update set. |
| Orphaned storage on teardown | Structurally impossible for avatars — no per-user objects exist. The pool has its own explicit purge. |

## 9. Rollback

`sim/avatars/purge.ts` nulls the columns and deletes the pool prefixes, returning the cohort to its
current state. No migration, no schema change, no deployed function — so there is nothing to roll
back beyond data the script itself wrote.

## 10. Open questions

None blocking. Deferred by decision: portfolio/work-sample imagery for the 1,500 creators.
