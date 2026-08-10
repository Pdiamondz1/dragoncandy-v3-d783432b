# 2026-08-10 — a user could choose the CTA link inside our transactional emails (#442)

Immutable session source. Third in the day's notification-authorization chain (#419 → #440 → #442).

## The defect class

Every `href` in `send-notification-email`'s ~30 templates was built from caller-supplied `data`,
and none of it was checked. The reachability is the part worth internalising:

> `create-notification` spreads the caller's request body **verbatim** into the payload it sends
> `send-notification-email`, and calls it with the **service key**. So a user-authenticated caller
> reaches those templates, and the function's own "recipient must be self" 403 — which exists
> precisely to stop cross-user mail — **does not apply to the resulting message.**

Two defects followed:

- **whole-URL fields** (`actionUrl`, `campaignUrl`, `reviewUrl`) went into `href` raw → the CTA of
  a genuine DragonCandy email could point at an attacker's site or a `javascript:` scheme;
- **id fields** (`campaignId`, `projectId`, `collaborationId`) were concatenated into a path → a
  `"` closed the attribute and let the caller write arbitrary markup into the message body.

This is the same structural observation as [[Notification Delivery]]'s existing note that the
documented path *around* the self-only gate had no gate of its own. The gate was documented
accurately; the door beside it was open twice.

## Provenance — cherry-picked, not merged

Both commits were authored by a **parallel session on 2026-08-09** and left on
`fix/notification-email-href-injection` with **no PR** for a day. Cherry-picked onto current
`main` rather than merged, because the branch predated the `.io`→`.com` migration **in this same
file**: branch had 4 `.io` / 0 `.com`, main had 1 `.io` / 2 `.com`. A straight merge would have
risked silently reintroducing `.io` on the hunks the branch touched — git resolves per hunk, and
the branch had rewritten large regions.

Verified after the cherry-pick: both `.com` emblem `<img>` intact, and `from:` still
`alerts@notify.dragoncandy.io` — which is **correct**, since Phase 5b is blocked on the $20/mo
Resend decision.

> **Durable process note:** a parallel session's branch is not a merge candidate just because it
> exists. Check what has landed under it first — especially a cross-cutting migration.

## The fix

`_shared/emailLinks.ts` with `link` (a path *we* composed), `safeLink` (a path the *caller*
supplied, forced back onto our origin), `pathSegment` (an id safe in a path), `safeImageUrl`.

**`safeLink` discards the host rather than validating it** — it parses relative to our own origin
and keeps only `pathname + search + hash`. That is why it holds in every spelling at once:
absolute foreign host, protocol-relative `//host`, backslash `/\host`, userinfo
`https://ours@evil/`, `javascript:`/`data:`/`vbscript:`, CRLF (stripped by the WHATWG parser),
encoded traversal, and a `toString`-bearing object — the last rejected by a `typeof` check
**before** `new URL` can stringify it, which is the correct ordering and easy to get wrong.

> **Validation enumerates what is bad; discarding keeps only what is good.** A host that is never
> read cannot be smuggled.

29 tests assert **both** properties on every hostile input — stays-on-our-origin *and*
cannot-break-out — because fixing one without the other still leaves a usable injection.
Confirmed **collected by CI**, not merely runnable: the suite went 239 → 240 files.

## Two auth bugs fixed alongside

- **`"Bearer undefined"` promoted an unauthenticated caller to SERVICE.** `serviceKey` was read
  `as string` with no presence check, so an unset secret made the comparison
  `"Bearer undefined" === "Bearer undefined"` — true for anyone sending the one string an attacker
  would guess first. Service callers skip the same-inbox check entirely. **Confirmed real by
  reading the live v252 bundle**, which had the unguarded `as string` and no
  `"Server misconfiguration"` branch. Also catches the empty-string case, where a bare
  `Authorization: Bearer ` would have matched.
- **A check that failed open on the actor it could not identify.** `to && callerEmail && …` skipped
  the self-check entirely for a caller with no email on their auth record. Latent today (0 of 42
  auth users), but it opens the moment anonymous or phone sign-in is enabled — a GoTrue toggle, not
  a code change. Nothing legitimate is lost: a caller with no email has no own-inbox to send to.

## The regression the second commit exists to prevent

**Escaping must not change what renders.** `budget: 0` is a real value — crew campaigns are free and
carry a literal `0` — and the template guards with `data.budget ?`. A naive `?? ''` would have
started printing "💰 Budget: $0" on every free-campaign email. Handled with truthiness instead.

Money is **coerced, not escaped**, because two amounts sit in the **subject**, which is not markup:
`&amp;` renders literally there, and a CRLF is a header-injection primitive escaping does not touch.
That coercion also fixed a live crash — `data.amount.toFixed(2)` is typed `number` but arrives as
JSON, so a string amount threw and the email never sent.

## Review follow-ups

**Fixed:** `fileCount ?? 0` rendered "has uploaded **0 new files**" under an H1 reading "New
Deliverables!" — a *confident false statement*, worse than the obvious garbage it replaced; a
**set but unparseable** `APP_URL` silently stripped the deep link from every completion email while
the send still reported success (now warns, and is distinguished from the unset case, which is the
documented degraded mode); comment line-number refs had drifted and were replaced with **symbol**
refs rather than corrected, since numbers drift again.

**Verified, no change needed:** the preserved `search`/`hash` could in principle hop off-site via an
on-origin redirect sink — the only sink (`AuthPage`'s `returnTo`) already gates on
`ALLOWED_REDIRECT_ORIGINS`; `safeImageUrl` drops relative URLs — measured on prod, **0 of 10**
`dragonshare_posts` carry a relative `content_file_path` or `post_url`.

**Known, deliberately open:** `safeImageUrl` pins the *scheme* but not the *host*, because these
images legitimately live on Supabase storage. A creator-writable `post_url` could be a tracking
pixel — same class as #399's landing-clips pinning. Self-addressed today (recipient is the post
owner), so documented rather than fixed.

## Verification

- `data-exposure-reviewer` — **completeness sweep**: all 45 `href`/`src`/subject sinks enumerated,
  **zero** raw caller values remain. All findings `low`, each fixed or cleared with evidence.
- `edge-function-reviewer` **PASS** — full transitive `_shared` set is exactly 4 files, all upload;
  zero `esm.sh`; no unrelated drift (v252 already carried the post-#415 origins).
- **Codex clean.** typecheck, build clean; **240 files / 2410 tests** green.
- Deployed and boot-verified; all 5 assets uploaded including the new `emailLinks.ts`.

> **A probe that cannot distinguish is not evidence — again.** The post-deploy `Bearer undefined`
> curl returns 401, but it would have done so **before** the fix too, because the secret *is* set on
> prod so the comparison fails either way. What established the fix was reading the live bundle.
> Same lesson as the Phase-5a SMTP `RCPT TO` probe.
