# DragonCandy AIOS — One-click "Open wiki PR" for applied corrections

> Status: Design (approved 2026-06-18)
> Surface: internal.dragoncandy.io (AIOS), `/internal/corrections`
> Builds on: [Donny Gated Corrections](2026-06-17-donny-aios-corrections-design.md), [DragonCandy AIOS](2026-06-11-dragoncandy-aios-design.md)

## 1. Context & Problem

Approving a strategy-doc correction in `/internal/corrections` updates the in-app
copy (`internal_docs.content_md`) immediately, but the canonical source — the wiki
markdown file in the git repo (`docs/wiki/{concepts,entities,analyses}/…`) — is
untouched. The next `donny-knowledge-sync` reads the **stale** wiki file and
upserts it back over `internal_docs.content_md`, silently reverting the
correction. The current "Commit to the wiki" panel is named as an *instruction*: it
hands the founder the corrected markdown (Copy / Export-to-Drive) and relies on a
human (or a Claude Code `knowledge-sync` session) to commit the file by hand. In
the field a founder expected an actual button there and found none.

The corrections spec deliberately deferred this ("**No git automation.** Donny
cannot commit to the wiki; strategy-doc durability is a founder action"). This
design **reverses that one Non-Goal**, narrowly: a founder-clicked, admin-gated
button that opens a **pull request** with the corrected wiki file. It is a PR
(never a push to `main`), so the wiki edit still flows through the normal review /
Codex gate before it becomes the source of truth.

## 2. Goals

- A button in the corrections UI that, for an **applied strategy-doc** correction,
  opens a PR writing the corrected markdown to its `docs/wiki/…` file.
- The PR carries Donny's `rationale_md` as its body, so a reviewer sees why.
- **Human-gated and admin-only**, matching the existing approve gate. No auto-merge,
  no direct `main` push.
- **Idempotent**: a correction that already has an open PR shows/returns that PR
  rather than opening a second one.
- The corrected wiki file is **well-formed** — frontmatter preserved even if the
  proposed markdown omitted it.
- Graceful degradation when the GitHub token is not yet configured (clear hint,
  not an error wall) — mirrors the existing "Connect Google to export" fallback.
- The commit option is reachable beyond the few seconds the post-approval panel is
  open: it also appears on **already-applied strategy-doc cards**.

## 3. Non-Goals

- **No auto-merge and no commit-to-`main`.** Output is always a PR.
- **No commit path for `dashboard_setting` corrections** — those have no wiki file.
- **No general wiki/file editor.** Only the exact file named by an applied
  strategy-doc correction's `target_ref`, and only with that correction's
  `proposed_value` as content.
- **No change to how Donny proposes** or to the apply RPC. This is a post-apply
  durability step layered on top of the existing flow.
- **No client-supplied path or content.** The function re-derives both server-side
  from the correction row (preserves the "no fabricated content" discipline).

## 4. Design

### 4.1 External prerequisite (founder action)

A **fine-grained GitHub Personal Access Token**, scoped to *only* the repo
`Pdiamondz1/dragoncandy-v3-d783432b`, with permissions **Contents: Read/Write** and
**Pull Requests: Read/Write**, stored as the edge-function secret
`GITHUB_WIKI_TOKEN`. Until it exists the function returns a typed
`github_not_configured` response and the UI shows a one-line "Add `GITHUB_WIKI_TOKEN`
to enable" hint. (Same gotcha class as the GCP consent-screen / Sheets-API
prerequisites — recorded so it is not rediscovered later.)

Repo coordinates are configuration, not hardcoded business logic: `GITHUB_WIKI_REPO`
(default `Pdiamondz1/dragoncandy-v3-d783432b`) and `GITHUB_WIKI_BASE` (default `main`)
are read from env with those fallbacks.

### 4.2 Schema — additive only

Three nullable columns on `aios_corrections` (no RLS change; the table is already
admin-only SELECT, no authenticated UPDATE/INSERT — these are written only by the
new edge function via service role):

| Column | Type | Notes |
|---|---|---|
| `wiki_pr_url` | text | PR html_url, null until committed |
| `wiki_pr_number` | int | PR number |
| `wiki_committed_at` | timestamptz | when the PR was opened |

### 4.3 Edge function — `wiki-commit-pr`

- **Auth.** Caller JWT → `auth.getUser()`; load `user_roles`; require role `admin`
  (same gate as `aios_corrections_apply`; the page is already admin-only). 401 if no
  user, 403 if not admin.
- **Input.** `{ correction_id: uuid }` **only**. The function re-reads the
  `aios_corrections` row server-side (service role) and uses its `target_ref` (path)
  and `proposed_value` (corrected markdown). The client never supplies path or
  content.
- **Validation / guards (in order).**
  1. Row exists, `status='applied'`, `target_type='strategy_doc'` — else 400.
  2. `wiki_pr_url` already set → return `{ already: true, url, number }` (idempotent;
     no second PR).
  3. `target_ref` must match `^docs/wiki/(concepts|entities|analyses)/[^?*:|"<>]+\.md$`
     after normalization, with no `..` segment — else 400 (`invalid_path`). This is the
     same in-scope set `donny-knowledge-sync` syncs, so only files that can actually
     round-trip are committable.
- **Frontmatter safety (byte-exact when possible).** If `proposed_value` already has
  a leading `---\n…\n---` block, commit it **verbatim** — no `updated:` rewrite — so
  the committed file is byte-identical to the in-app `internal_docs.content_md`. This
  is what makes the §7 durability claim exact: after merge + sync, the re-read file
  equals the in-app copy with no drift. Only the malformed case is repaired: if
  `proposed_value` lacks frontmatter but the existing repo file has one, prepend the
  existing file's frontmatter (no `updated:` change) so the page stays well-formed.
  Body-only corrections never strip a page's metadata. (Keeping `updated:` in sync with
  reality is deferred to the normal `knowledge-sync` discipline, not done here.)
- **GitHub flow** (REST API, `Authorization: Bearer $GITHUB_WIKI_TOKEN`,
  `Accept: application/vnd.github+json`):
  1. `GET /repos/{repo}/git/ref/heads/{base}` → base head SHA.
  2. `POST /repos/{repo}/git/refs` → create branch `donny-wiki-correction/<short-id>`
     (`<short-id>` = first 8 chars of `correction_id`; if the ref already exists, reuse
     it — keeps retries idempotent).
  3. `GET /repos/{repo}/contents/{path}?ref={branch}` → existing file SHA, fetched
     against the **branch** (not base) so a reused branch's already-modified file PUTs
     cleanly (404 ⇒ new file, no SHA).
  4. `PUT /repos/{repo}/contents/{path}` with base64 content, the step-3 branch SHA (if
     any), `branch`, and commit message
     `fix(wiki): correction — {title} (#correction <short-id>)`.
  5. `POST /repos/{repo}/pulls` → title `Wiki correction: {title}`, head `branch`,
     base `{base}`, body = `rationale_md` + a footer line linking the correction id and
     `/internal/corrections`.
  6. Persist `wiki_pr_url`, `wiki_pr_number`, `wiki_committed_at` back onto the row;
     return `{ url, number }`.
- **Errors.** Missing token → `{ error: 'github_not_configured' }` (typed, surfaced as
  the UI hint). GitHub API failures return the status + a trimmed message; the row's
  `wiki_pr_*` columns are written **only after** the PR is actually created (step 6),
  so a failure at any earlier step leaves no partial state and the action is safely
  retryable. (Wiki pages are far below GitHub's ~1 MB Contents-API limit, so the
  blob/tree fallback is unnecessary; an oversize PUT just surfaces as a trimmed GitHub
  error with no row write.)

### 4.4 UI — `InternalCorrections.tsx` + a hook

- New hook `useCommitWikiPr` (mutation) calling `supabase.functions.invoke('wiki-commit-pr', { body: { correction_id } })`; on success invalidates `['aios','corrections']` so cards pick up the persisted PR link.
- `CommitTarget` gains `id` (the correction id) so the panel can call the function.
- **`CommitToWikiPanel`**: add a **primary "Open wiki PR"** button, ordered before
  Copy markdown / Export-to-Drive. States: idle → "Opening PR…" → "View PR ↗"
  (anchor to `wiki_pr_url`, opens in a new tab). The button is **disabled while the
  mutation is pending** (closes the double-click → double-PR window before the first
  row write lands). On `github_not_configured`, render a muted one-line hint instead of
  a toast error.
- **Applied strategy-doc cards** (visible under the "All" filter): show the same
  "Open wiki PR" action when `status='applied'` and `target_type='strategy_doc'`;
  if `wiki_pr_url` is set, show "View PR ↗" instead. This is the durability path for
  corrections committed after the transient post-approval panel is gone.
- States covered: idle, pending, success (PR link), `github_not_configured` hint,
  generic error toast.

## 5. Security Considerations

- **PR-only, human-clicked, admin-gated.** No auto-merge, no `main` push; the edge
  function enforces `admin` server-side, independent of the (also admin-only) RLS on
  the page. The wiki edit still passes the normal review/Codex gate before merge.
- **No client-trusted content or path.** Path and markdown are re-derived from the
  correction row server-side; the client sends only an id. Path is regex- and
  traversal-validated against the synced wiki subdirs.
- **Least-privilege token.** Fine-grained PAT scoped to one repo, Contents +
  Pull Requests only; stored as an edge secret, never in the bundle, never returned to
  the client.
- **Idempotent.** A correction with a stored `wiki_pr_url` cannot open a second PR;
  branch creation tolerates an existing ref.
- **Additive schema, unchanged RLS.** New columns are service-role-write only, like
  the rest of the row's lifecycle fields.
- **Choke-point spirit preserved.** This is a *human* action on already-applied,
  already-approved data — Donny still never writes to the repo.

## 6. Build Slices (one per PR, build → verify → push)

| # | Slice | Backend | Frontend | Gate |
|---|---|---|---|---|
| 1 | Schema | `aios_corrections` + `wiki_pr_url/number/committed_at` (nullable); regenerate types | — | apply migration to prod before dependent code; advisors clean |
| 2 | Edge function | `wiki-commit-pr` (admin auth, server-derived path/content, frontmatter safety, GitHub Contents+Pulls, idempotent) | — | **Codex gate** (auth + path validation + token handling); deployed separately; `github_not_configured` path returns cleanly with no secret set |
| 3 | UI | — | `useCommitWikiPr`, `CommitTarget.id`, "Open wiki PR" button in panel + on applied strategy-doc cards | approve strategy-doc → Open wiki PR → real PR appears on GitHub with rationale body |

## 7. Verification

- **End-to-end:** approve a strategy-doc correction → "Open wiki PR" → a PR exists on
  `Pdiamondz1/dragoncandy-v3-d783432b` with the corrected file diff and `rationale_md`
  in the body; the card shows "View PR ↗"; clicking again does not open a second PR.
- **Frontmatter:** a body-only `proposed_value` against a page that has frontmatter →
  the committed file keeps its frontmatter with `updated:` bumped.
- **No token:** with `GITHUB_WIKI_TOKEN` unset, the button shows the "Add token" hint
  and writes nothing.
- **Auth:** a non-admin internal user (stakeholder) gets 403; anon/consumer cannot
  reach the function or the page.
- **Path guard:** a forged/out-of-scope `target_ref` (e.g. `docs/wiki/raw/...` or a
  `..` traversal) is rejected 400 and opens no PR.
- **Durability (the point):** after the PR merges and `refresh-main` runs, the wiki
  file matches the in-app correction, so the next `donny-knowledge-sync` no longer
  reverts it.
- Per slice: `npm run typecheck` + `npm run build` + vitest; edge fn deployed
  separately; prod verification (both viewports for the corrections page).

## 8. Deferred (explicitly out)

- Auto-merge or direct-to-`main` commits (always a PR).
- Wiki commits for `dashboard_setting` corrections (no file to write).
- A generic wiki/file editor or multi-file commits.
- Branch cleanup / PR status polling in the UI (GitHub owns PR lifecycle).
- **Re-opening after a closed/declined PR.** Once `wiki_pr_url` is set, the button
  shows "View PR ↗" permanently — even if that PR was closed unmerged. Re-committing a
  closed correction is out of scope for v1 (consistent with "GitHub owns PR
  lifecycle"); the recovery path is to re-propose via Donny, which yields a fresh
  correction row with no stored PR.
- Donny opening the PR itself (this stays a human action).
