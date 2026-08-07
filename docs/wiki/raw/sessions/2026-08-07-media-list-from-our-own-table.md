# Session — serving GET /media from our own table

Date: 2026-08-07
Branch: `fix/media-owned-pagination` (off `a25d9be4`)

A follow-up to the `/media` scoping work: closing the pagination limit that was
*recorded* rather than fixed when `/media` was first bound to its owner.

## The problem, and why two fixes failed before the third worked

`GET /media?limit&offset` paginates the **org-wide** pool. Ownership can only be
applied after the response arrives — so the page is chosen *before* ownership is
known. Everything downstream of that inherits the flaw:

1. **Filter one page.** A caller whose media sits behind other tenants' uploads
   receives a page of entirely foreign rows, all of which are stripped, and sees
   an **empty gallery** while their media exists.
2. **Scan pages until the window fills.** Better, but a hard scan cap makes media
   beyond it **permanently unreachable** — every request restarts at org offset 0
   and hits the same wall. Raising the cap only moves it.

Both also had to reconcile a provider-derived list against a locally-derived
total, which is a second source of drift.

Codex found **five successive defects** across those two attempts. That count is
the signal worth keeping: when review keeps finding a *different* problem in the
same place, the design is wrong rather than the code.

## The fix: the provider already gives us the record

`POST /media/{id}/confirm` returns `ConfirmUploadResponse`:

```
{ id, filename, url, content_type, size, status, created_at, expires_at }
```

That is **every field** the SDK's `MediaFile` carries, and that call already goes
through `outstand-proxy`. So the confirm step caches it, and `GET /media` is
answered from Postgres before any upstream call.

What that buys, in the order that matters:

- **No org list is read at all**, so the cross-tenant leak this path kept
  producing is *unreachable* rather than handled. There is no filter left to get
  wrong.
- The window is correct by construction — our own `ORDER BY` / `range` over the
  caller's rows. No empty page, no cap, nothing unreachable.
- The total is one exact count from the same table. Nothing to reconcile.
- No provider round trip for the list.

`confirmed_at IS NULL` is the gallery gate: a row minted at upload but never
confirmed is a **reservation, not a media file**, and has no url to render.

## SDK contract details that each would have shipped a broken gallery

Every one of these was found by review, and each looked correct in isolation:

- **`pagination.count` is consumed as the TOTAL.** `MediaList` computes
  `totalPages = Math.ceil((pagination?.count ?? 0) / pageSize)` — the opposite of
  the provider's own convention, where a `/posts` response carries `count: 5` for
  a 5-row page alongside `total: 49`. Emitting the honest reading makes a
  20-of-100 gallery display "20 files" and hide Next. **This will look like a bug
  to the next reader**; it is pinned by a test that computes exactly what
  `MediaList` computes.
- **Components read `contentType`, the wire format is `content_type`.**
  `MediaPreview` does `media.contentType?.startsWith("video/")`, and `uploadFile`
  maps `contentType: confirmedMedia.content_type` itself — so media arriving via
  upload carries camelCase while media from the list would not. Both spellings
  are now emitted.
- **`pagination` must exist at all.** `useMediaList` returns
  `pagination: data?.pagination ?? null`; omitting the block reported a populated
  gallery as 0 files and removed its page controls.
- **Field names must be the provider's, not our column names.** Serving
  `media_created_at` instead of `created_at` parses fine and renders blank.

## The migration guards itself

Existing bindings have no `confirmed_at`, so they would vanish from their owners'
galleries the moment the gallery gates on it. Verified zero on prod before
writing — but *"it was empty when I looked" is a fact about me, not a property of
the migration*. It now **stops and names the count** if rows exist at apply time,
forcing a conscious choice (backfill, or accept the loss) instead of silently
hiding somebody's media. That also keeps it correct while it sits unapplied.

## A pre-existing bug found by chasing a finding that did NOT hold

Codex claimed media uploaded via `social-proxy` would be permanently absent from
the gallery. It would not: `social-proxy` has **no confirm op**, so such an upload
must be confirmed through `outstand-proxy`, whose confirm handler keys on
`(outstand_media_id, user_id)` regardless of which gateway minted the binding.

But checking it surfaced a real one: `adapters/outstand.ts` posted
`{ filename, contentType, size }` to `/media/upload` when the wire field is
`content_type`. **That gateway has been uploading with no MIME type at all**, for
as long as it has existed. Unrelated to this branch; fixed here.

## Traps worth carrying

- **When review keeps finding a different defect in one place, question the
  design, not the code.** Five findings across two approaches was the signal; the
  third approach removed the whole class.
- **A .d.ts parameter name is not the wire format.** This bit twice in one night —
  `contentType` vs `content_type` in `outstand-proxy`'s allow-list, and again in
  the `social-proxy` adapter. Read the bundle.
- **Where two conventions disagree, serve what actually renders** — and write down
  why at the call site, or the next reader will "fix" it back.
- **Dismissing a review finding requires the same evidence as accepting one.**
  The social-proxy dismissal is recorded with its reasoning; a dismissal nobody
  can audit is indistinguishable from an oversight.
