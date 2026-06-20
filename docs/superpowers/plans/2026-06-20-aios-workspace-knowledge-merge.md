# AIOS Workspace Reading, Strategy-Library Import & In-UI Knowledge Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let internal Donny read AIOS-folder Workspace docs, import those docs into the Strategy library, and approve+merge knowledge PRs entirely inside `/internal` (no GitHub visit, no Lovable deploy) while preserving the human-merge gate.

**Architecture:** Three independently-shippable slices. **A** adds a Drive read path (a shared `readDcFile` helper + a proxy action + a Donny tool). **B** is the keystone: a new admin-gated `wiki-merge-pr` edge function that merges a wiki PR via the GitHub API then syncs the merged file into Donny's RAG + the Strategy library, surfaced by a "Pending knowledge" panel. **C** adds an "Add to Strategy library" import that opens a wiki PR flowing through B. Build order **A → B → C** (C depends on A's reader and B's merge surface).

**Tech Stack:** Deno edge functions (Supabase), React 18 + TypeScript + React Query + shadcn/ui (Tailwind `dc-*` tokens), Vitest, GitHub REST API, Google Drive API (`drive.file` scope only).

**Spec:** `docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md`

---

## Conventions & ground rules (read before starting)

- **Edge functions are Deno**; they cannot import from `src/`. Pure, dependency-free
  logic that must be unit-tested lives in `supabase/functions/_shared/*.ts` with a
  co-located `*.test.ts` (Vitest, `environment: 'node'`) — this runs in `npm run test`
  **only if the module uses NO `https://` std imports and no `Deno.*` globals**. The
  impure handlers (fetch, `Deno.env`, `serve`) are verified by deploy + boot-check +
  Codex + prod, not unit tests (repo convention).
- **Deploy is separate from frontend.** Pushing to `main` deploys the frontend via
  Lovable only. Edge functions deploy via the Supabase MCP `deploy_edge_function`
  (bundle ALL transitive `_shared/` files) or CLI. `donny-chat` calls `serve()` at
  import, so changing it is a **founder-run redeploy** — note it, don't block on it.
- **Run `npm run test` and `npm run build` after each slice.** `npm run test` exits 1
  due to ~103 pre-existing failed e2e FILES — trust the "Tests N passed, 0 failed"
  line for the files you touched, not the exit code.
- **Design tokens:** `dc-*` only, dark "ops-deck" theme on `/internal` (white text on
  `bg-white/[0.04]` cards, `border-dc-teal/25`). Never gray. Match
  `SaveToKnowledgeButton.tsx` / `WorkspaceFileGrid.tsx` styling.
- **Commit after every green step.** Conventional commits. End commit messages with the
  `Co-Authored-By` / `Claude-Session` trailers used elsewhere in this branch.
- Branch already exists: `feat/aios-workspace-knowledge-merge`.

---

## File Structure

### Slice A — Donny reads AIOS docs
- Create: `supabase/functions/_shared/drive-export.ts` — pure: mime→export-mode mapping + text cap.
- Create: `supabase/functions/_shared/drive-export.test.ts` — Vitest.
- Modify: `supabase/functions/_shared/google-workspace.ts` — add impure `readDcFile()`.
- Modify: `supabase/functions/google-workspace-proxy/index.ts` — add `case "read_file"`.
- Modify: `supabase/functions/donny-chat/index.ts` — add `workspace_read_file` tool def + handler + internal-allowlist entry.

### Slice B — In-UI approve & merge (keystone)
- Create: `supabase/functions/_shared/wiki-sync-payload.ts` — pure: frontmatter parse + `buildSyncPage(path, raw)`.
- Create: `supabase/functions/_shared/wiki-sync-payload.test.ts` — Vitest.
- Create: `supabase/functions/_shared/wiki-merge-guard.ts` — pure: `MERGE_PATH_RE`, `assertAllWikiPaths()`, `dedupeByHeadBranch()`.
- Create: `supabase/functions/_shared/wiki-merge-guard.test.ts` — Vitest.
- Create: `supabase/functions/wiki-merge-pr/index.ts` — admin-gated `list` / `preview` / `merge` actions.
- Create: `src/hooks/internal/usePendingKnowledge.ts` — list + merge React Query hooks.
- Create: `src/components/internal/PendingKnowledgePanel.tsx` — the panel UI.
- Modify: `src/pages/internal/InternalCorrections.tsx` — mount the panel.
- Modify: `src/components/internal/SaveToKnowledgeButton.tsx` — success toast deep-links to the panel.

### Slice C — Import an AIOS Doc into the Strategy library
- Create: `supabase/functions/_shared/wiki-import-page.ts` — pure: `buildImportedPage()`.
- Create: `supabase/functions/_shared/wiki-import-page.test.ts` — Vitest.
- Create: `supabase/functions/wiki-import-doc/index.ts` — admin-gated; server-side reads the Doc, opens a PR.
- Create: `src/lib/internal/wikiImport.ts` — pure: `deriveImportDefaults()`, `validateImportInput()`, `isImportable()`.
- Create: `src/lib/internal/wikiImport.test.ts` — Vitest.
- Create: `src/hooks/internal/useImportDocToLibrary.ts` — mutation hook.
- Create: `src/components/internal/workspace/ImportToLibraryDialog.tsx` — the import dialog.
- Modify: `src/components/internal/workspace/WorkspaceFileGrid.tsx` — add "Add to Strategy library" dropdown item.
- Modify: `src/pages/internal/InternalWorkspace.tsx` — wire import dialog state + action.

---

# SLICE A — Donny reads AIOS docs

### Task A1: Pure Drive export-mode helper

**Files:**
- Create: `supabase/functions/_shared/drive-export.ts`
- Test: `supabase/functions/_shared/drive-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/drive-export.test.ts
import { describe, it, expect } from 'vitest';
import { pickExportMode, capText, EXPORT_CAP } from './drive-export';

describe('pickExportMode', () => {
  it('exports Google Docs as markdown', () => {
    expect(pickExportMode('application/vnd.google-apps.document'))
      .toEqual({ mode: 'export', exportMime: 'text/markdown' });
  });
  it('exports Google Sheets as CSV', () => {
    expect(pickExportMode('application/vnd.google-apps.spreadsheet'))
      .toEqual({ mode: 'export', exportMime: 'text/csv' });
  });
  it('reads plain text/markdown uploads via media', () => {
    expect(pickExportMode('text/markdown')).toEqual({ mode: 'media' });
    expect(pickExportMode('text/plain')).toEqual({ mode: 'media' });
  });
  it('marks Slides and binary as unsupported', () => {
    expect(pickExportMode('application/vnd.google-apps.presentation')).toEqual({ mode: 'unsupported' });
    expect(pickExportMode('image/png')).toEqual({ mode: 'unsupported' });
    expect(pickExportMode('application/pdf')).toEqual({ mode: 'unsupported' });
  });
});

describe('capText', () => {
  it('passes short text through untruncated', () => {
    expect(capText('hello')).toEqual({ text: 'hello', truncated: false });
  });
  it('truncates text over the cap and flags it', () => {
    const big = 'x'.repeat(EXPORT_CAP + 10);
    const out = capText(big);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(EXPORT_CAP);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run supabase/functions/_shared/drive-export.test.ts`
Expected: FAIL — cannot find module `./drive-export`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/drive-export.ts
// Pure mime→read-strategy mapping + output cap for reading AIOS-folder files.
// Dependency-free (no Deno globals, no https imports) so Vitest runs it in CI.

export const EXPORT_CAP = 50_000; // chars — protects Donny's context window

export type ExportMode =
  | { mode: 'export'; exportMime: string }
  | { mode: 'media' }
  | { mode: 'unsupported' };

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';

/** Decide how to pull a file's text given its Drive mimeType. Slides + binary
 *  are unsupported (Docs + Sheets cover the founder's need; see spec §8). */
export function pickExportMode(mimeType: string): ExportMode {
  if (mimeType === GOOGLE_DOC) return { mode: 'export', exportMime: 'text/markdown' };
  if (mimeType === GOOGLE_SHEET) return { mode: 'export', exportMime: 'text/csv' };
  if (mimeType === 'text/markdown' || mimeType === 'text/plain') return { mode: 'media' };
  return { mode: 'unsupported' };
}

export function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= EXPORT_CAP) return { text, truncated: false };
  return { text: text.slice(0, EXPORT_CAP), truncated: true };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run supabase/functions/_shared/drive-export.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/drive-export.ts supabase/functions/_shared/drive-export.test.ts
git commit -m "feat(aios): pure Drive export-mode helper for reading AIOS files"
```

---

### Task A2: `readDcFile` helper (impure I/O)

**Files:**
- Modify: `supabase/functions/_shared/google-workspace.ts` (add export near `listDcFiles`, ~line 334)

- [ ] **Step 1: Add the helper**

Add to `_shared/google-workspace.ts` (import the pure helpers at top of file):

```ts
import { pickExportMode, capText } from "./drive-export.ts";

const DRIVE_EXPORT_URL = "https://www.googleapis.com/drive/v3/files";

/**
 * Read the text of a file that lives in the caller's DragonCandy AIOS folder.
 * Guards on parent === folderId (defense in depth over drive.file). Google Docs
 * come back as markdown, Sheets as CSV, plain/markdown uploads as raw text;
 * everything else is rejected. Output is capped (see EXPORT_CAP).
 *
 * KNOWN LIMITATION: the guard checks DIRECT parentage only — a file nested in a
 * sub-folder of the AIOS folder would be rejected. That's acceptable today (the
 * hub creates files at the folder root); a future "files in subfolders" case
 * would need a recursive ancestor walk.
 */
export async function readDcFile(
  token: string,
  folderId: string,
  fileId: string,
): Promise<{ name: string; mimeType: string; text: string; truncated: boolean }> {
  // 1. Metadata — name, mimeType, and parents for the folder guard.
  const meta = await driveRequest(
    token,
    `${DRIVE_EXPORT_URL}/${fileId}?fields=id,name,mimeType,parents`,
  );
  if (!Array.isArray(meta.parents) || !meta.parents.includes(folderId)) {
    throw new GoogleWorkspaceError("forbidden_file", "File is not in the DragonCandy AIOS folder", 403);
  }
  const strat = pickExportMode(meta.mimeType);
  if (strat.mode === "unsupported") {
    throw new GoogleWorkspaceError("unsupported_type", `Cannot read ${meta.mimeType} as text`, 400);
  }
  // 2. Export/media returns text (NOT json) — do a raw fetch, not driveRequest.
  const url =
    strat.mode === "export"
      ? `${DRIVE_EXPORT_URL}/${fileId}/export?mimeType=${encodeURIComponent(strat.exportMime)}`
      : `${DRIVE_EXPORT_URL}/${fileId}?alt=media`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    console.error("[google-workspace] read export failed:", resp.status, (await resp.text()).slice(0, 200));
    throw new GoogleWorkspaceError("google_api_error", `Could not read file (${resp.status})`, 502);
  }
  const { text, truncated } = capText(await resp.text());
  return { name: meta.name, mimeType: meta.mimeType, text, truncated };
}
```

- [ ] **Step 2: Sanity-build the shared module's TS**

Run: `npm run typecheck`
Expected: PASS (no new TS errors). (Edge functions aren't in the app tsconfig, but
this catches obvious type slips in shared types if referenced; if `_shared/` is outside
`tsconfig.app.json`, this step just confirms nothing else broke.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/google-workspace.ts
git commit -m "feat(aios): readDcFile — guarded text read of AIOS-folder files"
```

---

### Task A3: Proxy `read_file` action

**Files:**
- Modify: `supabase/functions/google-workspace-proxy/index.ts` (add a `case`, ~after line 264; add `readDcFile` to the import block at line 16-39)

- [ ] **Step 1: Add the action**

Add `readDcFile` to the import from `../_shared/google-workspace.ts`, then add:

```ts
      case "read_file": {
        const fileId = assertDriveFileId(body.file_id);
        const { token, folderId } = await driveCtx(supabaseAdmin, user.id);
        return json({ file: await readDcFile(token, folderId, fileId) });
      }
```

(`assertDriveFileId` is already imported.)

- [ ] **Step 2: Deploy + boot-check**

Deploy `google-workspace-proxy` via Supabase MCP `deploy_edge_function` (bundle all
`_shared/` deps incl. the new `drive-export.ts`). Then verify it boots: an unknown/no-
body request should return the function's normal error, not a boot crash.

Run (replace `<anon>`):
`curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/google-workspace-proxy" -H "apikey: <anon>" -H "Content-Type: application/json" -d '{}'`
Expected: a JSON error (e.g. unauthorized / unknown action) with HTTP 200/4xx — NOT a 500 boot error. This confirms the bundle (with `drive-export.ts`) loaded.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/google-workspace-proxy/index.ts
git commit -m "feat(aios): google-workspace-proxy read_file action"
```

---

### Task A4: Donny `workspace_read_file` tool

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` — tool def (near `workspace_list_files`, ~line 467), handler (near the `workspace_list_files` handler, ~line 1013), and the internal-tool allowlist (search the set that gates the internal surface, ~line 1972).

- [ ] **Step 1: Add the tool definition**

After the `workspace_list_files` def (~line 467):

```ts
  {
    name: "workspace_read_file",
    description:
      "Read the text content of a file in the user's DragonCandy AIOS Drive folder. Call workspace_list_files FIRST to get the file id. Returns the document text (Google Docs as markdown, Sheets as CSV). Only files in the AIOS folder are readable.",
    input_schema: {
      type: "object",
      properties: { file_id: { type: "string", description: "Drive file id from workspace_list_files" } },
      required: ["file_id"],
    },
  },
```

- [ ] **Step 2: Add the handler**

After the `workspace_list_files` handler (~line 1013), add a `case`. Confirm `readDcFile`
and `assertDriveFileId` are imported from `../_shared/google-workspace.ts` in donny-chat
(add to its import block if missing):

```ts
    case "workspace_read_file": {
      try {
        const { token, folderId } = await driveCtx(supabaseAdmin, userId);
        const fileId = assertDriveFileId(args.file_id);
        const file = await readDcFile(token, folderId, fileId);
        return { result: { name: file.name, text: file.text, truncated: file.truncated } };
      } catch (err) {
        const friendly = workspaceNotConnectedMessage(err);
        if (friendly) return { result: { message: friendly } };
        throw err;
      }
    }
```

- [ ] **Step 3: Verify the tool joins the internal set (no separate allowlist exists)**

There is **no name-based allowlist** to edit: `INTERNAL_TOOL_DEFINITIONS` is a single
array (~lines 383-498), `allowedTools = INTERNAL_TOOL_DEFINITIONS` directly (~line 1973),
and `INTERNAL_TOOL_NAMES` is *derived* from that array (~line 500). So **Step 1 (adding
the def into `INTERNAL_TOOL_DEFINITIONS`) is the whole job.** Confirm:
(a) the new `workspace_read_file` def sits inside `INTERNAL_TOOL_DEFINITIONS` so it
auto-joins `INTERNAL_TOOL_NAMES`; and
(b) it is NOT added to `TOOL_DEFINITIONS` / `TOOLS_BY_ROLE` (the consumer-facing maps) —
internal-only, never exposed to consumer Donny.

- [ ] **Step 4: Note founder-run redeploy**

`donny-chat` calls `serve()` at import → this is a **founder-run redeploy** (MCP/CLI,
bundle all `_shared/`). Add a checklist line to the slice's PR description: "Redeploy
donny-chat to activate workspace_read_file." Do not block the slice on it.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat(aios): internal Donny workspace_read_file tool"
```

- [ ] **Step 6: Slice A gate — build + test**

Run: `npm run build` (expect success) and `npx vitest run supabase/functions/_shared/drive-export.test.ts` (expect PASS).

---

# SLICE B — In-UI approve & merge (keystone)

### Task B0: Confirm whether docs-only PRs trigger CI

**Files:** read-only — `.github/workflows/*.yml`

- [ ] **Step 1: Inspect CI path filters**

Read `.github/workflows/*.yml`. Determine whether PRs touching only `docs/wiki/**` run
required status checks (which would gate the merge). Record the finding in the
`wiki-merge-pr` header comment. If checks DO run on docs PRs, the `not_mergeable_yet`
path (Task B3) is the expected transient state; if they don't, merges are immediate.
No code in this step — it sizes B3's retry behavior.

**Known outcome (verified during plan review):** `ci.yml` runs build/typecheck/lint/test
on **every** `pull_request` to `main` with **no path filter** — so docs-only wiki PRs
**do** trigger required checks, and `not_mergeable_yet` is the expected transient until
they pass. (`e2e.yml` runs on Vercel `deployment_status`, not as a PR check, so it does
not gate the merge.) Confirm this still holds, then record it in the header comment.

---

### Task B1: Pure sync-payload builder

**Files:**
- Create: `supabase/functions/_shared/wiki-sync-payload.ts`
- Test: `supabase/functions/_shared/wiki-sync-payload.test.ts`

This MUST reproduce exactly what `supabase/scripts/sync-internal-docs.mjs` sends per
wiki page (verified in spec §2), so the nightly re-sync updates the same rows.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/wiki-sync-payload.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, buildSyncPage } from './wiki-sync-payload';

const RAW = `---
title: Pricing Ladder
type: analysis
tags: [pricing, strategy]
---
# Pricing Ladder

Body line one.`;

describe('parseFrontmatter', () => {
  it('splits frontmatter keys from body', () => {
    const { fm, body } = parseFrontmatter(RAW);
    expect(fm.title).toBe('Pricing Ladder');
    expect(fm.type).toBe('analysis');
    expect(body.startsWith('# Pricing Ladder')).toBe(true);
  });
  it('handles a file with no frontmatter', () => {
    const { fm, body } = parseFrontmatter('# Bare\n\ntext');
    expect(fm).toEqual({});
    expect(body).toBe('# Bare\n\ntext');
  });
});

describe('buildSyncPage', () => {
  it('builds the canonical donny-knowledge-sync page for a wiki path', () => {
    const page = buildSyncPage('docs/wiki/analyses/pricing-ladder.md', RAW);
    expect(page.source_id).toBe('internal-analyses:pricing-ladder');
    expect(page.scope).toBe('internal');
    expect(page.full_content).toBe(RAW);              // FULL raw markdown, not a boolean
    expect(page.metadata.path).toBe('docs/wiki/analyses/pricing-ladder.md');
    expect(page.metadata.title).toBe('Pricing Ladder');
    expect(page.metadata.type).toBe('analysis');
    expect(page.content.startsWith('Pricing Ladder\n\n')).toBe(true); // `${title}\n\n${body}`
    expect(page.content.length).toBeLessThanOrEqual(24_000);
  });
  it('falls back to slug for title and internal_doc for type when frontmatter is absent', () => {
    const page = buildSyncPage('docs/wiki/concepts/auth-model.md', '# Auth\n\nx');
    expect(page.source_id).toBe('internal-concepts:auth-model');
    expect(page.metadata.title).toBe('auth-model');
    expect(page.metadata.type).toBe('internal_doc');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run supabase/functions/_shared/wiki-sync-payload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/wiki-sync-payload.ts
// Reproduce the EXACT per-wiki-page payload sync-internal-docs.mjs POSTs to
// donny-knowledge-sync, so a merge→sync and the nightly cron hit the same rows.
// Dependency-free → Vitest runs it in CI.

const MAX_EMBED_CHARS = 24_000;

export interface SyncPage {
  source_id: string;
  content: string;
  metadata: { title: string; type: string; path: string; tags: string };
  scope: 'internal';
  full_content: string;
}

export function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: m[2].trim() };
}

/** path MUST be `docs/wiki/<folder>/<slug>.md` with forward slashes. */
export function buildSyncPage(path: string, raw: string): SyncPage {
  const norm = path.replace(/\\/g, '/');
  const m = norm.match(/^docs\/wiki\/([^/]+)\/(.+)\.md$/);
  if (!m) throw new Error(`not a wiki path: ${path}`);
  const [, folder, slug] = m;
  const { fm, body } = parseFrontmatter(raw);
  const title = fm.title ?? slug;
  return {
    source_id: `internal-${folder}:${slug}`,
    content: `${title}\n\n${body}`.slice(0, MAX_EMBED_CHARS),
    metadata: { title, type: fm.type ?? 'internal_doc', path: norm, tags: fm.tags ?? '' },
    scope: 'internal',
    full_content: raw,
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run supabase/functions/_shared/wiki-sync-payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/wiki-sync-payload.ts supabase/functions/_shared/wiki-sync-payload.test.ts
git commit -m "feat(aios): canonical wiki→donny-knowledge-sync payload builder"
```

---

### Task B2: Pure merge-guard helpers

**Files:**
- Create: `supabase/functions/_shared/wiki-merge-guard.ts`
- Test: `supabase/functions/_shared/wiki-merge-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/wiki-merge-guard.test.ts
import { describe, it, expect } from 'vitest';
import { MERGE_PATH_RE, assertAllWikiPaths, dedupeByHeadBranch } from './wiki-merge-guard';

describe('MERGE_PATH_RE', () => {
  it('accepts the three round-trippable wiki folders', () => {
    expect(MERGE_PATH_RE.test('docs/wiki/concepts/a.md')).toBe(true);
    expect(MERGE_PATH_RE.test('docs/wiki/analyses/b-c.md')).toBe(true);
    expect(MERGE_PATH_RE.test('docs/wiki/entities/d.md')).toBe(true);
  });
  it('rejects code, sources, and traversal', () => {
    expect(MERGE_PATH_RE.test('src/App.tsx')).toBe(false);
    expect(MERGE_PATH_RE.test('docs/wiki/sources/x.md')).toBe(false);
    expect(MERGE_PATH_RE.test('docs/wiki/concepts/../../../etc.md')).toBe(false);
  });
});

describe('assertAllWikiPaths', () => {
  it('returns true only when EVERY path is a wiki path', () => {
    expect(assertAllWikiPaths(['docs/wiki/concepts/a.md'])).toBe(true);
    expect(assertAllWikiPaths(['docs/wiki/concepts/a.md', 'src/x.ts'])).toBe(false);
    expect(assertAllWikiPaths([])).toBe(false); // empty PR is not mergeable knowledge
  });
});

describe('dedupeByHeadBranch', () => {
  it('keeps the newest PR per head branch', () => {
    const prs = [
      { number: 2, head_branch: 'donny-wiki-answer/analyses-foo' },
      { number: 5, head_branch: 'donny-wiki-answer/analyses-foo' },
      { number: 9, head_branch: 'donny-wiki-import/concepts-bar' },
    ];
    const out = dedupeByHeadBranch(prs);
    expect(out.map((p) => p.number).sort()).toEqual([5, 9]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

Run: `npx vitest run supabase/functions/_shared/wiki-merge-guard.test.ts` → FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/wiki-merge-guard.ts
// Pure guards for the in-UI merge surface. Dependency-free → Vitest in CI.

// The three folders donny-knowledge-sync can round-trip (matches sync-internal-docs WIKI_DIRS).
export const MERGE_PATH_RE = /^docs\/wiki\/(concepts|analyses|entities)\/[a-z0-9][a-z0-9-]*\.md$/;

/** True only if the PR's changed files are ALL wiki pages (and there is at least one). */
export function assertAllWikiPaths(paths: string[]): boolean {
  return paths.length > 0 && paths.every((p) => MERGE_PATH_RE.test(p));
}

/** Keep one PR per head branch — the highest number (newest). */
export function dedupeByHeadBranch<T extends { number: number; head_branch: string }>(prs: T[]): T[] {
  const byBranch = new Map<string, T>();
  for (const pr of prs) {
    const existing = byBranch.get(pr.head_branch);
    if (!existing || pr.number > existing.number) byBranch.set(pr.head_branch, pr);
  }
  return [...byBranch.values()];
}
```

- [ ] **Step 4: Run test, verify it passes.** Run the same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/wiki-merge-guard.ts supabase/functions/_shared/wiki-merge-guard.test.ts
git commit -m "feat(aios): pure merge-guard helpers (path allow-list, branch dedupe)"
```

---

### Task B3: `wiki-merge-pr` edge function

**Files:**
- Create: `supabase/functions/wiki-merge-pr/index.ts`

Model the admin gate + GitHub headers/base64 helpers on `wiki-save-answer/index.ts`
(lines 31-53, 93-104). This function has three actions: `list`, `preview`, `merge`.

- [ ] **Step 1: Write the function**

```ts
// wiki-merge-pr
// Admin-clicked in-UI approval of knowledge PRs. Three actions:
//   list    → open PRs touching ONLY docs/wiki/** (deduped by head branch)
//   preview → the rendered markdown of a PR's first wiki file (for the panel)
//   merge   → squash-merge the PR via GitHub API, then sync each merged file into
//             donny_knowledge + internal_docs via donny-knowledge-sync.
// Reuses GITHUB_WIKI_TOKEN (Contents + Pull Requests R/W) — no new secret.
// Path allow-list (wiki-merge-guard) refuses any PR that touches non-wiki files.
// Human-merge invariant preserved: only an admin can call this; Donny cannot.
// CI note (fill from Task B0): docs/wiki PRs <do|do not> run required checks.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildSyncPage } from "../_shared/wiki-sync-payload.ts";
import { assertAllWikiPaths, dedupeByHeadBranch, MERGE_PATH_RE } from "../_shared/wiki-merge-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_WIKI_TOKEN") ?? "";
const REPO = Deno.env.get("GITHUB_WIKI_REPO") ?? "Pdiamondz1/dragoncandy-v3-d783432b";
const BASE = Deno.env.get("GITHUB_WIKI_BASE") ?? "main";
const GH = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "dragoncandy-wiki-merge",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });

  // --- Admin gate (same as wiki-save-answer) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) return json({ error: "forbidden: admin only" }, 403);

  if (!GITHUB_TOKEN) return json({ error: "github_not_configured" }, 200);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const action = String(body.action ?? "");

  // One files-fetch per open PR (N+1). Fine for the handful of open knowledge PRs
  // expected; if open-PR volume ever grows, cache/paginate here.
  async function prChangedPaths(n: number): Promise<string[]> {
    const r = await fetch(`${GH}/repos/${REPO}/pulls/${n}/files?per_page=100`, { headers: ghHeaders() });
    if (!r.ok) throw new Error(`github pr files ${r.status}`);
    return (await r.json()).map((f: { filename: string }) => f.filename);
  }

  try {
    if (action === "list") {
      const r = await fetch(`${GH}/repos/${REPO}/pulls?state=open&base=${BASE}&per_page=100`, { headers: ghHeaders() });
      if (!r.ok) return json({ error: `github list ${r.status}` }, 502);
      const raw = await r.json();
      const rows = [];
      for (const pr of raw) {
        const paths = await prChangedPaths(pr.number);
        if (!assertAllWikiPaths(paths)) continue; // skip non-knowledge PRs
        rows.push({ number: pr.number, title: pr.title, html_url: pr.html_url, head_branch: pr.head.ref, paths });
      }
      return json({ prs: dedupeByHeadBranch(rows) });
    }

    if (action === "preview") {
      const n = Number(body.pr_number);
      if (!Number.isInteger(n)) return json({ error: "bad pr_number" }, 400);
      const prRes = await fetch(`${GH}/repos/${REPO}/pulls/${n}`, { headers: ghHeaders() });
      if (!prRes.ok) return json({ error: `github pr ${prRes.status}` }, 502);
      const pr = await prRes.json();
      const paths = await prChangedPaths(n);
      const wikiPath = paths.find((p) => MERGE_PATH_RE.test(p));
      if (!wikiPath) return json({ error: "no_wiki_file" }, 400);
      const fileRes = await fetch(
        `${GH}/repos/${REPO}/contents/${wikiPath}?ref=${encodeURIComponent(pr.head.ref)}`,
        { headers: ghHeaders() },
      );
      if (!fileRes.ok) return json({ error: `github contents ${fileRes.status}` }, 502);
      const md = new TextDecoder().decode(
        Uint8Array.from(atob((await fileRes.json()).content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
      );
      return json({ path: wikiPath, markdown: md });
    }

    if (action === "merge") {
      const n = Number(body.pr_number);
      if (!Number.isInteger(n)) return json({ error: "bad pr_number" }, 400);

      // 1. Load PR; assert base + wiki-only paths.
      let prRes = await fetch(`${GH}/repos/${REPO}/pulls/${n}`, { headers: ghHeaders() });
      if (!prRes.ok) return json({ error: `github pr ${prRes.status}` }, 502);
      let pr = await prRes.json();
      if (pr.base.ref !== BASE) return json({ error: "wrong_base" }, 400);
      const paths = await prChangedPaths(n);
      if (!assertAllWikiPaths(paths)) return json({ error: "non_wiki_paths" }, 400);

      // 2. Merge unless already merged. GitHub computes `mergeable` async (null
      //    on first read) — re-poll once, then defer to the panel if still unknown.
      if (!pr.merged) {
        if (pr.mergeable === null) {
          await new Promise((r) => setTimeout(r, 1500));
          prRes = await fetch(`${GH}/repos/${REPO}/pulls/${n}`, { headers: ghHeaders() });
          pr = await prRes.json();
        }
        if (pr.mergeable === null) return json({ state: "not_mergeable_yet" });
        if (pr.mergeable === false) return json({ state: "not_mergeable", reason: pr.mergeable_state });
        const mergeRes = await fetch(`${GH}/repos/${REPO}/pulls/${n}/merge`, {
          method: "PUT",
          headers: ghHeaders(),
          body: JSON.stringify({ merge_method: "squash" }),
        });
        if (mergeRes.status === 405) return json({ state: "not_mergeable_yet" }); // checks pending
        if (!mergeRes.ok) return json({ error: `github merge ${mergeRes.status}` }, 502);
      }

      // 3. Sync each merged file (from the now-updated base) into RAG + library.
      const pages = [];
      for (const path of paths) {
        const fr = await fetch(`${GH}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(BASE)}`, { headers: ghHeaders() });
        if (!fr.ok) return json({ error: `github merged-contents ${fr.status}` }, 502);
        const raw = new TextDecoder().decode(
          Uint8Array.from(atob((await fr.json()).content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
        );
        pages.push(buildSyncPage(path, raw));
      }
      const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/donny-knowledge-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      if (!syncRes.ok) return json({ error: `sync ${syncRes.status}`, details: (await syncRes.text()).slice(0, 300) }, 502);
      return json({ merged: true, synced: paths });
    }

    return json({ error: `unknown action "${action}"` }, 400);
  } catch (e) {
    return json({ error: `merge failed: ${(e as Error).message}` }, 502);
  }
});
```

- [ ] **Step 2: Deploy + boot-check**

Deploy `wiki-merge-pr` via Supabase MCP (bundle `_shared/cors.ts`,
`wiki-sync-payload.ts`, `wiki-merge-guard.ts`). Boot-check:
`curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/wiki-merge-pr" -H "apikey: <anon>" -H "Content-Type: application/json" -d '{}'`
Expected: `{"error":"unauthorized"}` HTTP 401 (gate reached → bundle loaded), NOT a 500.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/wiki-merge-pr/index.ts
git commit -m "feat(aios): wiki-merge-pr — in-UI approve+merge with RAG/library sync"
```

---

### Task B4: Pending-knowledge React Query hooks

**Files:**
- Create: `src/hooks/internal/usePendingKnowledge.ts`

Model invocation on `useSaveAnswerToWiki.ts` (uses `supabase.functions.invoke`).

- [ ] **Step 1: Write the hooks**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PendingPr {
  number: number;
  title: string;
  html_url: string;
  head_branch: string;
  paths: string[];
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('wiki-merge-pr', { body });
  if (error) throw error;
  return data as T;
}

export function usePendingKnowledgePrs() {
  return useQuery({
    queryKey: ['aios', 'pending-knowledge'],
    queryFn: () => call<{ prs: PendingPr[] }>({ action: 'list' }).then((d) => d.prs),
  });
}

export function usePreviewKnowledgePr(prNumber: number | null) {
  return useQuery({
    queryKey: ['aios', 'pending-knowledge', 'preview', prNumber],
    queryFn: () => call<{ path: string; markdown: string }>({ action: 'preview', pr_number: prNumber! }),
    enabled: prNumber !== null,
  });
}

export interface MergeResult {
  merged?: boolean;
  synced?: string[];
  state?: 'not_mergeable_yet' | 'not_mergeable';
  error?: string;
}

export function useMergeKnowledgePr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prNumber: number) => call<MergeResult>({ action: 'merge', pr_number: prNumber }),
    onSuccess: (data) => {
      if (data.merged) {
        qc.invalidateQueries({ queryKey: ['aios', 'pending-knowledge'] });
        qc.invalidateQueries({ queryKey: ['aios', 'internal-docs'] }); // refresh Strategy library
      }
    },
  });
}
```

- [ ] **Step 2: Build check.** Run: `npm run build` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/internal/usePendingKnowledge.ts
git commit -m "feat(aios): pending-knowledge list/preview/merge hooks"
```

---

### Task B5: Pending-knowledge panel UI

**Files:**
- Create: `src/components/internal/PendingKnowledgePanel.tsx`

Match the ops-deck dark theme + `MarkdownProse` preview pattern from
`InternalStrategy.tsx`.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { GitPullRequest, ExternalLink, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePendingKnowledgePrs,
  usePreviewKnowledgePr,
  useMergeKnowledgePr,
} from '@/hooks/internal/usePendingKnowledge';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';

export const PendingKnowledgePanel = () => {
  const prs = usePendingKnowledgePrs();
  const [expanded, setExpanded] = useState<number | null>(null);
  const preview = usePreviewKnowledgePr(expanded);
  const merge = useMergeKnowledgePr();

  if (prs.isLoading) return <div className="flex justify-center py-6"><Spinner className="h-6 w-6" /></div>;
  if (prs.isError) return <p className="text-sm text-dc-pink-accent">Could not load pending knowledge PRs.</p>;
  if (!prs.data?.length) return null; // nothing pending → no clutter

  const onMerge = (n: number) =>
    merge.mutate(n, {
      onSuccess: (data) => {
        if (data.state === 'not_mergeable_yet') return toast.message('Checks still running — try again in a moment.');
        if (data.state === 'not_mergeable') return toast.error('GitHub says this PR is not mergeable.');
        if (data.error) return toast.error(data.error);
        toast.success('Merged & synced into Donny’s knowledge.');
        if (expanded === n) setExpanded(null);
      },
      onError: () => toast.error('Merge failed — try again.'),
    });

  return (
    <section className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-5 backdrop-blur-sm">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-white">
        <GitPullRequest className="h-4 w-4 text-dc-teal" /> Pending knowledge
      </h2>
      <p className="mb-4 text-sm text-white/60">
        Review and merge knowledge PRs here — they sync into Donny’s brain on merge. No GitHub trip needed.
      </p>
      <ul className="space-y-2">
        {prs.data.map((pr) => (
          <li key={pr.number} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setExpanded(expanded === pr.number ? null : pr.number)}
                className="min-w-0 flex-1 text-left text-sm font-semibold text-white hover:text-dc-teal"
              >
                {pr.title}
                <span className="block truncate font-mono text-xs font-normal text-white/40">{pr.paths.join(', ')}</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <a href={pr.html_url} target="_blank" rel="noopener" className="rounded-full p-1.5 text-white/40 hover:text-white" aria-label="View diff on GitHub">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  disabled={merge.isPending}
                  onClick={() => onMerge(pr.number)}
                  className="flex items-center gap-1 rounded-full bg-dc-teal px-3 py-1.5 text-xs font-bold text-dc-dark hover:bg-dc-teal-dark disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Merge & sync
                </button>
              </div>
            </div>
            {expanded === pr.number && (
              <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-white/10 bg-dc-dark/40 p-3">
                {preview.isLoading ? (
                  <Spinner className="h-5 w-5 border-teal-400" />
                ) : preview.data ? (
                  <MarkdownProse>{preview.data.markdown}</MarkdownProse>
                ) : (
                  <p className="text-sm text-dc-pink-accent">Preview unavailable.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
```

- [ ] **Step 2: Build check.** Run `npm run build` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/internal/PendingKnowledgePanel.tsx
git commit -m "feat(aios): pending-knowledge panel with in-UI merge + preview"
```

---

### Task B6: Mount the panel + redirect the Save toast

**Files:**
- Modify: `src/pages/internal/InternalCorrections.tsx`
- Modify: `src/components/internal/SaveToKnowledgeButton.tsx`

- [ ] **Step 1: Mount the panel**

In `InternalCorrections.tsx`, import `PendingKnowledgePanel` and render it near the top
of the page content (above or beside the corrections list — match the existing layout
container). Keep it self-hiding (it returns `null` when empty).

- [ ] **Step 2: Point the Save toast at the panel instead of GitHub**

In `SaveToKnowledgeButton.tsx` `onSuccess` (currently lines 54-60), replace the "Open PR"
GitHub action with navigation to the panel. Use `react-router`'s `useNavigate` and route
to `/internal/corrections` (where the panel lives):

```tsx
toast.success('Wiki PR opened — review & merge it under Pending knowledge.', {
  action: { label: 'Review', onClick: () => navigate('/internal/corrections') },
});
```

Keep the `file_exists` / `github_not_configured` typed-error handling unchanged.

- [ ] **Step 3: Build check.** Run `npm run build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/internal/InternalCorrections.tsx src/components/internal/SaveToKnowledgeButton.tsx
git commit -m "feat(aios): surface pending-knowledge panel + route Save toast to it"
```

- [ ] **Step 5: Slice B integration check (manual, prod or local-with-deployed-fn)**

After deploying `wiki-merge-pr`: open Save-to-knowledge on a Donny answer → confirm a PR
appears in the Pending knowledge panel → expand to preview → click Merge & sync → confirm
toast "Merged & synced", the PR closes, and the new page appears in the Strategy library
(`/internal/strategy`) without a Lovable deploy. Record the result.

---

# SLICE C — Import an AIOS Doc into the Strategy library

### Task C1: Pure imported-page builder

**Files:**
- Create: `supabase/functions/_shared/wiki-import-page.ts`
- Test: `supabase/functions/_shared/wiki-import-page.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/wiki-import-page.test.ts
import { describe, it, expect } from 'vitest';
import { buildImportedPage } from './wiki-import-page';

describe('buildImportedPage', () => {
  const page = buildImportedPage({
    title: 'Q3 GTM Notes',
    folder: 'analyses',
    tags: ['gtm', 'sales'],
    markdown: '## Plan\n\nDo the thing.',
    fileId: '1AbcDEF_ghIJKlmnop',
    today: '2026-06-20',
  });
  it('writes frontmatter with type, sources=workspace, and tags', () => {
    expect(page).toContain('title: Q3 GTM Notes');
    expect(page).toContain('type: analysis');
    expect(page).toContain('sources: [workspace]');
    expect(page).toContain('tags: [gtm, sales]');
  });
  it('records provenance (Doc id + import date) and the body', () => {
    expect(page).toContain('1AbcDEF_ghIJKlmnop');
    expect(page).toContain('2026-06-20');
    expect(page).toContain('Do the thing.');
  });
  it('starts with an H1 of the title', () => {
    expect(page).toContain('\n# Q3 GTM Notes\n');
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run supabase/functions/_shared/wiki-import-page.test.ts`

- [ ] **Step 3: Write the implementation** (mirror `wiki-save-answer`'s `buildPage`, lines 55-83)

```ts
// supabase/functions/_shared/wiki-import-page.ts
// Pure builder for a wiki page imported from a Workspace Doc. Sibling of
// wiki-save-answer's buildPage. Dependency-free → Vitest in CI.

const TYPE_BY_FOLDER: Record<string, string> = { concepts: 'concept', analyses: 'analysis' };

export function buildImportedPage(opts: {
  title: string; folder: string; tags: string[]; markdown: string; fileId: string; today: string;
}): string {
  const { title, folder, tags, markdown, fileId, today } = opts;
  const safeTitle = title.replace(/[\r\n]+/g, ' ').trim();
  const fm = [
    '---',
    `title: ${safeTitle}`,
    `type: ${TYPE_BY_FOLDER[folder]}`,
    `created: ${today}`,
    `updated: ${today}`,
    'sources: [workspace]',
    `tags: [${tags.join(', ')}]`,
    '---',
    '',
    `# ${safeTitle}`,
    '',
    `> Imported from a Google Workspace doc (id \`${fileId}\`) on ${today}.`,
    '',
  ];
  return [...fm, markdown.trim(), ''].join('\n');
}
```

- [ ] **Step 4: Run → PASS.** Same command.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/wiki-import-page.ts supabase/functions/_shared/wiki-import-page.test.ts
git commit -m "feat(aios): pure imported-doc wiki-page builder"
```

---

### Task C2: `wiki-import-doc` edge function

**Files:**
- Create: `supabase/functions/wiki-import-doc/index.ts`

Reuse `wiki-save-answer`'s admin gate + GitHub PR ceremony (base SHA → collision →
branch → create file → PR recover, lines 139-261). Differences: it reads the Doc
**server-side** via `readDcFile` (content is not client-trusted), builds the page with
`buildImportedPage`, and uses branch prefix `donny-wiki-import/<folder>-<filename>`.

- [ ] **Step 1: Write the function.** Copy `wiki-save-answer/index.ts` as the skeleton, then:
  - Input: `{ file_id, folder, filename, title, tags }` (no client `markdown`).
  - After the admin gate + input validation (folders = `['concepts','analyses']`,
    `FILENAME_RE`, title checks identical to wiki-save-answer), read the Doc:
    ```ts
    import { driveCtx, readDcFile, assertDriveFileId } from "../_shared/google-workspace.ts";
    import { buildImportedPage } from "../_shared/wiki-import-page.ts";
    // ...
    const fileId = assertDriveFileId(body.file_id);
    const { token, folderId } = await driveCtx(admin, user.id);
    let read;
    try { read = await readDcFile(token, folderId, fileId); }
    catch (e) { return json({ error: (e as { code?: string }).code ?? "read_failed" }, 200); }
    if (read.truncated) return json({ error: "doc_too_large" }, 200);
    ```
  - Build content: `const content = buildImportedPage({ title, folder, tags, markdown: read.text, fileId, today });`
  - Branch: `const branch = \`donny-wiki-import/${folder}-${filename}\`;`
  - Keep the rest of the PR ceremony byte-for-byte from wiki-save-answer (base SHA,
    base-collision `file_exists`, branch create, same-page idempotent create, PR recover),
    swapping commit/PR titles to "import".
  - Bundle note: this function imports the Google helpers, so its deploy must bundle
    `_shared/google-workspace.ts`, `_shared/drive-export.ts`, `_shared/wiki-import-page.ts`, `_shared/cors.ts`.

- [ ] **Step 2: Deploy + boot-check.**

`curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/wiki-import-doc" -H "apikey: <anon>" -H "Content-Type: application/json" -d '{}'`
Expected: `{"error":"unauthorized"}` 401 (gate reached), NOT 500.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/wiki-import-doc/index.ts
git commit -m "feat(aios): wiki-import-doc — server-read an AIOS doc into a wiki PR"
```

---

### Task C3: Pure import-dialog helpers (frontend)

**Files:**
- Create: `src/lib/internal/wikiImport.ts`
- Test: `src/lib/internal/wikiImport.test.ts`

Model on `src/lib/internal/wikiSave.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/internal/wikiImport.test.ts
import { describe, it, expect } from 'vitest';
import { deriveImportDefaults, validateImportInput, isImportable } from './wikiImport';

describe('deriveImportDefaults', () => {
  it('kebab-cases the filename and defaults the folder to analyses', () => {
    const d = deriveImportDefaults('Q3 GTM Notes.docx');
    expect(d.filename).toBe('q3-gtm-notes');
    expect(d.folder).toBe('analyses');
    expect(d.title).toBe('Q3 GTM Notes.docx');
  });
});

describe('validateImportInput', () => {
  it('requires a non-empty kebab filename and a title', () => {
    expect(validateImportInput({ folder: 'analyses', filename: 'a-b', title: 'T' }).ok).toBe(true);
    expect(validateImportInput({ folder: 'analyses', filename: '', title: 'T' }).ok).toBe(false);
    expect(validateImportInput({ folder: 'analyses', filename: 'a', title: '' }).ok).toBe(false);
  });
});

describe('isImportable', () => {
  it('allows Google Docs, Sheets, and text; rejects slides + binary', () => {
    expect(isImportable('application/vnd.google-apps.document')).toBe(true);
    expect(isImportable('application/vnd.google-apps.spreadsheet')).toBe(true);
    expect(isImportable('text/markdown')).toBe(true);
    expect(isImportable('application/vnd.google-apps.presentation')).toBe(false);
    expect(isImportable('image/png')).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/internal/wikiImport.test.ts`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/internal/wikiImport.ts
export type WikiFolder = 'concepts' | 'analyses';

export function kebab(s: string): string {
  return s.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function deriveImportDefaults(fileName: string): { title: string; folder: WikiFolder; filename: string } {
  return { title: fileName.trim(), folder: 'analyses', filename: kebab(fileName) };
}

export function validateImportInput(input: { folder: string; filename: string; title: string }): { ok: boolean; error?: string } {
  if (!['concepts', 'analyses'].includes(input.folder)) return { ok: false, error: 'Pick a folder.' };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.filename)) return { ok: false, error: 'Filename must be kebab-case.' };
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' };
  return { ok: true };
}

export function isImportable(mimeType: string): boolean {
  return (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/plain'
  );
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/internal/wikiImport.ts src/lib/internal/wikiImport.test.ts
git commit -m "feat(aios): import-dialog pure helpers"
```

---

### Task C4: Import mutation hook + dialog

**Files:**
- Create: `src/hooks/internal/useImportDocToLibrary.ts`
- Create: `src/components/internal/workspace/ImportToLibraryDialog.tsx`

Model the hook on `useSaveAnswerToWiki.ts` and the dialog on `SaveToKnowledgeButton.tsx`.

- [ ] **Step 1: Write the hook**

```ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ImportInput {
  file_id: string;
  folder: 'concepts' | 'analyses';
  filename: string;
  title: string;
  tags?: string[];
}
export interface ImportResult { url?: string; number?: number; error?: string }

export function useImportDocToLibrary() {
  return useMutation({
    mutationFn: async (input: ImportInput): Promise<ImportResult> => {
      const { data, error } = await supabase.functions.invoke<ImportResult>('wiki-import-doc', { body: input });
      if (error) throw error;
      return data ?? {};
    },
  });
}
```

- [ ] **Step 2: Write the dialog** — a controlled dialog (`file`, `open`, `onOpenChange`)
  mirroring `SaveToKnowledgeButton`'s dialog body (title / folder select / filename /
  tags), prefilled via `deriveImportDefaults(file.name)`, validated with
  `validateImportInput`. On submit call `useImportDocToLibrary`. On success: if
  `data.error` show a mapped toast and keep the dialog open; else
  `toast.success('Import PR opened — review & merge under Pending knowledge.', { action: { label: 'Review', onClick: () => navigate('/internal/corrections') } })` and close.

  Use this error map (covers `readDcFile`/`driveCtx` throws AND the PR-level typed 200s),
  with a generic fallback so no raw code ever reaches the founder:

```ts
const IMPORT_ERRORS: Record<string, string> = {
  file_exists: 'A wiki page with that filename already exists — rename it.',
  doc_too_large: 'That doc is too large to import (over 50 KB of text).',
  unsupported_type: 'Only Google Docs, Sheets, and text files can be imported.',
  forbidden_file: 'That file is not in your DragonCandy AIOS folder.',
  not_connected: 'Connect Google Workspace first (/internal/workspace).',
  needs_reconnect: 'Your Google connection expired — reconnect at /internal/workspace.',
  github_not_configured: 'GitHub wiki token is not configured — ask an admin.',
};
const msg = IMPORT_ERRORS[data.error] ?? 'Import failed — try again.';
```

- [ ] **Step 3: Build check.** `npm run build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/internal/useImportDocToLibrary.ts src/components/internal/workspace/ImportToLibraryDialog.tsx
git commit -m "feat(aios): import-to-library hook + dialog"
```

---

### Task C5: Wire the "Add to Strategy library" action

**Files:**
- Modify: `src/components/internal/workspace/WorkspaceFileGrid.tsx`
- Modify: `src/pages/internal/InternalWorkspace.tsx`

- [ ] **Step 1: Add the action to the grid**

In `WorkspaceFileGrid.tsx`: extend `FileActions` with `onImport: (file: WorkspaceFile) => void`.
Import `isImportable` and `BookPlus`. In the dropdown, add (gated to importable types):

```tsx
{isImportable(file.mimeType) && (
  <DropdownMenuItem onClick={() => actions.onImport(file)}>
    <BookPlus className="mr-2 h-4 w-4" /> Add to Strategy library
  </DropdownMenuItem>
)}
```

- [ ] **Step 2: Wire state in the page**

In `InternalWorkspace.tsx`: add `const [importFile, setImportFile] = useState<WorkspaceFile | null>(null);`,
pass `onImport: setImportFile` into the grid's `actions`, and render
`<ImportToLibraryDialog file={importFile} open={!!importFile} onOpenChange={(o) => !o && setImportFile(null)} />`.

- [ ] **Step 3: Build check.** `npm run build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/internal/workspace/WorkspaceFileGrid.tsx src/pages/internal/InternalWorkspace.tsx
git commit -m "feat(aios): Add-to-Strategy-library action on AIOS Drive files"
```

- [ ] **Step 5: Slice C integration check (manual, after deploys)**

Deploy `wiki-import-doc`. On `/internal/workspace`, open a Google Doc's menu → "Add to
Strategy library" → submit → confirm an import PR appears in Pending knowledge → Merge &
sync → confirm it lands in `/internal/strategy` with `source: workspace` frontmatter.

---

## Finalization (after all three slices)

- [ ] **Full build + test.** `npm run build` (PASS) and `npm run test` (the files you
  added show "passed, 0 failed"; ignore the pre-existing e2e exit-1).
- [ ] **Deploy all edge functions** via Supabase MCP (bundle transitive `_shared/`):
  `google-workspace-proxy`, `wiki-merge-pr`, `wiki-import-doc`. Flag the **founder-run
  `donny-chat` redeploy** for `workspace_read_file`.
- [ ] **Codex second review** (mandatory): `codex review --base main --title "AIOS workspace reading, library import, in-UI merge"`. Fix findings, re-run until clean.
- [ ] **`/code-review`** on the diff; apply fixes.
- [ ] **Verify prod** (both viewports, console clean) on `/internal/corrections`,
  `/internal/workspace`, `/internal/strategy` per the `verify-prod` skill.
- [ ] **Knowledge-sync** (per-session requirement): write a `docs/wiki/raw/sessions/`
  source, `/wiki-ops ingest`, refresh `PROJECT_CONTEXT.md` (new AIOS workstream bullet) +
  `DATABASE_SCHEMA.md` only if needed (no schema change here, so likely just
  PROJECT_CONTEXT). Open the PR; after merge, sync Donny's RAG.
- [ ] **Open the PR** for `feat/aios-workspace-knowledge-merge`.

## Risks & notes

- **Branch protection / CI on docs PRs** (Task B0): if required checks run on
  `docs/wiki/**` PRs, `Merge & sync` returns `not_mergeable_yet` until they pass — the
  panel surfaces a "checks running, retry" toast. This is expected, not a bug.
- **`GITHUB_WIKI_TOKEN` permissions:** merging needs Contents R/W **and** Pull Requests
  R/W. The token already has both (per spec §2). If a merge returns 403, re-check the
  fine-grained token's Pull Requests permission.
- **`donny-knowledge-sync` auth:** `wiki-merge-pr` calls it with the injected
  `SUPABASE_SERVICE_ROLE_KEY`, which `isAuthorizedIngest` accepts by exact match.
- **No schema migration, no new secret, no new OAuth scope** in this entire plan.
