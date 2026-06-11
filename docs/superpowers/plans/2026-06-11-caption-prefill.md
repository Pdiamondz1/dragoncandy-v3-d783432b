# Caption Field + Brief Caption Pre-fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-on optional caption field to the DragonShare creator submit form, pre-filled (editable) from a content brief's `sample_caption` + `hashtags` when the creator arrives via the "Make it & submit" CTA; persist it to the existing `dragonshare_posts.caption` column.

**Architecture:** Frontend-only. A pure `composeCaption` helper joins the brief's caption + hashtags. `usePreselectedOrg` (already fetching the brief row to validate the Slice-2 link) additionally reads the brief jsonb and derives `prefillCaption`, threaded as a prop to both submit surfaces. `useDragonShareSubmitForm` gains caption state (draft-persisted, seeded-once from the prefill without clobbering a restored draft) and sends it in the existing insert. The mutation's insert/select already carry `caption` (shipped with Slice 2's `source_brief_id`), so the only change there is a one-line arg-type widen.

**Tech Stack:** React 18 + TypeScript (strict), Vitest, React Query, Supabase JS v2, Tailwind (`dc-*` tokens).

**Spec:** `docs/superpowers/specs/2026-06-11-caption-prefill-design.md`

**No DB migration. No RLS change. No edge-function change.**

---

## Reference: current state (verified against the worktree)

- `src/hooks/useDragonShare.ts:59-103` — `useSubmitDragonSharePost`. Arg type has `caption?: string` (`:69`);
  insert already includes `caption: post.caption ?? null` (`:85`); select already lists `caption` (`:89`).
- `src/hooks/useDragonShareSubmitForm.ts` — draft pattern: `DragonShareDraft` interface (`:16-21`),
  `EMPTY_DRAFT` (`:23-28`), `loadDraft()` (`:30-44`), `initialDraft` + state init from it (`:59-63`),
  sync `useEffect` with early-out `if (!uploadedUrl && !postUrl.trim())` (`:75-88`), `reset()` (`:98-105`),
  `handleSubmit` `mutateAsync` payload (`:140-147`), captured-brief pattern (`:67-72`), return object
  (`:159-182`). `useRef` is already imported (`:2`).
- `src/pages/CreatorDragonShare.tsx:37-84` — `usePreselectedOrg`. Brief-validation query selects only
  `organization_id` (`:57-70`); returns `{ org, sourceBriefId }` (`:83`). Call site `:93`. Desktop inline
  form rendered persistently inside `hidden lg:block` (`:139-141`); mobile sheet conditionally mounted via
  `open` inside `lg:hidden` (`:197-199`).
- `src/components/dragonshare/DragonShareInlineForm.tsx` — Props `{ preselectedOrg?, sourceBriefId? }` (`:20-23`),
  `useDragonShareSubmitForm(sourceBriefId)` (`:26`). Post Link block (`:45-70`), Tag Restaurant block (`:72-82`).
- `src/components/dragonshare/DragonShareSubmitSheet.tsx` — Props (`:21-26`),
  `useDragonShareSubmitForm(sourceBriefId)` (`:29`). Post Link block (`:56-81`), Tag Restaurant block (`:83-94`).
- `supabase/functions/content-strategy-recommend/brief.ts:45-54` — `ContentBrief` has
  `sample_caption: string`, `hashtags: string[]`.
- `supabase/functions/content-strategy-recommend/index.ts:178-185` — persists `brief: parsed` (full brief) into
  `content_briefs.brief`, so `brief.sample_caption` / `brief.hashtags` are top-level.

---

## Task 1: `composeCaption` pure helper + unit test

**Files:**
- Create: `src/lib/composeCaption.ts`
- Create: `src/lib/composeCaption.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/composeCaption.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeCaption } from './composeCaption';

describe('composeCaption', () => {
  it('returns caption only when there are no hashtags', () => {
    expect(composeCaption('Behind the counter at Rocco\'s', [])).toBe("Behind the counter at Rocco's");
  });

  it('joins caption and hashtags on a blank line', () => {
    expect(composeCaption('Pizza night', ['#hoboken', '#pizza'])).toBe('Pizza night\n\n#hoboken #pizza');
  });

  it('normalizes hashtags missing the leading #', () => {
    expect(composeCaption('Yum', ['hoboken', 'pizza'])).toBe('Yum\n\n#hoboken #pizza');
  });

  it('returns hashtags only when caption is empty', () => {
    expect(composeCaption('', ['#a', '#b'])).toBe('#a #b');
  });

  it('returns hashtags only when caption is whitespace', () => {
    expect(composeCaption('   ', ['#a'])).toBe('#a');
  });

  it('returns empty string when both are empty or missing', () => {
    expect(composeCaption('', [])).toBe('');
    expect(composeCaption(null, null)).toBe('');
    expect(composeCaption(undefined, undefined)).toBe('');
  });

  it('drops blank hashtags', () => {
    expect(composeCaption('Hi', ['#a', '  ', ''])).toBe('Hi\n\n#a');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/composeCaption.test.ts`
Expected: FAIL — cannot resolve `./composeCaption` (module not found).

- [ ] **Step 3: Write the minimal implementation**

`src/lib/composeCaption.ts`:

```ts
/** Join a brief's caption with its hashtags for pre-filling the DragonShare caption field.
 *  Hashtags are appended on a blank line only when present; each is normalized to start with '#'.
 *  Pure — no React, no I/O. Safe against null/undefined and non-string hashtag entries. */
export function composeCaption(sampleCaption?: string | null, hashtags?: string[] | null): string {
  const caption = (sampleCaption ?? '').trim();
  const tags = (hashtags ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  if (!caption && tags.length === 0) return '';
  if (tags.length === 0) return caption;
  if (!caption) return tags.join(' ');
  return `${caption}\n\n${tags.join(' ')}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/composeCaption.test.ts`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/composeCaption.ts src/lib/composeCaption.test.ts
git commit -m "feat(dragonshare): composeCaption helper for brief caption pre-fill"
```

---

## Task 2: Widen the mutation arg type (`useSubmitDragonSharePost`)

**Files:**
- Modify: `src/hooks/useDragonShare.ts:69`

This is the entire C3 deliverable — the insert (`:85`) and select (`:89`) already carry `caption`.

- [ ] **Step 1: Widen the type**

In `src/hooks/useDragonShare.ts`, in the `mutationFn` arg type, change:

```ts
      caption?: string;
```

to:

```ts
      caption?: string | null;
```

(So the form can pass `caption.trim() || null` without a TypeScript error.)

- [ ] **Step 2: Verify the build type-checks**

Run: `npm run typecheck`
Expected: PASS (no new errors). (This task alone won't surface the need — Task 3 is what passes `null` — but the
widen must land first.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDragonShare.ts
git commit -m "feat(dragonshare): allow null caption in submit mutation arg type"
```

---

## Task 3: Caption state in `useDragonShareSubmitForm`

**Files:**
- Modify: `src/hooks/useDragonShareSubmitForm.ts`

Adds caption state, draft persistence, seed-once-from-prefill (draft wins), reset, and the submit payload.
No unit test (the hook is exercised by the build + manual verification per the spec); correctness is checked
via `npm run build` and the Task 7 demo.

- [ ] **Step 1: Add `caption` to the draft interface + empties**

In the `DragonShareDraft` interface (`:16-21`), add a field:

```ts
interface DragonShareDraft {
  uploadedUrl: string | null;
  uploadedFileName: string | null;
  uploadedFileType: string | null;
  postUrl: string;
  caption: string;
}
```

In `EMPTY_DRAFT` (`:23-28`), add `caption: ''`:

```ts
const EMPTY_DRAFT: DragonShareDraft = {
  uploadedUrl: null,
  uploadedFileName: null,
  uploadedFileType: null,
  postUrl: '',
  caption: '',
};
```

In `loadDraft()`'s returned object (`:35-40`), add `caption: parsed.caption ?? ''`:

```ts
    return {
      uploadedUrl: parsed.uploadedUrl ?? null,
      uploadedFileName: parsed.uploadedFileName ?? null,
      uploadedFileType: parsed.uploadedFileType ?? null,
      postUrl: parsed.postUrl ?? '',
      caption: parsed.caption ?? '',
    };
```

- [ ] **Step 2: Widen the hook signature to accept `prefillCaption`**

Change the signature (`:54`) from:

```ts
export function useDragonShareSubmitForm(sourceBriefId?: string | null) {
```

to:

```ts
export function useDragonShareSubmitForm(
  sourceBriefId?: string | null,
  prefillCaption?: string | null,
) {
```

- [ ] **Step 3: Add caption state initialized from the draft**

After the existing `postUrl` state line (`:63` `const [postUrl, setPostUrl] = useState(initialDraft.postUrl);`),
add:

```ts
  const [caption, setCaption] = useState(initialDraft.caption);
```

- [ ] **Step 4: Seed caption once from the prefill — without clobbering a restored draft**

Immediately after the captured-brief effect block (`:67-72`, which ends with the `useEffect` closing
`}, [sourceBriefId]);`), add:

```ts
  // Seed the caption from a brief prefill exactly once. Start "already seeded" if the restored
  // draft already had a caption, so a from-brief prefill never overwrites text the creator typed
  // before navigating away and back (restored draft wins).
  const seededCaptionRef = useRef(!!initialDraft.caption.trim());
  useEffect(() => {
    if (prefillCaption && !seededCaptionRef.current) {
      setCaption(prefillCaption);
      seededCaptionRef.current = true;
    }
  }, [prefillCaption]);
```

(`useRef` is already imported at `:2`.)

- [ ] **Step 5: Persist caption in the draft sync effect**

In the draft-sync `useEffect` (`:75-88`), update BOTH the early-out guard and the serialized payload.

Change the guard (`:76`) from:

```ts
    if (!uploadedUrl && !postUrl.trim()) {
```

to:

```ts
    if (!uploadedUrl && !postUrl.trim() && !caption.trim()) {
```

Change the `JSON.stringify(...)` payload (`:83`) from:

```ts
        JSON.stringify({ uploadedUrl, uploadedFileName, uploadedFileType, postUrl }),
```

to:

```ts
        JSON.stringify({ uploadedUrl, uploadedFileName, uploadedFileType, postUrl, caption }),
```

And add `caption` to that effect's dependency array (`:88`) — change:

```ts
  }, [uploadedUrl, uploadedFileName, uploadedFileType, postUrl]);
```

to:

```ts
  }, [uploadedUrl, uploadedFileName, uploadedFileType, postUrl, caption]);
```

- [ ] **Step 6: Clear caption in `reset()`**

In `reset()` (`:98-105`), add `setCaption('')` (leave `seededCaptionRef` as-is — the desktop inline form stays
mounted after submit and we do NOT want to re-inject the brief caption onto the now-clean form):

```ts
  function reset() {
    setUploadedUrl(null);
    setUploadedFileName(null);
    setUploadedFileType(null);
    setPostUrl('');
    setSelectedOrg(null);
    setCapturedBriefId(null);
    setCaption('');
  }
```

- [ ] **Step 7: Send caption in `handleSubmit`**

In `handleSubmit`'s `mutateAsync` payload (`:140-147`), add the caption line:

```ts
      await submitMutation.mutateAsync({
        target_org_id: selectedOrg.id,
        content_type: contentType ?? 'photo',
        post_url: postUrl.trim() || null,
        platform: detectedPlatform,
        content_file_path: uploadedUrl,
        source_brief_id: capturedBriefId,
        caption: caption.trim() || null,
      });
```

- [ ] **Step 8: Expose caption in the return object**

In the returned object (`:159-182`), add `caption` and `setCaption` to the `// State` group (e.g. right after
the `postUrl, setPostUrl,` lines):

```ts
    caption,
    setCaption,
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Passing `caption.trim() || null` now type-checks thanks to Task 2.)

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useDragonShareSubmitForm.ts
git commit -m "feat(dragonshare): caption state, draft persistence, and prefill seeding in submit form hook"
```

---

## Task 4: Derive `prefillCaption` in `usePreselectedOrg` (CreatorDragonShare)

**Files:**
- Modify: `src/pages/CreatorDragonShare.tsx`

- [ ] **Step 1: Import `composeCaption`**

Add to the imports (near `:23` where `supabase` is imported):

```ts
import { composeCaption } from '@/lib/composeCaption';
```

- [ ] **Step 2: Add a minimal brief-shape type**

Above `usePreselectedOrg` (near `:37`), add:

```ts
type ContentBriefShape = { sample_caption?: string; hashtags?: string[] };
```

- [ ] **Step 3: Extend the brief query to read `brief` and derive `prefillCaption`**

Replace the existing brief-validation query + derivation (`:57-72`) — currently:

```ts
  // Validate the brief is the creator's own (RLS) AND targets the same org.
  const { data: briefOrgId } = useQuery({
    queryKey: ['preselected-brief', briefId],
    queryFn: async (): Promise<string | null> => {
      if (!briefId) return null;
      const { data, error } = await supabase
        .from('content_briefs')
        .select('organization_id')
        .eq('id', briefId)
        .maybeSingle();
      if (error || !data) return null;
      return data.organization_id as string;
    },
    enabled: !!briefId,
  });

  const sourceBriefId = briefId && org && briefOrgId === org.id ? briefId : null;
```

with:

```ts
  // Validate the brief is the creator's own (RLS) AND targets the same org; also read the brief
  // jsonb so we can pre-fill the caption.
  const { data: briefRow } = useQuery({
    queryKey: ['preselected-brief', briefId],
    queryFn: async (): Promise<{ organization_id: string; brief: ContentBriefShape } | null> => {
      if (!briefId) return null;
      const { data, error } = await supabase
        .from('content_briefs')
        .select('organization_id, brief')
        .eq('id', briefId)
        .maybeSingle();
      if (error || !data) return null;
      return data as { organization_id: string; brief: ContentBriefShape };
    },
    enabled: !!briefId,
  });

  const briefOrgId = briefRow?.organization_id ?? null;
  const sourceBriefId = briefId && org && briefOrgId === org.id ? briefId : null;
  // Only pre-fill when the link is valid (owned + org-matched), so a stale/hand-edited URL never injects text.
  const prefillCaption =
    sourceBriefId && briefRow
      ? composeCaption(briefRow.brief?.sample_caption, briefRow.brief?.hashtags)
      : null;
```

- [ ] **Step 4: Return `prefillCaption`**

Change the hook's return (`:83`) from:

```ts
  return { org: org ?? null, sourceBriefId };
```

to:

```ts
  return { org: org ?? null, sourceBriefId, prefillCaption: prefillCaption || null };
```

- [ ] **Step 5: Destructure + thread it at the call site**

Change the call site (`:93`) from:

```ts
  const { org: preselectedOrg, sourceBriefId } = usePreselectedOrg();
```

to:

```ts
  const { org: preselectedOrg, sourceBriefId, prefillCaption } = usePreselectedOrg();
```

Then pass `prefillCaption` to the desktop inline form (`:140`):

```tsx
              <DragonShareInlineForm preselectedOrg={preselectedOrg} sourceBriefId={sourceBriefId} prefillCaption={prefillCaption} />
```

and to the mobile sheet (`:198`):

```tsx
          <DragonShareSubmitSheet open={submitOpen} onOpenChange={setSubmitOpen} preselectedOrg={preselectedOrg} sourceBriefId={sourceBriefId} prefillCaption={prefillCaption} />
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: It will FAIL on the two form components not yet accepting `prefillCaption` — that is expected and
fixed in Task 5. (If you prefer a green checkpoint, commit after Task 5.) The page itself should have no other
errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CreatorDragonShare.tsx
git commit -m "feat(dragonshare): derive prefillCaption from brief and thread to both submit forms"
```

---

## Task 5: Render the caption textarea in both forms

**Files:**
- Modify: `src/components/dragonshare/DragonShareInlineForm.tsx`
- Modify: `src/components/dragonshare/DragonShareSubmitSheet.tsx`

Place the caption block **after the Post Link block and before the Tag Restaurant block** in each form
(matching the accepted mockup). Use a plain `<textarea>` styled per the design system — white field, teal
focus, **no gray**; do not mimic the neighboring quick-tip / status-chip colors.

- [ ] **Step 1: DragonShareInlineForm — Props + hook arg**

Change Props (`:20-23`):

```ts
interface Props {
  preselectedOrg?: RestaurantSearchResult | null;
  sourceBriefId?: string | null;
  prefillCaption?: string | null;
}
```

Change the component signature + hook call (`:25-26`):

```ts
export function DragonShareInlineForm({ preselectedOrg, sourceBriefId, prefillCaption }: Props) {
  const form = useDragonShareSubmitForm(sourceBriefId, prefillCaption);
```

- [ ] **Step 2: DragonShareInlineForm — caption block**

Insert this block between the Post Link block (closes at `:70`) and the Tag Restaurant block (opens at `:72`):

```tsx
      {/* Caption (optional) */}
      <div>
        <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
          Caption <span className="text-dc-text-muted/60">(optional)</span>
        </label>
        <textarea
          value={form.caption}
          onChange={(e) => form.setCaption(e.target.value)}
          rows={4}
          placeholder="Add a caption…"
          className="w-full rounded-xl border border-dc-teal/30 bg-white p-3 text-sm text-dc-text placeholder:text-dc-text-muted/60 focus:outline-none focus:ring-2 focus:ring-dc-teal/50 resize-y"
        />
      </div>
```

- [ ] **Step 3: DragonShareSubmitSheet — Props + hook arg**

Change Props (`:21-26`):

```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedOrg?: RestaurantSearchResult | null;
  sourceBriefId?: string | null;
  prefillCaption?: string | null;
}
```

Change the component signature + hook call (`:28-29`):

```ts
export function DragonShareSubmitSheet({ open, onOpenChange, preselectedOrg, sourceBriefId, prefillCaption }: Props) {
  const form = useDragonShareSubmitForm(sourceBriefId, prefillCaption);
```

- [ ] **Step 4: DragonShareSubmitSheet — caption block**

Insert the SAME caption block between the Post Link block (closes at `:81`) and the Tag Restaurant block
(opens at `:83`):

```tsx
          {/* Caption (optional) */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Caption <span className="text-dc-text-muted/60">(optional)</span>
            </label>
            <textarea
              value={form.caption}
              onChange={(e) => form.setCaption(e.target.value)}
              rows={4}
              placeholder="Add a caption…"
              className="w-full rounded-xl border border-dc-teal/30 bg-white p-3 text-sm text-dc-text placeholder:text-dc-text-muted/60 focus:outline-none focus:ring-2 focus:ring-dc-teal/50 resize-y"
            />
          </div>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck`
Expected: PASS (now that both forms accept `prefillCaption`).

Run: `npm run lint`
Expected: no new errors (warnings tolerated per repo baseline).

- [ ] **Step 6: Commit**

```bash
git add src/components/dragonshare/DragonShareInlineForm.tsx src/components/dragonshare/DragonShareSubmitSheet.tsx
git commit -m "feat(dragonshare): caption textarea in inline form and submit sheet"
```

---

## Task 6: Build gate + full test run

**Files:** none (verification only).

- [ ] **Step 1: Run the caption helper test**

Run: `npx vitest run src/lib/composeCaption.test.ts`
Expected: PASS — 7/7.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors. (This is the project's release gate — must be green before push.)

- [ ] **Step 3: Commit (only if any incidental fixes were needed)**

```bash
git add -A
git commit -m "chore(dragonshare): build green for caption pre-fill slice"
```

(Skip if nothing changed.)

---

## Task 7: Manual verification (staging preview, then prod after merge)

**Files:** none. This is the demo gate; the user drives the live walkthrough, the controller verifies the DB.

No migration is involved, so there is nothing to apply to staging/prod ahead of the frontend — the caption
column already exists in both. The flow ships when the PR merges and Lovable redeploys.

- [ ] **Step 1: Open a PR; let the staging E2E/preview checks run.**

- [ ] **Step 2: From-brief pre-fill (desktop + mobile).** As a creator: generate a brief → tap
  "Make it & submit" → confirm the **Caption (optional)** field is pre-filled with the brief's caption +
  hashtags, on **desktop (inline form)** and **mobile (sheet)**, and is **editable** (type into it; the edit
  survives a re-render).

- [ ] **Step 3: Submit + DB check.** Edit the caption, upload content, submit. Controller runs (via Supabase
  MCP, prod ref `zocahiffooqdybdhguqv` after merge / staging `mhffqrawgizhprbobcta` for preview):

  ```sql
  select id, target_org_id, source_brief_id, caption, created_at
  from dragonshare_posts
  where source_brief_id is not null
  order by created_at desc
  limit 1;
  ```

  Expected: the row has both `source_brief_id` = the brief's id AND `caption` = the (edited) text.

- [ ] **Step 4: Draft survival.** From a brief, type a caption, click "Browse all restaurants" and return →
  caption is still present (sessionStorage draft).

- [ ] **Step 5: Regression.** A normal submission (no `?brief=`, caption left blank) still works and stores
  `caption = null` and `source_brief_id = null`.

- [ ] **Step 6: Defensive.** A `?brief=` whose org ≠ `?restaurant=` (or a garbage id) → no caption pre-filled,
  restaurant still pre-fills, no link stored.

- [ ] **Step 7: Refresh local main** after merge per the worktree workflow
  (`git -C C:/GIT/dragoncandy-v3-d783432b fetch origin && … merge --ff-only origin/main`).

---

## Notes for the implementer

- **Worktree discipline:** work ONLY inside `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\autoresearch`.
  Confirm with `git rev-parse --abbrev-ref HEAD` (should be `feat/caption-prefill`). Never edit the main
  checkout at `C:\GIT\dragoncandy-v3-d783432b`.
- **No gray:** the new textarea uses white bg + teal border/focus. Do not copy the sheet's `bg-dc-dark/5`
  quick-tip or the page's `bg-green-100`/`bg-red-100` status chips.
- **Desktop vs mobile:** the inline form is the desktop surface, the sheet is mobile — the caption block is
  identical markup in both; no `lg:`-prefixed divergence is needed for it. Verify both viewports.
- **DRY:** the caption block markup is duplicated across the two forms by design (they don't currently share a
  field-level subcomponent, and the spec doesn't call for one); keep them identical.
```
