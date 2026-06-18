# One-click "Open wiki PR" for applied corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-gated button on `/internal/corrections` that opens a GitHub pull request committing an approved strategy-doc correction back to its `docs/wiki/…` source file, so the fix survives the next `donny-knowledge-sync`.

**Architecture:** Three additive `aios_corrections` columns store the resulting PR; a new service-side Deno edge function `wiki-commit-pr` (admin JWT gate, server-derived path/content, GitHub Contents+Pulls REST) opens the PR idempotently; the corrections UI gains an "Open wiki PR" button wired through a `useCommitWikiPr` mutation hook. Always a PR, never a `main` push.

**Tech Stack:** Supabase Postgres + RLS, Supabase Deno edge functions, GitHub REST API (Contents + Pulls), React 18 + TypeScript, React Query, Tailwind (`dc-*` tokens), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-18-wiki-commit-pr-design.md`

---

## Context the implementer must know

- **Ground-truth schema** (`supabase/migrations/20260617120000_aios_corrections.sql`): `aios_corrections` has `id, target_type ('dashboard_setting'|'strategy_doc'), target_ref, title, rationale_md, current_value jsonb, proposed_value jsonb, status ('proposed'|'approved'|'rejected'|'applied'|'superseded'), …`. RLS: **admin-only SELECT**, no authenticated INSERT/UPDATE/DELETE. The page and the apply RPC are already admin-only.
- For a `strategy_doc` correction, **`target_ref` is the full repo-relative path** (e.g. `docs/wiki/concepts/self-improving-app.md`) and **`proposed_value` is a JSON string** holding the full corrected markdown (frontmatter + body). Read via supabase-js it deserializes to a plain JS `string`.
- **Admin-auth pattern for a user-invoked edge function** (`supabase/functions/google-workspace-proxy/index.ts:122-138`): build a user client from the caller's `Authorization` header → `auth.getUser()` → 401 if no user → load `user_roles` with the service client → 403 unless a row has role `admin`.
- **Service-side edge scaffold** (`supabase/functions/aios-report-ingest/index.ts:19-24`, `donny-knowledge-sync/index.ts:36-49`): `serve()` from `std@0.168.0/http/server.ts`, `createClient` from `esm.sh/@supabase/supabase-js@2`, `corsHeaders(req)` from `../_shared/cors.ts`, a local `json(body, status)` helper, `Deno.env.get(...)`.
- **Frontend hook pattern** (`src/hooks/internal/useGoogleWorkspace.ts:14-34`): a `callProxy`-style `fetch` to `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/<fn>` with `Authorization: Bearer <session.access_token>` + `apikey: VITE_SUPABASE_ANON_KEY`; React Query mutation wrapping it; invalidate `['aios','corrections']` on success.
- **Existing UI** (`src/pages/internal/InternalCorrections.tsx`): `CommitTarget` (`wikiPath/markdown/title`), `CommitToWikiPanel`, `CorrectionCard`. The panel already renders Copy / Export-to-Drive / Open-doc. Dark "ops-deck" theme — white text on translucent panels, `dc-teal` primary, `dc-pink` secondary, pill buttons.
- **Edge functions are deployed separately** from the frontend (Lovable deploys frontend only). Donny-style functions ship without Deno unit tests; this repo has **no Deno test runner**, so the edge function is verified by integration (curl/console) + the Codex gate, matching how `aios-report-ingest` / `donny-knowledge-sync` shipped. Frontend logic is tested with Vitest where it's pure.
- **Deploy ordering** (project memory): apply the prod migration **before** deploying the edge function and merging the frontend.
- **`types.ts`** (`src/integrations/supabase/types.ts`) is the generated DB types file; the three new columns need a surgical add to the `aios_corrections` Row/Insert/Update so the hook typechecks. Edge functions are not in `types.ts`.

---

## File Structure

- **Create** `supabase/migrations/20260618120000_aios_corrections_wiki_pr.sql` — three nullable columns.
- **Create** `supabase/functions/wiki-commit-pr/index.ts` — the admin-gated PR function (auth, path guard, frontmatter merge, GitHub flow, idempotent row write). Pure helpers `validateWikiPath` and `ensureFrontmatter` live at the top of this file (kept inline; no Deno test runner exists to justify a separate module).
- **Modify** `src/integrations/supabase/types.ts` — add `wiki_pr_url/number/committed_at` to `aios_corrections`.
- **Modify** `src/hooks/internal/useCorrections.ts` — add `wiki_pr_url/number/committed_at` to the `Correction` interface + the SELECT list; add `useCommitWikiPr`.
- **Modify** `src/pages/internal/InternalCorrections.tsx` — `CommitTarget` gains `id`; "Open wiki PR" button in `CommitToWikiPanel`; a `WikiPrButton` reused on applied strategy-doc cards.
- **Create** `src/lib/internal/wikiCommit.test.ts` — Vitest for the one pure frontend helper (`commitErrorMessage` mapping `github_not_configured` → hint).

---

## Task 1: Schema — PR-tracking columns

**Files:**
- Create: `supabase/migrations/20260618120000_aios_corrections_wiki_pr.sql`
- Modify: `src/integrations/supabase/types.ts` (aios_corrections Row/Insert/Update)

- [ ] **Step 1: Write the migration**

```sql
-- Wiki-commit PR tracking for applied strategy-doc corrections. Additive only.
-- Written exclusively by the service-role wiki-commit-pr edge function; no RLS
-- change (aios_corrections stays admin-only SELECT, no authenticated writes).
alter table public.aios_corrections
  add column if not exists wiki_pr_url text,
  add column if not exists wiki_pr_number integer,
  add column if not exists wiki_committed_at timestamptz;
```

- [ ] **Step 2: Apply to the staging project, then prod**

Apply via the Supabase MCP `apply_migration` (name `aios_corrections_wiki_pr`) to **staging** (`mhffqrawgizhprbobcta`) first, then **prod** (`zocahiffooqdybdhguqv`). Migration must precede the edge-function deploy and frontend merge.
Expected: success; `select column_name from information_schema.columns where table_name='aios_corrections' and column_name like 'wiki_%';` returns all three.

- [ ] **Step 3: Run advisors**

Run the Supabase MCP `get_advisors` (type `security`) on both projects.
Expected: no new advisories introduced by this change (additive nullable columns on an already-RLS'd table).

- [ ] **Step 4: Surgically add the columns to `types.ts`**

In `src/integrations/supabase/types.ts`, find the `aios_corrections` table block and add to its `Row`, `Insert`, and `Update` shapes:

```ts
          wiki_committed_at: string | null
          wiki_pr_number: number | null
          wiki_pr_url: string | null
```

(Match the alphabetical ordering and `| null` convention already used for `applied_at`, `reviewed_at`, etc. In `Insert`/`Update` they are optional: `wiki_pr_url?: string | null`.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS (no usages yet; this only proves the types edit is well-formed).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260618120000_aios_corrections_wiki_pr.sql src/integrations/supabase/types.ts
git commit -m "feat(aios): aios_corrections wiki-PR tracking columns"
```

---

## Task 2: Edge function `wiki-commit-pr`

**Files:**
- Create: `supabase/functions/wiki-commit-pr/index.ts`

No Vitest here (no Deno test runner in-repo). Verification is integration + Codex. Build the whole function, then verify each guard with a crafted request.

- [ ] **Step 1: Write the function**

Create `supabase/functions/wiki-commit-pr/index.ts`:

```ts
// wiki-commit-pr
// Admin-clicked, human-gated durability step for APPLIED strategy-doc
// corrections: opens a GitHub PR writing the corrected markdown back to its
// docs/wiki/ source file, so the next donny-knowledge-sync stops reverting it.
//
// - PR-only. Never pushes to the base branch. Never auto-merges.
// - Trusts only { correction_id }; re-derives path + content server-side from
//   the aios_corrections row (no client-forged paths or content).
// - Idempotent: a row with wiki_pr_url already set returns that PR.
// - github_not_configured (no token) is a typed, graceful response.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_WIKI_TOKEN") ?? "";
const REPO = Deno.env.get("GITHUB_WIKI_REPO") ?? "Pdiamondz1/dragoncandy-v3-d783432b";
const BASE = Deno.env.get("GITHUB_WIKI_BASE") ?? "main";

const GH = "https://api.github.com";
// Only files donny-knowledge-sync actually round-trips are committable.
const WIKI_PATH_RE = /^docs\/wiki\/(concepts|entities|analyses)\/[A-Za-z0-9._\-/]+\.md$/;

/** True only for an in-scope, traversal-free wiki markdown path. */
function validateWikiPath(path: string): boolean {
  if (typeof path !== "string" || path.includes("..")) return false;
  return WIKI_PATH_RE.test(path);
}

/**
 * Keep the committed page well-formed. If the proposal already carries a
 * frontmatter block, commit it verbatim (byte-exact with internal_docs). Only
 * the malformed case is repaired: a body-only proposal inherits the existing
 * file's frontmatter so metadata isn't stripped.
 */
function ensureFrontmatter(proposed: string, existing: string | null): string {
  const hasFm = (s: string) => /^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(s);
  if (hasFm(proposed) || !existing) return proposed;
  const m = existing.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)/);
  return m ? m[1] + proposed : proposed;
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "dragoncandy-wiki-commit",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// btoa needs binary string; encode UTF-8 first so non-ASCII markdown survives.
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  // --- Admin auth (same gate as aios_corrections_apply) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
    return json({ error: "forbidden: admin only" }, 403);
  }

  // --- Input: correction_id only ---
  let correctionId: string;
  try {
    correctionId = (await req.json()).correction_id;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (typeof correctionId !== "string" || !correctionId) {
    return json({ error: "correction_id is required" }, 400);
  }

  const { data: c, error: cErr } = await admin
    .from("aios_corrections")
    .select("id, target_type, target_ref, title, rationale_md, proposed_value, status, wiki_pr_url, wiki_pr_number")
    .eq("id", correctionId)
    .maybeSingle();
  if (cErr) return json({ error: "lookup failed" }, 500);
  if (!c) return json({ error: "correction not found" }, 404);
  if (c.status !== "applied" || c.target_type !== "strategy_doc") {
    return json({ error: "only applied strategy-doc corrections can be committed" }, 400);
  }
  if (c.wiki_pr_url) {
    return json({ already: true, url: c.wiki_pr_url, number: c.wiki_pr_number });
  }
  const path = c.target_ref as string;
  if (!validateWikiPath(path)) return json({ error: "invalid_path" }, 400);

  // proposed_value is a jsonb string → a JS string here.
  const proposed = typeof c.proposed_value === "string" ? c.proposed_value : "";
  if (!proposed.trim()) return json({ error: "empty corrected content" }, 400);

  // Token last, so auth/validation errors surface before the config hint.
  if (!GITHUB_TOKEN) return json({ error: "github_not_configured" }, 200);

  try {
    // 1. base head SHA
    const refRes = await fetch(`${GH}/repos/${REPO}/git/ref/heads/${BASE}`, { headers: ghHeaders() });
    if (!refRes.ok) return json({ error: `github base ref ${refRes.status}` }, 502);
    const baseSha = (await refRes.json()).object.sha;

    // 2. branch (reuse if it already exists → retry-safe)
    const branch = `donny-wiki-correction/${correctionId.slice(0, 8)}`;
    const brRes = await fetch(`${GH}/repos/${REPO}/git/refs`, {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });
    if (!brRes.ok && brRes.status !== 422) {
      return json({ error: `github branch ${brRes.status}` }, 502);
    }

    // 3. existing file SHA + content, fetched against the BRANCH (not base) so a
    //    reused branch's already-modified file PUTs cleanly.
    const getRes = await fetch(
      `${GH}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders() },
    );
    let existingSha: string | undefined;
    let existingMd: string | null = null;
    if (getRes.ok) {
      const f = await getRes.json();
      existingSha = f.sha;
      existingMd = new TextDecoder().decode(
        Uint8Array.from(atob(f.content.replace(/\n/g, "")), (ch) => ch.charCodeAt(0)),
      );
    } else if (getRes.status !== 404) {
      return json({ error: `github get-contents ${getRes.status}` }, 502);
    }

    const content = ensureFrontmatter(proposed, existingMd);

    // 4. PUT file
    const putRes = await fetch(`${GH}/repos/${REPO}/contents/${path}`, {
      method: "PUT",
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `fix(wiki): correction — ${c.title} (#correction ${correctionId.slice(0, 8)})`,
        content: toBase64(content),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
    if (!putRes.ok) return json({ error: `github put ${putRes.status}` }, 502);

    // 5. PR
    const prRes = await fetch(`${GH}/repos/${REPO}/pulls`, {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({
        title: `Wiki correction: ${c.title}`,
        head: branch,
        base: BASE,
        body: `${c.rationale_md}\n\n---\nApplied correction \`${correctionId}\` — review at /internal/corrections.`,
      }),
    });
    if (!prRes.ok) return json({ error: `github pr ${prRes.status}` }, 502);
    const pr = await prRes.json();

    // 6. Persist ONLY after the PR exists (no partial state on earlier failure).
    await admin
      .from("aios_corrections")
      .update({
        wiki_pr_url: pr.html_url,
        wiki_pr_number: pr.number,
        wiki_committed_at: new Date().toISOString(),
      })
      .eq("id", correctionId);

    return json({ url: pr.html_url, number: pr.number });
  } catch (e) {
    return json({ error: `commit failed: ${(e as Error).message}` }, 502);
  }
});
```

- [ ] **Step 2: Deploy to staging**

Deploy via the Supabase MCP `deploy_edge_function` to staging (`mhffqrawgizhprbobcta`). Bundle `index.ts` + the transitive `_shared/cors.ts` (per the MCP-bundling gotcha — a missing shared file silently keeps the old version).
Expected: deploy succeeds; function boots.

- [ ] **Step 3: Verify the auth + config guards (no token needed yet)**

With `GITHUB_WIKI_TOKEN` **unset** on staging, from the browser console while logged in as the admin staging user (`restaurant.staging@…` is not admin — use an admin account), invoke with a real applied strategy-doc correction id:
```js
await (await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wiki-commit-pr`, {
  method:'POST',
  headers:{Authorization:`Bearer ${(await window.supabase.auth.getSession()).data.session.access_token}`,'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY},
  body:JSON.stringify({correction_id:'<applied-strategy-doc-id>'})})).json()
```
Expected: `{ error: "github_not_configured" }`. A bogus id → `correction not found`. A `dashboard_setting` id → the "only applied strategy-doc" 400. An out-of-scope `target_ref` (test by temporarily pointing at a seeded row) → `invalid_path`.
(If `window.supabase` isn't exposed, run the same fetch from a tiny temporary button or use the hook added in Task 3 on a staging preview.)

- [ ] **Step 4: Set the token on staging and verify a real PR**

Set `GITHUB_WIKI_TOKEN` (fine-grained PAT, this repo, Contents R/W + Pull Requests R/W) as a staging function secret. Re-invoke with an applied strategy-doc id.
Expected: `{ url, number }`; a PR appears on `github.com/Pdiamondz1/dragoncandy-v3-d783432b` with the corrected file diff and `rationale_md` in the body; the `aios_corrections` row now has `wiki_pr_url`. Invoke again → `{ already: true, … }` (no second PR). Close the test PR + delete the branch afterward.

- [ ] **Step 5: Codex second review (required gate for this slice)**

Run from the worktree: `codex review --base main --title "wiki-commit-pr edge function"`. Focus areas to confirm Codex covers: admin gate cannot be bypassed, path validation rejects traversal/out-of-scope, token never returned to client, no partial row write on failure, idempotency. Fix any real findings and re-run until clean. Relay Codex's verdict.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/wiki-commit-pr/index.ts
git commit -m "feat(aios): wiki-commit-pr edge function (admin-gated PR for applied strategy-doc corrections)"
```

---

## Task 3: UI — hook + buttons

**Files:**
- Modify: `src/hooks/internal/useCorrections.ts`
- Modify: `src/pages/internal/InternalCorrections.tsx`
- Create: `src/lib/internal/wikiCommit.ts` + `src/lib/internal/wikiCommit.test.ts`

- [ ] **Step 1: Write the failing test for the error-message helper**

Create `src/lib/internal/wikiCommit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { commitErrorMessage } from './wikiCommit';

describe('commitErrorMessage', () => {
  it('maps the not-configured signal to a setup hint', () => {
    expect(commitErrorMessage('github_not_configured')).toMatch(/GITHUB_WIKI_TOKEN/);
  });
  it('passes other messages through unchanged', () => {
    expect(commitErrorMessage('github pr 502')).toBe('github pr 502');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/lib/internal/wikiCommit.test.ts`
Expected: FAIL — cannot resolve `./wikiCommit`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/internal/wikiCommit.ts`:

```ts
/** Turn a wiki-commit edge error into user-facing copy. */
export function commitErrorMessage(error: string): string {
  if (error === 'github_not_configured') {
    return 'Add GITHUB_WIKI_TOKEN to the edge function to enable wiki PRs.';
  }
  return error;
}
```

- [ ] **Step 4: Run the test; verify it passes**

Run: `npx vitest run src/lib/internal/wikiCommit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Extend `useCorrections.ts`**

Add to the `Correction` interface (after `applied_at`):
```ts
  wiki_pr_url: string | null;
  wiki_pr_number: number | null;
  wiki_committed_at: string | null;
```
Add the same three to the `.select('…')` string in `useCorrections`. Then add the mutation (mirrors `callProxy` in `useGoogleWorkspace.ts`):

```ts
export interface CommitPrResult {
  url?: string;
  number?: number;
  already?: boolean;
  error?: string;
}

/** Open (or fetch the existing) wiki PR for an applied strategy-doc correction. */
export function useCommitWikiPr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (correctionId: string): Promise<CommitPrResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wiki-commit-pr`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ correction_id: correctionId }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as CommitPrResult;
      // github_not_configured returns 200 with an error field — surface it as data,
      // not a throw, so the UI shows the hint instead of a toast.
      if (!res.ok && !data.error) throw new Error('Wiki PR request failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aios', 'corrections'] }),
  });
}
```

- [ ] **Step 6: Add `id` to `CommitTarget` and pass it through**

In `InternalCorrections.tsx`: add `id: string;` to the `CommitTarget` interface; in `handleReview`'s `onApplied({…})` call, add `id: correction.id`.

- [ ] **Step 7: Build the shared `WikiPrButton`**

Add to `InternalCorrections.tsx` (above `CommitToWikiPanel`). It owns the mutation, the three states, and the not-configured hint:

```tsx
import { useCommitWikiPr } from '@/hooks/internal/useCorrections';
import { commitErrorMessage } from '@/lib/internal/wikiCommit';
import { GitPullRequest } from 'lucide-react'; // add to the existing lucide import

const WikiPrButton = ({ correction }: { correction: { id: string; wiki_pr_url: string | null } }) => {
  const commit = useCommitWikiPr();
  const [hint, setHint] = useState<string | null>(null);
  const prUrl = commit.data?.url ?? correction.wiki_pr_url;

  if (prUrl) {
    return (
      <a
        href={prUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 rounded-full bg-dc-teal px-4 py-1.5 text-xs font-bold text-dc-dark transition-colors hover:bg-dc-teal/80"
      >
        <GitPullRequest className="h-3.5 w-3.5" /> View PR
      </a>
    );
  }

  const open = () =>
    commit.mutate(correction.id, {
      onSuccess: (res) => {
        if (res.error) setHint(commitErrorMessage(res.error));
        else if (res.url) toast.success(res.already ? 'PR already open.' : 'Wiki PR opened.');
      },
      onError: (e) => toast.error(`Couldn’t open PR — ${(e as Error)?.message ?? 'try again.'}`),
    });

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={open}
        disabled={commit.isPending}
        className="flex items-center gap-1.5 rounded-full bg-dc-teal px-4 py-1.5 text-xs font-bold text-dc-dark transition-colors hover:bg-dc-teal/80 disabled:opacity-50"
      >
        <GitPullRequest className="h-3.5 w-3.5" />
        {commit.isPending ? 'Opening PR…' : 'Open wiki PR'}
      </button>
      {hint && <span className="text-[0.7rem] text-white/50">{hint}</span>}
    </div>
  );
};
```

- [ ] **Step 8: Mount the button in the panel**

In `CommitToWikiPanel`, render `<WikiPrButton correction={{ id: target.id, wiki_pr_url: null }} />` as the **first** item in the `mt-3 flex … gap-2` button row (before Copy markdown). The panel is transient (just-approved), so it always starts with no PR.

- [ ] **Step 9: Mount the button on applied strategy-doc cards**

In `CorrectionCard`, when `correction.status === 'applied' && correction.target_type === 'strategy_doc'`, render `<WikiPrButton correction={correction} />` in the card footer (after the rationale `MarkdownProse`, inside a `mt-3` wrapper). This is the durability path once the transient panel is gone; it shows "View PR" when `wiki_pr_url` is set.

- [ ] **Step 10: Typecheck, build, full test run**

Run: `npm run typecheck && npm run build && npm run test`
Expected: typecheck/build PASS; new Vitest file passes. (Per project note, `npm run test` exits 1 from pre-existing nested e2e file failures — trust the "N passed, 0 failed" line for the suites that ran, including `wikiCommit.test.ts`.)

- [ ] **Step 11: Commit**

```bash
git add src/hooks/internal/useCorrections.ts src/pages/internal/InternalCorrections.tsx src/lib/internal/wikiCommit.ts src/lib/internal/wikiCommit.test.ts
git commit -m "feat(aios): Open-wiki-PR button on corrections panel + applied strategy-doc cards"
```

---

## Task 4: Finish — knowledge, Codex, verify

- [ ] **Step 1: Knowledge-sync the session**

Invoke the `knowledge-sync` skill: write a `docs/wiki/raw/sessions/` source for this feature, `/wiki-ops ingest` it, and update `docs/PROJECT_CONTEXT.md`'s AIOS corrections workstream line to note the wiki-PR durability button + the `GITHUB_WIKI_TOKEN` prerequisite. (Donny RAG sync happens after merge.)

- [ ] **Step 2: Codex full-branch pass**

Run: `codex review --base main --title "Open wiki PR for applied corrections"`. Fix real findings, re-run until clean, relay the verdict.

- [ ] **Step 3: Open the PR**

`finishing-a-development-branch`: push the branch and open a PR summarizing the three slices + the one-time `GITHUB_WIKI_TOKEN` setup step for prod. Note that the prod migration is already applied and the edge function must be deployed to prod separately.

- [ ] **Step 4: Prod verification (post-merge/deploy)**

Deploy `wiki-commit-pr` to prod; set the prod `GITHUB_WIKI_TOKEN`. Invoke the `verify-prod` skill: on `internal.dragoncandy.io/internal/corrections`, approve a strategy-doc correction → Open wiki PR → confirm a real prod-repo PR with the rationale body, both desktop and mobile viewports, no console errors. Confirm a second click shows "View PR" and opens no duplicate.

---

## Risks & Notes

- **Prerequisite gating.** Nothing works in prod until `GITHUB_WIKI_TOKEN` exists; the UI degrades to a hint, never an error wall. Call this out in the PR so it isn't read as a bug.
- **Deploy ordering.** Migration → prod, *then* edge deploy + frontend merge. The function reads/writes the new columns.
- **MCP bundling.** Deploying `wiki-commit-pr` must include `_shared/cors.ts`; a failed bundle silently keeps the prior (nonexistent) version — boot-check the guard responses after deploy.
- **`proposed_value` shape.** Relies on the apply RPC's invariant that strategy-doc values are JSON strings (enforced at `aios_corrections_apply`). Non-string ⇒ empty-content 400, never a malformed commit.
- **Out of scope (per spec §8):** auto-merge, `main` push, dashboard-setting commits, reopen-after-close, multi-file commits.
