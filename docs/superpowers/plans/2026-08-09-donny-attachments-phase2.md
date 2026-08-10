# Donny Attachments (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach images, documents, videos and links to a Donny prompt, and have Donny actually read them.

**Architecture:** Files upload to a new private `donny-attachments` bucket under `${auth.uid()}/`, and only their **paths** are persisted — never a URL, because a signed URL expires and a public URL would leak the bucket. The client carries the attachment descriptors two ways: in the `donny-orchestrator` request body (so the model sees them this turn) and onto the `donny_messages` row (so they redisplay). The orchestrator downloads each path with the **service-role key** — which bypasses storage RLS — so a server-side path-ownership check is the only thing standing between a user and someone else's file.

**Tech Stack:** React 18 + TypeScript (strict), Supabase Storage + Postgres, Deno edge function, Anthropic Messages API content blocks, Tavily (existing `read_url`).

## Global Constraints

- **Ownership invariant (verbatim from spec §5.2):** *The bucket is a server-side constant, and every `path` must begin with `${ctx.userId}/` — where `ctx.userId` comes from `auth.getUser()`, never from the request body. A path failing that check is rejected, and the whole request fails rather than silently dropping the attachment.*
- Attachment descriptor is exactly `{ path, mime, size_bytes, name, kind }`. **No `bucket` field** — the bucket is a server constant. **No URL field** — see Architecture.
- `kind ∈ 'image' | 'video' | 'document' | 'link'`. A `link` carries its URL in `path` and has `size_bytes: 0`.
- Limits: **25 MB per file, 5 attachments per message.** Enforced client-side AND server-side.
- `accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md"`.
- Per-kind model handling: **image** → Anthropic `image` block; **document** → `document` block; **link** → resolved through the existing Tavily `read_url`; **video** → NOT sent to the model, named in the prompt as a file Donny cannot watch.
- New columns are **nullable**, additive. Never drop or rename.
- Assume RLS on every table. Never hardcode user ids or secrets; identity comes from `auth.getUser()`.
- `no-console` — only `console.error` / `console.warn`.
- Tailwind `dc-*` tokens only; no gray surfaces/badges (`docs/DESIGN_SYSTEM.md`).
- Every RTL test file starts with `// @vitest-environment jsdom` then `import '@testing-library/jest-dom';` as the first two lines.
- Vitest baseline before this plan: **12 files / 129 tests passing.** No task may reduce it.

## Verified preconditions (checked against prod 2026-08-09 — do not re-assume)

| Fact | Status |
|---|---|
| `donny_messages.attachments` column | **does not exist** — Task 1 creates it |
| `donny-attachments` storage bucket | **does not exist** — Task 1 creates it |
| Precedent policy shape | `auth.uid()::text = (storage.foldername(name))[1]` (`20250617123640_*.sql:329-338`) |
| Who writes `donny_messages` | the **client** (`useDonny.ts:147`, `:259`, `:287`) — the orchestrator never touches it |
| Orchestrator auth | `auth.getUser()` + OAuth fallback, `index.ts:275-300`; resolved id is the local `userId` |
| Orchestrator data access | **service-role client**, `index.ts:302` — bypasses RLS |
| `verify_jwt` for `donny-orchestrator` | **no `config.toml` entry** ⇒ platform default `true`. Do not add one. |
| Current turn sent to Anthropic | `{ role: "user", content: query }` — a plain **string** (`index.ts:417-420`) |
| `ClaudeContentBlock` | `index.ts:132-140` — has **no** `source`/`media_type`/`data` fields |
| Tavily read | `webAgent.readUrl(supabase, input, userContext)`, `agents/web.ts:64-83`; key injected server-side at `index.ts:514` |
| Model | `claude-sonnet-4-6`, `maxTokens: 4096` (`_shared/model-routing.ts:24-29, 69`) |

### Anthropic size limits — the spec's 25 MB is a STORAGE cap, not a send cap

The Anthropic Messages API caps a single image at **5 MB base64-encoded**, and base64 inflates bytes by ~33%. So an image above **~3.75 MB raw** cannot be sent, even though the spec permits storing 25 MB. The same applies to the whole request (**32 MB** total).

This plan therefore does two things the spec did not spell out:
1. **Compress images client-side before upload** — the repo already has `compressImage` (used by `useFileUploadLogic.ts:78,84`).
2. **Degrade honestly server-side** — an attachment too large to send is skipped and *named in the prompt* as unreadable, exactly like video. Donny never silently pretends it read something.

---

### Task 1: Migration — column, bucket, storage RLS

**Files:**
- Create: `supabase/migrations/20260809180000_donny_attachments.sql`
- Modify: `docs/DATABASE_SCHEMA.md`

**Interfaces:**
- Produces: `donny_messages.attachments jsonb NULL`; bucket id `donny-attachments` (private); four storage policies.

- [ ] **Step 1: Write the migration**

```sql
-- Donny prompt attachments: images, documents, videos and links a user attaches
-- to a Donny message. Additive and nullable — existing rows are unchanged.
alter table public.donny_messages
  add column if not exists attachments jsonb;

comment on column public.donny_messages.attachments is
  'Array of {path, mime, size_bytes, name, kind}. kind in (image|video|document|link). '
  'path is a donny-attachments object key beginning with the owner uuid, or (kind=link) the URL. '
  'Never stores a signed or public URL — those expire or leak the bucket.';

-- Private bucket. Modelled on message-attachments (20250617123640), which uses the
-- same ${auth.uid()}/ first-folder convention.
insert into storage.buckets (id, name, public)
values ('donny-attachments', 'donny-attachments', false)
on conflict (id) do nothing;

create policy "Users can upload their own donny attachments" on storage.objects
  for insert with check (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view their own donny attachments" on storage.objects
  for select using (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own donny attachments" on storage.objects
  for update using (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own donny attachments" on storage.objects
  for delete using (
    bucket_id = 'donny-attachments' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

> There is deliberately **no cross-user SELECT branch** (unlike `message-attachments`, which joins `messages` so a recipient can see an attachment). A Donny attachment has exactly one reader: its owner. The orchestrator reads with the service role and so is unaffected by these policies — which is precisely why Task 7's path check is load-bearing.

- [ ] **Step 2: Apply it and VERIFY THE OBJECTS, not the ledger**

A `schema_migrations` row is not proof an object exists — that exact failure is recorded in `docs/wiki/concepts/content-delivery-state-machine.md`. Run each check and paste the result into the task report:

```sql
select count(*) from information_schema.columns
  where table_schema='public' and table_name='donny_messages' and column_name='attachments';
-- expect 1

select id, public from storage.buckets where id='donny-attachments';
-- expect one row, public = false

select policyname, cmd from pg_policies
  where schemaname='storage' and tablename='objects'
    and policyname ilike '%donny attachments%'
  order by policyname;
-- expect exactly 4 rows: delete, insert, select, update
```

- [ ] **Step 3: Prove the policy actually isolates users**

Rollback-wrapped, per `reference_testing_authuid_rpc_rls`. Do NOT skip this — a policy that was never exercised is a claim, not a guarantee.

```sql
begin;
select set_config('request.jwt.claim.sub', '<some real user uuid>', true);
set local role authenticated;
-- expect 0 rows: another user's folder is invisible
select count(*) from storage.objects
  where bucket_id='donny-attachments' and name like '00000000-0000-0000-0000-000000000000/%';
rollback;
```

- [ ] **Step 4: Document it**

Add a `donny_messages.attachments` note to the Donny AI table in `docs/DATABASE_SCHEMA.md`, and a short blockquote recording the bucket, the one-reader design, and that the orchestrator's service-role read makes Task 7's path check the real boundary.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260809180000_donny_attachments.sql docs/DATABASE_SCHEMA.md
git commit -m "feat(donny): attachments column, private bucket, owner-only storage policies"
```

---

### Task 2: Attachment types and the rules that guard them

Pure, dependency-free, and shared by client and (as a mirrored constant) the edge function. Every limit lives here once.

**Files:**
- Create: `src/types/donnyAttachment.ts`
- Create: `src/lib/donny/attachmentRules.ts`
- Create: `src/lib/donny/attachmentRules.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DonnyAttachmentKind = 'image' | 'video' | 'document' | 'link';
  export interface DonnyAttachment {
    path: string;        // storage key `${uid}/${uuid}.${ext}`, or the URL when kind==='link'
    mime: string;        // '' for links
    size_bytes: number;  // 0 for links
    name: string;        // display name; the filename, or the link's host
    kind: DonnyAttachmentKind;
  }
  export const DONNY_ATTACHMENT_BUCKET = 'donny-attachments';
  export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
  export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
  export const MAX_IMAGE_SEND_BYTES = 3_500_000; // ~5MB once base64-inflated
  export const ATTACHMENT_ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.txt,.md';
  export function kindForMime(mime: string, name: string): DonnyAttachmentKind | null;
  export function validateFileForAttachment(file: { type: string; name: string; size: number }):
    { ok: true; kind: DonnyAttachmentKind } | { ok: false; reason: string };
  export function looksLikeUrl(text: string): boolean;
  export function linkAttachmentFor(url: string): DonnyAttachment;
  ```
  Tasks 3, 4, 5 and 7 all consume these.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  kindForMime, validateFileForAttachment, looksLikeUrl, linkAttachmentFor,
  MAX_ATTACHMENT_BYTES,
} from './attachmentRules';

describe('kindForMime', () => {
  it('classifies by mime first', () => {
    expect(kindForMime('image/png', 'a.png')).toBe('image');
    expect(kindForMime('video/mp4', 'a.mp4')).toBe('video');
    expect(kindForMime('application/pdf', 'a.pdf')).toBe('document');
  });

  it('falls back to the extension when the mime is empty or generic', () => {
    // Windows and some Android browsers send '' or application/octet-stream.
    expect(kindForMime('', 'notes.md')).toBe('document');
    expect(kindForMime('application/octet-stream', 'brief.docx')).toBe('document');
  });

  it('returns null for a type we do not accept', () => {
    expect(kindForMime('application/zip', 'a.zip')).toBeNull();
  });
});

describe('validateFileForAttachment', () => {
  it('rejects a file over the size cap and names the limit', () => {
    const r = validateFileForAttachment({ type: 'image/png', name: 'a.png', size: MAX_ATTACHMENT_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/25 ?MB/i);
  });

  it('rejects an unsupported type', () => {
    expect(validateFileForAttachment({ type: 'application/zip', name: 'a.zip', size: 10 }).ok).toBe(false);
  });

  it('accepts a normal image', () => {
    const r = validateFileForAttachment({ type: 'image/jpeg', name: 'dish.jpg', size: 1024 });
    expect(r).toEqual({ ok: true, kind: 'image' });
  });
});

describe('looksLikeUrl', () => {
  it('accepts http and https', () => {
    expect(looksLikeUrl('https://example.com/a')).toBe(true);
    expect(looksLikeUrl('http://example.com')).toBe(true);
  });

  it('rejects prose, bare words, and non-http schemes', () => {
    expect(looksLikeUrl('make me a campaign')).toBe(false);
    expect(looksLikeUrl('example.com')).toBe(false);
    // javascript: and file: must never become a link chip.
    expect(looksLikeUrl('javascript:alert(1)')).toBe(false);
    expect(looksLikeUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('linkAttachmentFor', () => {
  it('names the chip after the host, and carries the URL in path', () => {
    expect(linkAttachmentFor('https://example.com/menu?x=1')).toEqual({
      path: 'https://example.com/menu?x=1',
      mime: '',
      size_bytes: 0,
      name: 'example.com',
      kind: 'link',
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/lib/donny/attachmentRules.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/types/donnyAttachment.ts` with the type + constants above, then `attachmentRules.ts`. Implementation notes that the tests pin:
- `kindForMime` checks `mime.startsWith('image/')` → `'image'`, `video/` → `'video'`, then a document mime allow-list (`application/pdf`, `application/msword`, the `...wordprocessingml.document` mime, `text/plain`, `text/markdown`); if the mime matched nothing, fall back to the lowercased extension in `('pdf','doc','docx','txt','md')`. Return `null` otherwise.
- `looksLikeUrl` must use `new URL()` inside a try/catch and then check `protocol === 'http:' || protocol === 'https:'` — do NOT hand-roll a regex, and do NOT accept a scheme-less string.
- `linkAttachmentFor` takes the host from `new URL(url).hostname`.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/lib/donny/attachmentRules.test.ts
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/types/donnyAttachment.ts src/lib/donny/attachmentRules.ts src/lib/donny/attachmentRules.test.ts
git commit -m "feat(donny): attachment types and the rules that bound them"
```

---

### Task 3: `useDonnyAttachments` — upload, track, remove

**Files:**
- Create: `src/hooks/useDonnyAttachments.ts`
- Create: `src/hooks/useDonnyAttachments.test.tsx`

**Interfaces:**
- Consumes: Task 2's types/rules; `supabase` from `@/integrations/supabase/client`; `compressImage` from `@/lib/fileUtils`.
- Produces:
  ```ts
  export interface PendingAttachment {
    id: string;                       // local only, for React keys
    name: string;
    kind: DonnyAttachmentKind;
    status: 'uploading' | 'ready' | 'error';
    error?: string;
    attachment?: DonnyAttachment;     // present iff status === 'ready'
    previewUrl?: string;              // object URL, images only, revoked on remove
  }
  export function useDonnyAttachments(): {
    pending: PendingAttachment[];
    ready: DonnyAttachment[];
    isUploading: boolean;
    addFiles: (files: File[]) => Promise<void>;
    addLink: (url: string) => void;
    remove: (id: string) => void;
    clear: () => void;
  };
  ```
  Tasks 4 and 5 consume this.

> **Do not repeat `SmartInput.tsx:76-82`.** That code puts `URL.createObjectURL(file)` straight into the submitted payload, so a `blob:` URL that only exists in the creating tab's memory escapes the component and nothing downstream can ever dereference it. An object URL here is for **on-screen preview only** and must never reach `DonnyAttachment.path`. Revoke it in `remove`/`clear`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const uploadMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: () => ({ upload: uploadMock }) },
  },
}));
vi.mock('@/lib/fileUtils', () => ({ compressImage: vi.fn(async (f: File) => f) }));

import { useDonnyAttachments } from './useDonnyAttachments';

const fileOf = (name: string, type: string, size = 1024) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => { uploadMock.mockReset(); uploadMock.mockResolvedValue({ data: { path: 'p' }, error: null }); });

describe('useDonnyAttachments', () => {
  it('uploads under the caller uuid and never exposes a blob URL as the path', async () => {
    const { result } = renderHook(() => useDonnyAttachments());
    await act(async () => { await result.current.addFiles([fileOf('dish.jpg', 'image/jpeg')]); });
    await waitFor(() => expect(result.current.ready).toHaveLength(1));

    const [path] = uploadMock.mock.calls[0];
    expect(path).toMatch(/^user-1\//);
    expect(result.current.ready[0].path).toBe(path);
    expect(result.current.ready[0].path).not.toMatch(/^blob:/);
    expect(result.current.ready[0].kind).toBe('image');
  });

  it('refuses more than five attachments', async () => {
    const { result } = renderHook(() => useDonnyAttachments());
    await act(async () => {
      await result.current.addFiles(
        Array.from({ length: 6 }, (_, i) => fileOf(`a${i}.png`, 'image/png')),
      );
    });
    await waitFor(() => expect(result.current.pending.length).toBe(5));
    expect(uploadMock).toHaveBeenCalledTimes(5);
  });

  it('marks a failed upload as error instead of ready', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useDonnyAttachments());
    await act(async () => { await result.current.addFiles([fileOf('a.png', 'image/png')]); });
    await waitFor(() => expect(result.current.pending[0].status).toBe('error'));
    expect(result.current.ready).toHaveLength(0);
  });

  it('rejects an unsupported file without calling storage at all', async () => {
    const { result } = renderHook(() => useDonnyAttachments());
    await act(async () => { await result.current.addFiles([fileOf('a.zip', 'application/zip')]); });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result.current.pending[0].status).toBe('error');
  });

  it('adds a link with no upload', () => {
    const { result } = renderHook(() => useDonnyAttachments());
    act(() => { result.current.addLink('https://example.com/menu'); });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result.current.ready[0]).toMatchObject({ kind: 'link', name: 'example.com' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/hooks/useDonnyAttachments.test.tsx
```

- [ ] **Step 3: Implement**

- Resolve the id via `supabase.auth.getUser()` — **never** a prop, a context value, or anything client-assertable.
- Path: `` `${user.id}/${crypto.randomUUID()}.${ext}` `` (mirrors `MessageInputEnhanced.tsx:75-80`).
- Images: `compressImage` first, so the send stays under `MAX_IMAGE_SEND_BYTES`.
- Enforce `MAX_ATTACHMENTS_PER_MESSAGE` against `pending.length + files.length`, truncating the excess with an error entry — never silently.
- **Do not call `getPublicUrl` or `createSignedUrl`.** Only `path` is persisted; the orchestrator resolves bytes itself. (`MessageInputEnhanced.tsx:90-92` stores a 1-hour signed URL — that is the bug this avoids.)
- `remove`/`clear` must `URL.revokeObjectURL(previewUrl)`.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/hooks/useDonnyAttachments.test.tsx
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDonnyAttachments.ts src/hooks/useDonnyAttachments.test.tsx
git commit -m "feat(donny): upload attachments to a private per-user prefix"
```

---

### Task 4: The composer's `+` control, chips, and paste-a-link

**Files:**
- Modify: `src/components/donny/inline/DonnyComposer.tsx`
- Modify: `src/components/donny/inline/DonnyComposer.test.tsx`
- Create: `src/components/donny/inline/AttachmentChip.tsx`

**Interfaces:**
- Consumes: Task 2 constants, Task 3's `PendingAttachment`.
- Produces: the widened composer contract —
  ```ts
  interface DonnyComposerProps {
    onSubmit: (text: string, attachments: DonnyAttachment[]) => void;
    disabled?: boolean;
    registerRef?: (el: HTMLTextAreaElement | null) => void;
    variant?: 'resting' | 'stuck';
  }
  ```
  Task 5 consumes the new `onSubmit` signature.

> **Four existing invariants in this file are load-bearing. Do not disturb them.**
> 1. The IME guard `e.nativeEvent.isComposing` must remain the FIRST statement of the key handler.
> 2. On mobile, Return falls through to the browser default (a newline) — no `preventDefault()` on that path; only the send button submits.
> 3. `disabled` is applied to the send button only, never the `<textarea>`.
> 4. The composer's own DOM node must stay stable — do not restructure it into a conditional.

- [ ] **Step 1: Write the failing tests**

Add to the existing suite (do not rewrite it):

```tsx
it('submits attachments alongside the text', async () => {
  render(<DonnyComposer onSubmit={onSubmit} />);
  // The hook is mocked at module scope to report one ready image.
  const field = screen.getByRole('textbox', { name: /ask donny/i });
  fireEvent.change(field, { target: { value: 'what is this' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith('what is this', [expect.objectContaining({ kind: 'image' })]);
});

it('sends an attachment-only message with empty text', () => {
  render(<DonnyComposer onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith('', [expect.objectContaining({ kind: 'image' })]);
});

it('blocks send while an upload is still in flight', () => {
  // hook mocked with isUploading: true
  render(<DonnyComposer onSubmit={onSubmit} />);
  expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
});

it('turns a pasted URL into a link chip instead of pasting text', () => {
  render(<DonnyComposer onSubmit={onSubmit} />);
  const field = screen.getByRole('textbox', { name: /ask donny/i });
  fireEvent.paste(field, { clipboardData: { getData: () => 'https://example.com/menu' } });
  expect(addLinkMock).toHaveBeenCalledWith('https://example.com/menu');
  expect(field).toHaveValue('');
});

it('leaves ordinary pasted prose alone', () => {
  render(<DonnyComposer onSubmit={onSubmit} />);
  const field = screen.getByRole('textbox', { name: /ask donny/i });
  fireEvent.paste(field, { clipboardData: { getData: () => 'not a url' } });
  expect(addLinkMock).not.toHaveBeenCalled();
});

it('removes a chip on its remove button', () => {
  render(<DonnyComposer onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /remove dish\.jpg/i }));
  expect(removeMock).toHaveBeenCalledWith('att-1');
});
```

> Use `toHaveBeenCalledTimes(1)` on every submit assertion. `toHaveBeenCalledWith` alone passes when *any* call matched, which is how a duplicate-submit bug survived review earlier on this branch.

- [ ] **Step 2: Run and watch them fail**

```bash
npx vitest run src/components/donny/inline/DonnyComposer.test.tsx
```

- [ ] **Step 3: Implement**

- Call `useDonnyAttachments()` inside the composer, so `DonnyCanvas` and `DonnyHome` need no new props.
- A `+` icon button, left of the field, labelled `aria-label="Attach a file"`, opening a hidden `<input type="file" multiple>` with `accept={ATTACHMENT_ACCEPT}`.
- Chips render above the textarea, inside the same bordered shell. Use `AppStatusBadge`-style tokens, **never gray**: teal for ready, amber for uploading, pink for error. Each chip has its own `aria-label="Remove <name>"` button.
- Submit gating changes from "text is non-empty" to **"(text is non-empty OR there is ≥1 ready attachment) AND nothing is uploading"**.
- On submit, pass `ready` as the second argument and call `clear()`.
- `onPaste`: read `clipboardData.getData('text')`; if `looksLikeUrl(...)` **and** the field would otherwise receive the whole string, `preventDefault()` and `addLink(...)`. Otherwise do nothing and let the browser paste.

- [ ] **Step 4: Run and watch them pass**

```bash
npx vitest run src/components/donny/inline/
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/inline/
git commit -m "feat(donny): attach files and links from the composer"
```

---

### Task 5: Carry attachments through the send path

**Files:**
- Modify: `src/hooks/useDonny.ts`
- Modify: `src/hooks/useDonny.test.tsx`
- Modify: `src/components/donny/inline/DonnyCanvas.tsx`
- Modify: `src/components/donny/DonnyHome.tsx`
- Modify: `src/types/donny.ts`

**Interfaces:**
- Consumes: Task 2's `DonnyAttachment`, Task 4's `onSubmit(text, attachments)`.
- Produces: `sendMessage(content: string, attachments?: DonnyAttachment[])`; `DonnyMessage.attachments?: DonnyAttachment[] | null`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('persists attachments on the user row and posts them to the orchestrator', async () => {
  // drive sendMessage('what is this', [imageAttachment])
  expect(insertMock).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'user', content: 'what is this',
      attachments: [expect.objectContaining({ kind: 'image' })] }),
  );
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body.attachments).toEqual([expect.objectContaining({ kind: 'image' })]);
});

it('omits attachments entirely when there are none', async () => {
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body.attachments ?? []).toEqual([]);
});

it('replays the same attachments on retry', async () => {
  // first send fails, then retry()
  const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
  expect(second.attachments).toEqual([expect.objectContaining({ kind: 'image' })]);
});
```

> The retry test is the one that matters. `lastUserMessage` is a `useRef<string>` (`useDonny.ts:133`) — text only. Retrying a message whose attachments were dropped would re-ask the question with the picture missing, and Donny would answer confidently about nothing. This must be a paired ref.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

- `sendMessageMutation` takes `{ content, attachments }`; include `attachments` on the `donny_messages` insert only when non-empty (leave the column NULL otherwise).
- Add `attachments` to the POST body next to `query`.
- Store the attachments beside `lastUserMessage` — e.g. `lastUserAttachments = useRef<DonnyAttachment[]>([])`, assigned on the same line and under the same ordering rule (**above** the `!conversation || !user` guard, so a cold-start failure is still retryable — that ordering is itself a fixed defect, do not move it).
- Thread the second argument through `DonnyCanvas.handleSubmit` → `onPromptSubmit` → `DonnyHome.handlePromptSubmit` → `sendMessage`.
- Widen `DonnyMessage` in `src/types/donny.ts` with `attachments?: DonnyAttachment[] | null`.

- [ ] **Step 4: Run and watch them pass**

```bash
npx vitest run src/hooks/ src/components/donny/ src/lib/donny/
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDonny.ts src/hooks/useDonny.test.tsx src/components/donny src/types/donny.ts
git commit -m "feat(donny): carry attachments from the composer to the orchestrator"
```

---

### Task 6: Show attachments on the user's turn

**Files:**
- Modify: `src/components/donny/inline/DonnyTurn.tsx`
- Modify: `src/components/donny/inline/DonnyTurn.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders a chip per attachment on a user turn', () => {
  render(<DonnyTurn message={userMessageWith([image, link])} />);
  expect(screen.getByText('dish.jpg')).toBeInTheDocument();
  expect(screen.getByText('example.com')).toBeInTheDocument();
});

it('renders an attachment-only turn with no empty bubble', () => {
  render(<DonnyTurn message={userMessageWith([image], '')} />);
  expect(screen.queryByTestId('bubble-empty')).not.toBeInTheDocument();
  expect(screen.getByText('dish.jpg')).toBeInTheDocument();
});

it('marks a video as something Donny cannot watch', () => {
  render(<DonnyTurn message={userMessageWith([video])} />);
  expect(screen.getByText(/can'?t watch/i)).toBeInTheDocument();
});
```

> The video note is not decoration. A user who attaches a video and gets a confident answer will assume it was watched. Saying so in the UI is the honest-analytics rule (`docs/wiki/concepts/honest-analytics.md`) applied to input.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

Render chips above the text bubble on `data-turn="user"`. Suppress the bubble entirely when `content` is empty. Do **not** try to render image thumbnails from `path` — the bucket is private and a `<img src>` would 404; a named chip is the honest v1.

- [ ] **Step 4: Run and watch them pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/inline/DonnyTurn.tsx src/components/donny/inline/DonnyTurn.test.tsx
git commit -m "feat(donny): show what was attached on the user's turn"
```

---

### Task 7: `donny-orchestrator` reads the attachments

**This is the security-critical task.** The function reads storage with the **service-role key** (`index.ts:302`), which bypasses every policy Task 1 wrote. The path check below is the only boundary.

**Files:**
- Modify: `supabase/functions/donny-orchestrator/types.ts`
- Modify: `supabase/functions/donny-orchestrator/index.ts`
- Create: `supabase/functions/donny-orchestrator/attachments.ts`
- Create: `supabase/functions/donny-orchestrator/attachments.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OrchestratorAttachment {
    path: string; mime: string; size_bytes: number; name: string;
    kind: 'image' | 'video' | 'document' | 'link';
  }
  export function assertOwnedPaths(attachments: OrchestratorAttachment[], userId: string): void;
  export async function buildAttachmentBlocks(
    supabase: SupabaseClient, attachments: OrchestratorAttachment[], userId: string,
  ): Promise<{ blocks: ClaudeContentBlock[]; notes: string[] }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
Deno.test('assertOwnedPaths rejects another user\'s object', () => {
  assertThrows(() => assertOwnedPaths(
    [{ path: 'other-user/x.png', mime: 'image/png', size_bytes: 1, name: 'x', kind: 'image' }],
    'me',
  ));
});

Deno.test('assertOwnedPaths rejects traversal and prefix look-alikes', () => {
  // 'me-evil/' must not pass a naive startsWith('me') check.
  assertThrows(() => assertOwnedPaths([{ path: 'me-evil/x.png', /* … */ }], 'me'));
  assertThrows(() => assertOwnedPaths([{ path: 'me/../other/x.png', /* … */ }], 'me'));
  assertThrows(() => assertOwnedPaths([{ path: '/me/x.png', /* … */ }], 'me'));
});

Deno.test('assertOwnedPaths ignores links, which carry a URL not a key', () => {
  assertOwnedPaths([{ path: 'https://example.com', mime: '', size_bytes: 0, name: 'example.com', kind: 'link' }], 'me');
});

Deno.test('assertOwnedPaths rejects the whole batch when one path is foreign', () => {
  assertThrows(() => assertOwnedPaths([ownedImage, foreignImage], 'me'));
});

Deno.test('a video is never downloaded, only described', async () => {
  const { blocks, notes } = await buildAttachmentBlocks(fakeSupabase, [video], 'me');
  assertEquals(blocks.length, 0);
  assert(notes[0].includes('cannot watch'));
  assertEquals(downloadCalls, 0);
});

Deno.test('an oversized image is skipped and named, never silently dropped', async () => {
  const { blocks, notes } = await buildAttachmentBlocks(fakeSupabase, [hugeImage], 'me');
  assertEquals(blocks.length, 0);
  assert(notes[0].includes('too large'));
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
deno test --allow-none supabase/functions/donny-orchestrator/attachments.test.ts
```

- [ ] **Step 3: Implement `attachments.ts`**

```ts
export const DONNY_ATTACHMENT_BUCKET = 'donny-attachments';  // server-side constant, never from the body
export const MAX_ATTACHMENTS = 5;
export const MAX_IMAGE_SEND_BYTES = 3_500_000;
export const MAX_DOC_SEND_BYTES = 25 * 1024 * 1024;

export function assertOwnedPaths(attachments: OrchestratorAttachment[], userId: string): void {
  if (attachments.length > MAX_ATTACHMENTS) throw new Error('Too many attachments');
  for (const a of attachments) {
    if (a.kind === 'link') continue;                 // path is a URL, not an object key
    // Exact first-segment match. A startsWith(userId) test would accept `${userId}-evil/…`.
    const [first, ...rest] = a.path.split('/');
    if (first !== userId || rest.length === 0) throw new Error('Attachment does not belong to caller');
    if (a.path.includes('..')) throw new Error('Attachment path traversal');
  }
}
```

`buildAttachmentBlocks`:
- `image` → `supabase.storage.from(DONNY_ATTACHMENT_BUCKET).download(path)`; if `size_bytes > MAX_IMAGE_SEND_BYTES`, push a note and skip. Otherwise base64 it into `{ type: 'image', source: { type: 'base64', media_type: mime, data } }`.
- `document` → same, as `{ type: 'document', source: { type: 'base64', media_type: mime, data } }`.
- `video` → **never downloaded.** Note: `The user attached a video named "X" which you cannot watch. Say so plainly rather than guessing at its contents.`
- `link` → call the existing `webAgent.readUrl(supabase, { url: a.path, tavily_api_key: TAVILY_API_KEY }, userContext)` and push its shaped text as a `text` block. Reuse it — do not add a second fetch path, which would be new SSRF surface.
- Every failure produces a **note**, never a silent drop.

- [ ] **Step 4: Wire it into `index.ts`**

- Widen `ClaudeContentBlock` (`index.ts:132-140`) with `source?: { type: 'base64'; media_type: string; data: string }`.
- Add `attachments?: OrchestratorAttachment[]` to `OrchestratorInput` (`types.ts:1-8`).
- Immediately after `userId` resolves (`index.ts:292/299`) and **before** any storage read: `assertOwnedPaths(body.attachments ?? [], userId)`. A throw here must fail the whole request — do not catch and continue.
- Change the current turn (`index.ts:417-420`) from `content: query` to a block array: the attachment blocks, then a `text` block carrying `query` plus any `notes` appended as plain sentences.
- Leave `conversation_history` as strings. Attachments apply to the current turn only in v1.

- [ ] **Step 5: Run everything**

```bash
deno test --allow-none supabase/functions/donny-orchestrator/attachments.test.ts
npx vitest run supabase/functions/donny-orchestrator/routes.test.ts
npm run typecheck && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-orchestrator/
git commit -m "feat(donny): read attached images, documents and links, and admit what it cannot read"
```

---

### Task 8: Gates, deploy, verify

Non-negotiable, in order. Unlike Phase 1, this phase touches a migration, storage RLS and an edge function, so both security reviewers apply.

- [ ] **Step 1: `data-exposure-reviewer`** over the Task 1 migration and Task 7's function changes. The question it exists to answer is exactly this phase's risk: can one actor reach another's file? Feed it `assertOwnedPaths` explicitly.

- [ ] **Step 2: `edge-function-reviewer`** over `donny-orchestrator` and its `_shared/*` dependencies, before any deploy. Watch specifically for the `_shared` bundling hazard and the template-literal backtick break — both have bitten this repo.

- [ ] **Step 3: `/simplify`** over the changed files.

- [ ] **Step 4: Codex second review**

```bash
codex review --base main --title "Donny attachments (Phase 2)"
```
Re-run until clean. **A blank run is a failed gate, not a pass.**

- [ ] **Step 5: Deploy in the right order.** The migration must be applied to prod **before** the edge function deploys and before the PR merges — the function reads a column and a bucket that must already exist (`project_deploy_ordering_new_column`).

```bash
# 1. migration (already applied + object-verified in Task 1)
# 2. edge function — merging does NOT deploy it
supabase functions deploy donny-orchestrator --project-ref zocahiffooqdybdhguqv
# 3. verify by reading the DEPLOYED source, not the version number
```

Confirm the deployed source contains `assertOwnedPaths`. A version bump is not evidence — reading the deployed body is (`project_pr402_security_fix_merged_not_deployed`).

- [ ] **Step 6: Probe the boundary on prod.** With a real logged-in session, POST a body whose attachment `path` names another user's prefix. Expect a hard failure, not a 200 with the attachment ignored. Record the response.

- [ ] **Step 7: `verify-prod`, both viewports** — attach an image and ask about it; attach a video and confirm Donny says it cannot watch it; paste a link and confirm it is read; confirm no console errors.

- [ ] **Step 8: `knowledge-sync`** — wiki session source, `/wiki-ops ingest`, prepend to `docs/SHIPPED_LOG.md`, update `PROJECT_CONTEXT.md` §4 + its §5 index line, `DATABASE_SCHEMA.md` (already done in Task 1), then sync Donny's RAG after merge.

---

## Out of scope

- Creator and brand dashboards — Phase 3, spec §6.
- Image thumbnails in the thread (the bucket is private; needs signed-URL plumbing).
- Attachments on *historical* turns re-sent to the model — v1 is current-turn only.
- Attachment reuse across conversations, or a media library.
- Virus scanning / content moderation on upload.
- Any change to `donny-chat` (the internal AIOS surface) — this is the consumer orchestrator only.
