# Save a Donny Answer to the Knowledge Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a founder-clicked, admin-gated "Save to knowledge" action on each internal Donny answer that opens a GitHub PR creating a new `docs/wiki/` page from the answer; on merge, the existing `donny-knowledge-sync` folds it into Donny's RAG.

**Architecture:** A new admin-gated `wiki-save-answer` edge function opens a PR (never pushes to `main`) adding `docs/wiki/<concepts|analyses>/<file>.md` built server-side from client-supplied field values. The frontend adds a pure helper lib (defaults + validation), a raw-`fetch` mutation hook, and a confirm-dialog button mounted beside the existing Export-to-Doc. No schema, no new secret — reuses `GITHUB_WIKI_TOKEN`.

**Tech Stack:** Deno edge function (Supabase), GitHub REST API (Contents + Pulls), React 18 + TypeScript, React Query, shadcn/ui Dialog, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-18-donny-answer-to-wiki-design.md` (read it before starting). Builds on the shipped `wiki-commit-pr` function (`supabase/functions/wiki-commit-pr/index.ts`) — mirror its GitHub plumbing, but this is a **separate** function with a tighter, client-input trust model.

**Conventions:** TypeScript strict; named exports for components; `dc-*` Tailwind tokens (no gray, no hardcoded hex); React Query hook naming `use<Entity><Action>`; ESLint allows only `console.error`/`console.warn`. Run from the worktree: `.claude/worktrees/DC-AIOS-SaveAnswer`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/internal/wikiSave.ts` (create) | Pure helpers: `slugify`, `deriveWikiDefaults`, `validateSaveInput`, `saveErrorMessage`. No React, no I/O — fully unit-testable. |
| `src/lib/internal/wikiSave.test.ts` (create) | Vitest for the above. |
| `supabase/functions/wiki-save-answer/index.ts` (create) | Admin-gated edge function: validate input → build page → open GitHub PR. |
| `supabase/config.toml` (modify) | Register `wiki-save-answer` with `verify_jwt = false`. |
| `src/hooks/internal/useSaveAnswerToWiki.ts` (create) | React Query mutation; raw `fetch` to the function (reads 200-with-error as data). |
| `src/components/internal/SaveToKnowledgeButton.tsx` (create) | Ghost button + confirm dialog (title/folder/filename/tags). |
| `src/pages/internal/InternalDonny.tsx` (modify) | Mount the button beside `ExportToDocButton`, pass the answer + preceding question. |

---

## Task 1: Pure client helpers (`wikiSave.ts`) — TDD

**Files:**
- Create: `src/lib/internal/wikiSave.ts`
- Test: `src/lib/internal/wikiSave.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/internal/wikiSave.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugify, deriveWikiDefaults, validateSaveInput, saveErrorMessage } from './wikiSave';

describe('slugify', () => {
  it('lowercases, strips punctuation, collapses to hyphens', () => {
    expect(slugify('Hello, World! Q3 2026')).toBe('hello-world-q3-2026');
  });
  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Pricing--  ')).toBe('pricing');
  });
  it('falls back when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('donny-answer');
  });
});

describe('deriveWikiDefaults', () => {
  it('uses the first markdown heading as the title', () => {
    const d = deriveWikiDefaults('# Take-rate ladder\n\nSome body text.');
    expect(d.title).toBe('Take-rate ladder');
    expect(d.folder).toBe('analyses');
    expect(d.filename).toBe('take-rate-ladder');
  });
  it('falls back to the first sentence when there is no heading', () => {
    const d = deriveWikiDefaults('Our CAC payback is 9 months. More detail follows.');
    expect(d.title).toBe('Our CAC payback is 9 months');
    expect(d.filename).toBe('our-cac-payback-is-9-months');
  });
  it('handles empty input without throwing', () => {
    const d = deriveWikiDefaults('');
    expect(d.title).toBe('Donny answer');
    expect(d.filename).toBe('donny-answer');
  });
});

describe('validateSaveInput', () => {
  it('accepts a valid input', () => {
    expect(validateSaveInput({ folder: 'analyses', filename: 'pricing-notes', title: 'Pricing notes' }).ok).toBe(true);
  });
  it('rejects an out-of-whitelist folder', () => {
    expect(validateSaveInput({ folder: 'entities', filename: 'x', title: 'X' }).ok).toBe(false);
  });
  it('rejects an empty title', () => {
    expect(validateSaveInput({ folder: 'concepts', filename: 'x', title: '   ' }).ok).toBe(false);
  });
  it('rejects bad filenames (uppercase, leading hyphen, slash, dotted)', () => {
    expect(validateSaveInput({ folder: 'concepts', filename: 'Bad', title: 'T' }).ok).toBe(false);
    expect(validateSaveInput({ folder: 'concepts', filename: '-bad', title: 'T' }).ok).toBe(false);
    expect(validateSaveInput({ folder: 'concepts', filename: 'a/b', title: 'T' }).ok).toBe(false);
    expect(validateSaveInput({ folder: 'concepts', filename: 'a.md', title: 'T' }).ok).toBe(false);
  });
});

describe('saveErrorMessage', () => {
  it('maps github_not_configured to a setup hint', () => {
    expect(saveErrorMessage('github_not_configured')).toMatch(/GITHUB_WIKI_TOKEN/);
  });
  it('maps file_exists to a rename hint', () => {
    expect(saveErrorMessage('file_exists')).toMatch(/already exists/i);
  });
  it('passes other messages through unchanged', () => {
    expect(saveErrorMessage('github put 502')).toBe('github put 502');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/internal/wikiSave.test.ts`
Expected: FAIL — `wikiSave.ts` does not exist / functions not defined.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/internal/wikiSave.ts`:

```ts
export type WikiFolder = 'concepts' | 'analyses';

const FOLDERS: WikiFolder[] = ['concepts', 'analyses'];
const FILENAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Title → safe kebab filename stem (no extension). Always returns a usable slug. */
export function slugify(title: string): string {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'donny-answer';
}

/** Deterministic defaults for the save dialog, derived from the answer markdown. */
export function deriveWikiDefaults(markdown: string): { title: string; folder: WikiFolder; filename: string } {
  const text = (markdown ?? '').trim();
  const heading = text.match(/^#{1,6}\s+(.+?)\s*#*$/m);
  let title = heading ? heading[1].trim() : '';
  if (!title) {
    const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    const sentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
    title = sentence.replace(/[#>*_`[\]]/g, '').trim();
  }
  title = title.slice(0, 120).trim() || 'Donny answer';
  return { title, folder: 'analyses', filename: slugify(title) };
}

/** Mirror of the wiki-save-answer edge guard so the UI never submits an invalid save. */
export function validateSaveInput(input: { folder: string; filename: string; title: string }): { ok: boolean; error?: string } {
  if (!FOLDERS.includes(input.folder as WikiFolder)) return { ok: false, error: 'Pick a folder (concepts or analyses).' };
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' };
  if (!FILENAME_RE.test(input.filename)) {
    return { ok: false, error: 'Filename: lowercase letters, numbers and hyphens, starting with a letter or number.' };
  }
  return { ok: true };
}

/** Turn a wiki-save edge error into user-facing copy. */
export function saveErrorMessage(error: string): string {
  if (error === 'github_not_configured') return 'Add GITHUB_WIKI_TOKEN to the edge function to enable wiki PRs.';
  if (error === 'file_exists') return 'A wiki page with that filename already exists — choose a different filename.';
  return error;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/internal/wikiSave.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/internal/wikiSave.ts src/lib/internal/wikiSave.test.ts
git commit -m "feat(aios): wikiSave helpers — defaults, validation, error copy"
```

---

## Task 2: `wiki-save-answer` edge function + config

**Files:**
- Create: `supabase/functions/wiki-save-answer/index.ts`
- Modify: `supabase/config.toml`

No unit test (Deno + live GitHub aren't unit-testable in this repo) — validated by staging E2E in Task 6, following the `wiki-commit-pr` precedent.

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/wiki-save-answer/index.ts`:

```ts
// wiki-save-answer
// Admin-clicked: opens a GitHub PR creating a NEW docs/wiki/ page from an
// internal Donny answer, so the answer becomes durable knowledge Donny recalls
// after the next donny-knowledge-sync.
//
// - PR-only. Never pushes to base. Never auto-merges.
// - Sibling of wiki-commit-pr, NOT a reuse: wiki-commit-pr re-derives path+content
//   from a server-side correction row; this has no row, so it accepts client
//   field values under a STRICTER guard (admin gate, 2-folder whitelist, kebab
//   filename, server-built frontmatter). PR review is the final backstop.
// - file_exists (page already on base) and github_not_configured are typed 200s.

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
// Own, tighter regex — 2 folders only (NOT wiki-commit-pr's 3-folder one).
const SAVE_PATH_RE = /^docs\/wiki\/(concepts|analyses)\/[a-z0-9][a-z0-9-]*\.md$/;
const FILENAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const FOLDERS = ["concepts", "analyses"];
const TYPE_BY_FOLDER: Record<string, string> = { concepts: "concept", analyses: "analysis" };

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "dragoncandy-wiki-save",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// btoa needs a binary string; encode UTF-8 first so non-ASCII markdown survives.
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeContent(b64: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(b64.replace(/\n/g, "")), (ch) => ch.charCodeAt(0)),
  );
}

/** Build the full page server-side. Client supplies field VALUES only. */
function buildPage(opts: {
  title: string; folder: string; tags: string[]; markdown: string; question: string; today: string;
}): string {
  const { title, folder, tags, markdown, question, today } = opts;
  const safeTitle = title.replace(/"/g, '\\"');
  const fm = [
    "---",
    `title: "${safeTitle}"`,
    `type: ${TYPE_BY_FOLDER[folder]}`,
    `created: ${today}`,
    `updated: ${today}`,
    "sources: [donny-answer]",
    `tags: [${tags.join(", ")}]`,
    "---",
    "",
    `# ${title}`,
    "",
  ];
  const oneLineQ = question.replace(/\s+/g, " ").trim();
  const provenance = oneLineQ
    ? [`> Captured from an internal Donny answer on ${today}, in response to:`, `> "${oneLineQ}"`, ""]
    : [`> Captured from an internal Donny answer on ${today}.`, ""];
  return [...fm, ...provenance, markdown.trim(), ""].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  // --- Admin auth (same gate as wiki-commit-pr / aios_corrections_apply) ---
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

  // --- Input ---
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const folder = String(body.folder ?? "");
  const filename = String(body.filename ?? "");
  const title = String(body.title ?? "").trim();
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  const question = typeof body.question === "string" ? body.question : "";
  const tags = Array.isArray(body.tags)
    ? body.tags
        .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  if (!FOLDERS.includes(folder)) return json({ error: "invalid_folder" }, 400);
  if (!FILENAME_RE.test(filename)) return json({ error: "invalid_filename" }, 400);
  if (!title) return json({ error: "title required" }, 400);
  if (!markdown.trim()) return json({ error: "empty markdown" }, 400);
  const path = `docs/wiki/${folder}/${filename}.md`;
  if (!SAVE_PATH_RE.test(path)) return json({ error: "invalid_path" }, 400);

  // Token last, so auth/validation errors surface before the config hint.
  if (!GITHUB_TOKEN) return json({ error: "github_not_configured" }, 200);

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. base head SHA
    const refRes = await fetch(`${GH}/repos/${REPO}/git/ref/heads/${BASE}`, { headers: ghHeaders() });
    if (!refRes.ok) return json({ error: `github base ref ${refRes.status}` }, 502);
    const baseSha = (await refRes.json()).object.sha;

    // 2. collision: refuse to overwrite a page that already exists on base.
    //    (A page only on a reused branch is fine — handled at PUT below.)
    const baseFileRes = await fetch(
      `${GH}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(BASE)}`,
      { headers: ghHeaders() },
    );
    if (baseFileRes.ok) return json({ error: "file_exists" }, 200);
    if (baseFileRes.status !== 404) return json({ error: `github get-contents ${baseFileRes.status}` }, 502);

    // 3. branch — filename-derived ⇒ re-saving the same page recovers the same
    //    branch/PR (idempotent, retry-safe).
    const branch = `donny-wiki-answer/${filename}`;
    const brRes = await fetch(`${GH}/repos/${REPO}/git/refs`, {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });
    if (!brRes.ok && brRes.status !== 422) {
      return json({ error: `github branch ${brRes.status}` }, 502);
    }

    const content = buildPage({ title, folder, tags, markdown, question, today });

    // 4. existing file on the BRANCH (a prior partial run) → reuse its sha so the
    //    PUT updates cleanly; skip the PUT if the bytes already match.
    const onBranchRes = await fetch(
      `${GH}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders() },
    );
    let existingSha: string | undefined;
    let existingMd: string | null = null;
    if (onBranchRes.ok) {
      const f = await onBranchRes.json();
      existingSha = f.sha;
      existingMd = decodeContent(f.content);
    } else if (onBranchRes.status !== 404) {
      return json({ error: `github get-contents ${onBranchRes.status}` }, 502);
    }

    if (existingMd !== content) {
      const putRes = await fetch(`${GH}/repos/${REPO}/contents/${path}`, {
        method: "PUT",
        headers: ghHeaders(),
        body: JSON.stringify({
          message: `docs(wiki): save Donny answer — ${title}`,
          content: toBase64(content),
          branch,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      });
      if (!putRes.ok && putRes.status !== 422) {
        return json({ error: `github put ${putRes.status}` }, 502);
      }
    }

    // 5. PR — recover the existing open PR if the branch already has one (prior
    //    run created it but died before returning, or two admins raced).
    const prRes = await fetch(`${GH}/repos/${REPO}/pulls`, {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({
        title: `Wiki: ${title}`,
        head: branch,
        base: BASE,
        body: `New knowledge-base page captured from an internal Donny answer.\n\nPath: \`${path}\`\n\nReview and merge to add it to Donny's RAG on the next sync.`,
      }),
    });
    let pr: { html_url: string; number: number };
    if (prRes.ok) {
      pr = await prRes.json();
    } else if (prRes.status === 422) {
      const owner = REPO.split("/")[0];
      const listRes = await fetch(
        `${GH}/repos/${REPO}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=open`,
        { headers: ghHeaders() },
      );
      const list = listRes.ok ? await listRes.json() : [];
      if (!Array.isArray(list) || list.length === 0) {
        return json({ error: "github pr 422 (no open PR found for branch)" }, 502);
      }
      pr = list[0];
    } else {
      return json({ error: `github pr ${prRes.status}` }, 502);
    }

    return json({ url: pr.html_url, number: pr.number });
  } catch (e) {
    return json({ error: `save failed: ${(e as Error).message}` }, 502);
  }
});
```

- [ ] **Step 2: Register the function in `supabase/config.toml`**

Append after the `[functions.wiki-commit-pr]` block:

```toml
# Browser-invoked from /internal/donny; does its own admin check (auth.getUser
# + user_roles role 'admin'), so the gateway JWT check must be off or it would
# reject the unauthenticated CORS preflight. Same posture as wiki-commit-pr.
[functions.wiki-save-answer]
verify_jwt = false
```

- [ ] **Step 3: Sanity-check it bundles (typecheck the import graph)**

The function only imports `../_shared/cors.ts` (already used by `wiki-commit-pr`). Confirm the file exists:

Run: `ls supabase/functions/_shared/cors.ts`
Expected: the file is listed (no new shared deps to bundle).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/wiki-save-answer/index.ts supabase/config.toml
git commit -m "feat(aios): wiki-save-answer edge function — PR a new wiki page from a Donny answer"
```

---

## Task 3: `useSaveAnswerToWiki` mutation hook

**Files:**
- Create: `src/hooks/internal/useSaveAnswerToWiki.ts`

Mirrors `useCommitWikiPr` (`src/hooks/internal/useCorrections.ts:101`): raw `fetch` (not `supabase.functions.invoke`) so a 200-with-error body surfaces as data, not a throw.

- [ ] **Step 1: Write the hook**

Create `src/hooks/internal/useSaveAnswerToWiki.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SaveAnswerInput {
  folder: 'concepts' | 'analyses';
  filename: string;
  title: string;
  tags?: string[];
  markdown: string;
  question?: string;
}

export interface SaveAnswerResult {
  url?: string;
  number?: number;
  error?: string;
}

/** Open a GitHub PR creating a new wiki page from an internal Donny answer. */
export function useSaveAnswerToWiki() {
  return useMutation({
    mutationFn: async (input: SaveAnswerInput): Promise<SaveAnswerResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wiki-save-answer`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(input),
        },
      );
      const data = (await res.json().catch(() => ({}))) as SaveAnswerResult;
      // file_exists / github_not_configured return 200 with an error field —
      // surface as data so the dialog can react (rename / show hint).
      if (!res.ok && !data.error) throw new Error('Save to knowledge failed');
      return data;
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/internal/useSaveAnswerToWiki.ts
git commit -m "feat(aios): useSaveAnswerToWiki mutation hook"
```

---

## Task 4: `SaveToKnowledgeButton` (button + confirm dialog)

**Files:**
- Create: `src/components/internal/SaveToKnowledgeButton.tsx`

Follows the `ExportToDocButton` ghost style (`src/components/internal/ExportToDocButton.tsx`) and the `NameDialog` dialog pattern (`src/components/internal/workspace/NameDialog.tsx`).

> **Preview scope (deliberate):** the spec's "preview" is satisfied by the live **path** preview (`docs/wiki/<folder>/<filename>.md`) plus inline validation — not a full rendered-frontmatter preview. The frontmatter is built server-side and the confirm dialog already provides the human gate, so a path preview is the YAGNI-correct amount of preview. Do not build a frontmatter renderer.

- [ ] **Step 1: Write the component**

Create `src/components/internal/SaveToKnowledgeButton.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { BookPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { deriveWikiDefaults, validateSaveInput, saveErrorMessage, type WikiFolder } from '@/lib/internal/wikiSave';
import { useSaveAnswerToWiki } from '@/hooks/internal/useSaveAnswerToWiki';

interface SaveToKnowledgeButtonProps {
  /** The Donny answer markdown to capture. */
  markdown: string;
  /** The founder question that produced the answer (for traceability). */
  question?: string;
}

/** "Save to knowledge" — opens a GitHub PR creating a new docs/wiki/ page. */
export const SaveToKnowledgeButton = ({ markdown, question }: SaveToKnowledgeButtonProps) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<WikiFolder>('analyses');
  const [filename, setFilename] = useState('');
  const [tags, setTags] = useState('');
  const save = useSaveAnswerToWiki();

  // Re-derive defaults each time the dialog opens for this answer.
  useEffect(() => {
    if (!open) return;
    const d = deriveWikiDefaults(markdown);
    setTitle(d.title);
    setFolder(d.folder);
    setFilename(d.filename);
    setTags('');
  }, [open, markdown]);

  const validation = validateSaveInput({ folder, filename, title });

  const run = () => {
    save.mutate(
      {
        folder,
        filename,
        title: title.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        markdown,
        question,
      },
      {
        onSuccess: (data) => {
          if (data.error) {
            // file_exists / github_not_configured — keep the dialog open so the
            // founder can rename or read the hint.
            toast.error(saveErrorMessage(data.error));
            return;
          }
          toast.success('Wiki PR opened', {
            action: data.url
              ? { label: 'Open PR', onClick: () => window.open(data.url, '_blank', 'noopener') }
              : undefined,
          });
          setOpen(false);
        },
        onError: () => toast.error('Save failed — try again.'),
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white/50 transition-colors hover:bg-white/[0.06] hover:text-dc-teal"
      >
        <BookPlus className="h-3.5 w-3.5" />
        Save to knowledge
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Save to knowledge base</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-dc-text-muted">
              Title
              <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </label>

            <label className="block text-xs font-semibold text-dc-text-muted">
              Folder
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value as WikiFolder)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="analyses">analyses</option>
                <option value="concepts">concepts</option>
              </select>
            </label>

            <label className="block text-xs font-semibold text-dc-text-muted">
              Filename
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="mt-1"
              />
            </label>

            <label className="block text-xs font-semibold text-dc-text-muted">
              Tags (optional, comma-separated)
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="pricing, strategy" className="mt-1" />
            </label>

            <p className="text-xs text-dc-text-muted">
              Creates <code>docs/wiki/{folder}/{filename || '…'}.md</code> via a GitHub PR. It enters
              Donny's knowledge on the next sync after you merge.
            </p>
            {!validation.ok && <p className="text-xs text-dc-pink-accent">{validation.error}</p>}

            <button
              type="button"
              disabled={!validation.ok || save.isPending}
              onClick={run}
              className="w-full rounded-full bg-dc-teal px-6 py-2.5 font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark disabled:opacity-50"
            >
              {save.isPending ? 'Opening PR…' : 'Open wiki PR'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (If lint flags the `data.url` capture inside the toast action closure, it is fine — `data` is in scope.)

- [ ] **Step 3: Commit**

```bash
git add src/components/internal/SaveToKnowledgeButton.tsx
git commit -m "feat(aios): SaveToKnowledgeButton — confirm dialog for saving a Donny answer to the wiki"
```

---

## Task 5: Mount the button on internal Donny answers

**Files:**
- Modify: `src/pages/internal/InternalDonny.tsx`

- [ ] **Step 1: Import the button**

Add after the `ExportToDocButton` import (line 7):

```tsx
import { SaveToKnowledgeButton } from '@/components/internal/SaveToKnowledgeButton';
```

- [ ] **Step 2: Render it beside Export-to-Doc, passing the preceding question**

Replace the assistant-answer block (currently lines 64–72):

```tsx
              {msg.role === 'assistant' && msg.content && (
                <div className="mt-1 flex justify-start pl-2">
                  <ExportToDocButton
                    variant="ghost"
                    title={`Donny — ${new Date(msg.created_at ?? Date.now()).toLocaleDateString()}`}
                    markdown={msg.content}
                  />
                </div>
              )}
```

with:

```tsx
              {msg.role === 'assistant' && msg.content && (
                <div className="mt-1 flex justify-start gap-2 pl-2">
                  <ExportToDocButton
                    variant="ghost"
                    title={`Donny — ${new Date(msg.created_at ?? Date.now()).toLocaleDateString()}`}
                    markdown={msg.content}
                  />
                  <SaveToKnowledgeButton
                    markdown={msg.content}
                    question={messages[i - 1]?.role === 'user' ? messages[i - 1].content ?? undefined : undefined}
                  />
                </div>
              )}
```

(`i` is the map index already in scope at `messages.map((msg, i) => ...)`; the preceding user turn is the originating question. `DonnyMessage.content` is `string | null`, but the prop is `string | undefined` — the `?? undefined` coalesces the `null` branch so strict-mode typecheck passes.)

- [ ] **Step 3: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS — clean production build.

- [ ] **Step 4: Commit**

```bash
git add src/pages/internal/InternalDonny.tsx
git commit -m "feat(aios): Save-to-knowledge button on internal Donny answers"
```

---

## Task 6: Full verification, deploy, and staging E2E

**Files:** none (verification + deploy).

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/internal/wikiSave.test.ts && npm run build`
Expected: typecheck clean, lint clean, wikiSave tests green, build succeeds.
(Note: `npm run test` exits non-zero from pre-existing nested e2e files — trust the per-file vitest run, not the global exit code. See project memory "Vitest pre-existing file failures".)

- [ ] **Step 2: Deploy `wiki-save-answer` to STAGING and bundle-check**

Edge functions are NOT deployed by the Lovable push (frontend only). Deploy via the Supabase MCP `deploy_edge_function` to staging (`mhffqrawgizhprbobcta`), bundling `index.ts` + `_shared/cors.ts`, with `verify_jwt = false`. Confirm a boot/guard response (an unauthenticated `OPTIONS` returns CORS headers; an unauthenticated `POST` returns 401 `unauthorized`).

- [ ] **Step 3: Staging E2E (real PR lifecycle)**

As a staging admin on `/internal/donny`, ask a question, click **Save to knowledge** on the answer, and verify:
1. Default title/folder/filename pre-fill from the answer; the path preview updates live.
2. **Open wiki PR** opens a real PR adding `docs/wiki/analyses/<file>.md` with the question quoted above the answer and server-built frontmatter (`type: analysis`, `sources: [donny-answer]`).
3. **Re-saving the same answer/filename** recovers the *same* PR (idempotent), no duplicate.
4. Saving with a **filename that already exists on `main`** shows the "already exists — choose a different filename" toast and keeps the dialog open.
5. Close the test PR and delete its branch (cleanup).

- [ ] **Step 4: Codex second review (required before PR)**

Run from the worktree: `codex review --base main --title "wiki-save-answer: save Donny answer to knowledge base"`. Fix any real findings; re-run until clean. Relay the verdict.

- [ ] **Step 5: Knowledge-sync + finish the branch**

Invoke the **`knowledge-sync`** skill (raw session source → `/wiki-ops ingest` → refresh `PROJECT_CONTEXT.md` AIOS workstream bullet → after merge, RAG sync). Then **`finishing-a-development-branch`**: open the PR (build green, reviews passed), and after merge deploy `wiki-save-answer` to **prod** (`zocahiffooqdybdhguqv`, `verify_jwt = false`) and run `verify-prod` (the live Save-to-knowledge click on `internal.dragoncandy.io`).

---

## Done When

- `wikiSave.test.ts` green; `typecheck`/`lint`/`build` clean.
- `wiki-save-answer` deployed (staging, then prod) with `verify_jwt = false`; admin-gated; `github_not_configured`/`file_exists` are typed 200s.
- Staging E2E proves PR creation, idempotent re-save, and the `file_exists` guard.
- A **Save to knowledge** button sits beside Export-to-Doc on every internal Donny answer and opens a reviewable wiki PR.
- Codex pass clean; knowledge layer (wiki + PROJECT_CONTEXT + Donny RAG after merge) reflects the feature.
```
