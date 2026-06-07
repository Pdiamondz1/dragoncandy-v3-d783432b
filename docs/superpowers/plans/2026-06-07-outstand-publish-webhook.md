# Outstand Publish Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `donny_scheduled_posts` lifecycle by adding an inbound `outstand-webhook` edge function that flips posts `scheduled → published/failed` on Outstand's `post.published`/`post.error`, flags expired account tokens for reconnect, and surfaces failures in the schedule UI.

**Architecture:** A signature-verified (`HMAC-SHA256`) inbound webhook (`verify_jwt = false`), mirroring `stripe-webhook`/`toast-redemption-webhook`. Pure logic (signature + payload parsing) lives in a runtime-agnostic `_shared` module with Deno tests; the handler uses guarded updates plus an `outstand_webhook_events` idempotency/audit table. One small frontend change adds a "Failed" badge.

**Tech Stack:** Deno edge functions (supabase/functions), Supabase Postgres + RLS, supabase-js v2, Web Crypto HMAC, React 18 + TypeScript, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-07-outstand-publish-webhook-design.md`

---

## File Structure

**Create**
- `supabase/migrations/20260607120000_outstand_webhook_events.sql` — idempotency/audit table + correlation index.
- `supabase/functions/_shared/outstand-webhook-lib.ts` — pure helpers: `verifyOutstandSignature`, `parseOutstandEvent`.
- `supabase/functions/_shared/outstand-webhook-lib.test.ts` — Deno tests for the pure helpers.
- `supabase/functions/outstand-webhook/index.ts` — the handler.
- `src/components/schedule/PostCard.test.tsx` — Vitest test for the failed badge.
- `docs/superpowers/runbooks/outstand-webhook.md` — registration runbook.

**Modify**
- `supabase/config.toml` — add `[functions.outstand-webhook] verify_jwt = false`.
- `src/components/schedule/PostCard.tsx` — add the failed state + badge.
- `docs/flows/campaign-lifecycle.md` — close the "never reach published" gap.

> `src/hooks/useScheduledPosts.ts` already selects `status` and `metadata` — **no change needed there.**

---

## Task 0: Workspace setup

**Files:** none (environment only)

- [ ] **Step 1: Create a fresh worktree off the latest `main`**

This work must NOT happen in the `dragoncandy-feature-docs` worktree (docs-scoped, has a pre-existing broken typecheck). From the primary repo, create an isolated worktree off updated `main` (see @superpowers:using-git-worktrees). Ensure the approved spec + this plan are present in it (merge the docs branch to `main` first, or copy both files in).

- [ ] **Step 2: Install deps and confirm a clean baseline**

Run: `npm ci`
Then: `npm run typecheck`
Expected: PASS. If you see `Cannot find module '@capacitor/camera'`/`'@capacitor/share'`, run `npm install @capacitor/camera @capacitor/share` (their Phase-2 native deps) and re-run typecheck until clean. Do not proceed until typecheck is green — that's the regression baseline.

- [ ] **Step 3: Confirm Deno is available** (edge-function runtime)

Run: `deno --version`
Expected: prints a Deno version. If missing, install Deno (used for all `supabase/functions`).

---

## Task 1: Idempotency/audit table + correlation index

**Files:**
- Create: `supabase/migrations/20260607120000_outstand_webhook_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- outstand_webhook_events — idempotency + audit log for inbound Outstand webhooks.
-- Service-role only (Edge Function writes); RLS on with no policies.
create table if not exists public.outstand_webhook_events (
  id          text primary key,          -- "<event>:<postId>"
  event       text not null,
  post_id     text,
  account_id  text,
  payload     jsonb default '{}'::jsonb,
  received_at timestamptz not null default now()
);

alter table public.outstand_webhook_events enable row level security;
-- No policies: only the service_role (which bypasses RLS) reads/writes.

-- Correlation lookup used by the webhook handler
-- (donny_scheduled_posts.metadata->>'outstand_post_id' = payload postId).
create index if not exists idx_dsp_outstand_post_id
  on public.donny_scheduled_posts ((metadata->>'outstand_post_id'));
```

- [ ] **Step 2: Apply to STAGING and verify**

Apply via Supabase MCP `apply_migration` against the **staging** project (ref `mhffqrawgizhprbobcta`) — name `outstand_webhook_events`.
Verify with `execute_sql`:
```sql
select to_regclass('public.outstand_webhook_events') as tbl,
       (select count(*) from pg_indexes where indexname = 'idx_dsp_outstand_post_id') as idx;
```
Expected: `tbl = outstand_webhook_events`, `idx = 1`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260607120000_outstand_webhook_events.sql
git commit -m "feat(outstand-webhook): add outstand_webhook_events table + correlation index"
```

---

## Task 2: Pure helpers (signature + payload parsing) — TDD

Use @superpowers:test-driven-development. These helpers carry the security-critical logic, so they get real tests. They import nothing Deno-specific (only Web Crypto), keeping them testable.

**Files:**
- Create: `supabase/functions/_shared/outstand-webhook-lib.ts`
- Test: `supabase/functions/_shared/outstand-webhook-lib.test.ts`

- [ ] **Step 1: Write the failing Deno test**

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyOutstandSignature, parseOutstandEvent } from "./outstand-webhook-lib.ts";

const SECRET = "test-secret";

async function sign(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return "sha256=" + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("valid signature passes", async () => {
  const body = JSON.stringify({ event: "post.published" });
  assertEquals(await verifyOutstandSignature(body, await sign(body, SECRET), SECRET), true);
});

Deno.test("tampered body fails", async () => {
  const header = await sign(JSON.stringify({ event: "post.published" }), SECRET);
  assertEquals(await verifyOutstandSignature(JSON.stringify({ event: "x" }), header, SECRET), false);
});

Deno.test("wrong secret fails", async () => {
  const body = JSON.stringify({ a: 1 });
  assertEquals(await verifyOutstandSignature(body, await sign(body, "other"), SECRET), false);
});

Deno.test("missing header fails", async () => {
  assertEquals(await verifyOutstandSignature("{}", null, SECRET), false);
});

Deno.test("parse extracts postId across shapes", () => {
  assertEquals(parseOutstandEvent({ event: "post.published", data: { postId: "p1", publishedAt: "t" } }).postId, "p1");
  assertEquals(parseOutstandEvent({ type: "post.error", post: { id: "p2" } }).postId, "p2");
  assertEquals(parseOutstandEvent({ event: "account.token_expired", data: { accountId: "a1" } }).accountId, "a1");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/_shared/outstand-webhook-lib.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement the helpers**

```ts
// Pure, runtime-agnostic helpers for the outstand-webhook edge function.
// No Deno/std imports here so the logic stays unit-testable.

export async function verifyOutstandSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const provided = signatureHeader.replace(/^sha256=/, "");
  const a = encoder.encode(expectedHex);
  const b = encoder.encode(provided);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface OutstandEvent {
  event: string;
  postId: string | null;
  accountId: string | null;
  publishedAt: string | null;
  socialAccounts: unknown;
}

// Outstand payload casing/nesting isn't fully pinned (see spec §10); accept the
// common variants defensively, mirroring outstand-proxy's id extraction.
export function parseOutstandEvent(body: Record<string, any>): OutstandEvent {
  const event = body?.event ?? body?.type ?? "";
  const data = body?.data ?? body;
  return {
    event,
    postId: data?.postId ?? data?.post_id ?? data?.post?.id ?? null,
    accountId: data?.accountId ?? data?.account_id ?? null,
    publishedAt: data?.publishedAt ?? data?.published_at ?? null,
    socialAccounts: data?.socialAccounts ?? data?.social_accounts ?? null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/_shared/outstand-webhook-lib.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/outstand-webhook-lib.ts supabase/functions/_shared/outstand-webhook-lib.test.ts
git commit -m "feat(outstand-webhook): signature + payload-parse helpers with tests"
```

---

## Task 3: The webhook handler + config

**Files:**
- Create: `supabase/functions/outstand-webhook/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the handler**

```ts
// outstand-webhook — inbound Outstand webhook: advances donny_scheduled_posts
// scheduled → published/failed, and flags expired account tokens for reconnect.
//
// Auth: HMAC-SHA256 over the raw body, header X-Outstand-Signature: sha256=<hex>,
//       secret OUTSTAND_WEBHOOK_SECRET. verify_jwt = false (see config.toml).
// ENV: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OUTSTAND_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseOutstandEvent, verifyOutstandSignature } from "../_shared/outstand-webhook-lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_WEBHOOK_SECRET = Deno.env.get("OUTSTAND_WEBHOOK_SECRET")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const signature = req.headers.get("x-outstand-signature");
  if (!(await verifyOutstandSignature(rawBody, signature, OUTSTAND_WEBHOOK_SECRET))) {
    console.error("outstand-webhook: invalid signature");
    return json(401, { error: "Unauthorized — invalid signature" });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { return json(400, { error: "Invalid JSON" }); }

  const { event, postId, accountId, publishedAt, socialAccounts } = parseOutstandEvent(body);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (event === "post.published" || event === "post.error") {
      if (!postId) return json(400, { error: "Missing postId" });
      const newStatus = event === "post.published" ? "published" : "failed";

      // Guarded: only advance rows that aren't already published.
      const { data: rows } = await supabase
        .from("donny_scheduled_posts")
        .select("id, metadata")
        .eq("metadata->>outstand_post_id", postId)
        .neq("status", "published");

      if (!rows || rows.length === 0) {
        console.log(`outstand-webhook: no scheduled post for ${postId} (foreign/already published)`);
        return json(200, { status: "no_match", post_id: postId });
      }

      for (const row of rows) {
        const meta = (row.metadata as Record<string, unknown>) ?? {};
        const patch: Record<string, unknown> = {
          status: newStatus,
          metadata: { ...meta, publish_result: socialAccounts ?? null },
          updated_at: new Date().toISOString(),
        };
        if (newStatus === "published") patch.published_at = publishedAt ?? new Date().toISOString();
        await supabase
          .from("donny_scheduled_posts")
          .update(patch)
          .eq("id", row.id)
          .neq("status", "published");
      }

      // Idempotency/audit AFTER a successful write; ignore unique-violation.
      const { error: auditErr } = await supabase
        .from("outstand_webhook_events")
        .insert({ id: `${event}:${postId}`, event, post_id: postId, payload: body });
      if (auditErr && auditErr.code !== "23505") {
        console.warn("outstand-webhook: audit insert failed", auditErr.message);
      }

      return json(200, { status: "processed", event, post_id: postId });
    }

    if (event === "account.token_expired") {
      if (accountId) {
        await supabase
          .from("business_outstand_accounts")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("outstand_social_account_id", accountId);
      }
      return json(200, { status: "processed", event });
    }

    console.log(`outstand-webhook: ignoring event ${event}`);
    return json(200, { status: "ignored", event });
  } catch (err) {
    console.error("outstand-webhook: processing failed", (err as Error).message);
    return json(500, { error: "Processing failed" });
  }
});
```

- [ ] **Step 2: Register the function config**

Append to `supabase/config.toml`:
```toml
[functions.outstand-webhook]
verify_jwt = false
```

- [ ] **Step 3: Type-check the function with Deno**

Run: `deno check supabase/functions/outstand-webhook/index.ts`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/outstand-webhook/index.ts supabase/config.toml
git commit -m "feat(outstand-webhook): inbound handler + verify_jwt=false config"
```

---

## Task 4: Deploy to staging + smoke test

**Files:** none (deploy + verify)

- [ ] **Step 1: Set the secret on staging**

`OUTSTAND_WEBHOOK_SECRET` is set per-project and is NOT settable via MCP. Set it on the **staging** project via the Supabase dashboard (Edge Functions → Secrets) or CLI (`supabase secrets set OUTSTAND_WEBHOOK_SECRET=<value> --project-ref mhffqrawgizhprbobcta`). Use a strong random value; you'll paste the same value into Outstand later. Record it securely.

- [ ] **Step 2: Deploy the function to staging**

Deploy `outstand-webhook` via Supabase MCP `deploy_edge_function` to ref `mhffqrawgizhprbobcta` (include the `_shared/outstand-webhook-lib.ts` import).

- [ ] **Step 3: Insert a dedicated throwaway test row**

Via `execute_sql` on staging, **INSERT** a new row (do not mutate a real one). Satisfy the NOT NULL / FK columns by reusing an existing staging `user_id` (the staging DB is a migration replay and may lack seed data — pick a real id first with `select id from auth.users limit 1;`):
```sql
insert into public.donny_scheduled_posts
  (id, user_id, platform, content_type, scheduled_at, status, metadata)
values
  (gen_random_uuid(), '<existing-staging-user-id>', 'instagram', 'reel',
   now(), 'scheduled', '{"outstand_post_id":"TEST_OS_ID"}'::jsonb)
returning id;
```
Record the returned `id` for cleanup in Step 5.

- [ ] **Step 4: Smoke test with a signed request**

Export the staging secret in your shell first, then send a signed `post.published`:
```bash
export OUTSTAND_WEBHOOK_SECRET='<the staging secret you set in Step 1>'
BODY='{"event":"post.published","data":{"postId":"TEST_OS_ID","publishedAt":"2026-06-07T12:00:00Z","socialAccounts":[{"accountId":"a1","status":"published","platformPostId":"x"}]}}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$OUTSTAND_WEBHOOK_SECRET" | sed 's/^.* //')"
curl -s -X POST "https://mhffqrawgizhprbobcta.supabase.co/functions/v1/outstand-webhook" \
  -H "Content-Type: application/json" -H "X-Outstand-Signature: $SIG" --data "$BODY"
```
Expected: `{"status":"processed","event":"post.published","post_id":"TEST_OS_ID"}`. Confirm via `execute_sql` that the row is now `published` with `published_at` set and `metadata.publish_result` populated. Then re-send the **same** request → expect `{"status":"no_match",...}` (guarded — already published, safe no-op). Finally send with a wrong signature (`-H "X-Outstand-Signature: sha256=deadbeef"`) → expect `401`.

- [ ] **Step 5: Clean up the throwaway row**

Delete it by the id from Step 3: `delete from public.donny_scheduled_posts where id = '<id>';`

---

## Task 5: Failed-state badge in the schedule UI — TDD

Use @superpowers:test-driven-development. The repo uses Vitest + Testing Library (co-located `*.test.tsx`).

**Files:**
- Test: `src/components/schedule/PostCard.test.tsx`
- Modify: `src/components/schedule/PostCard.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PostCard } from './PostCard';
import type { ScheduledPost } from '@/hooks/useScheduledPosts';

const base: ScheduledPost = {
  id: 'p1', user_id: 'u1', campaign_id: 'c1', platform: 'instagram', content_type: 'reel',
  caption: 'hi', media_urls: null, hashtags: null, scheduled_at: '2026-06-07T12:00:00Z',
  published_at: null, status: 'scheduled', ai_suggested_time: false, ai_reasoning: null,
  metadata: null, plan_group_id: null, plan_order: 0, deliverable_id: null,
  created_at: '2026-06-07T00:00:00Z',
};
const noop = () => {};

describe('PostCard status badges', () => {
  it('shows the Published badge', () => {
    render(<PostCard post={{ ...base, status: 'published' }} index={0} total={1} onEditCaption={noop} onChangeDate={noop} />);
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
  });

  it('shows the Failed badge with the error', () => {
    render(<PostCard
      post={{ ...base, status: 'failed', metadata: { publish_result: [{ error: 'token expired' }] } }}
      index={0} total={1} onEditCaption={noop} onChangeDate={noop} />);
    expect(screen.getByText(/Failed/i)).toBeInTheDocument();
    expect(screen.getByText(/token expired/i)).toBeInTheDocument();
  });

  it('hides actions when failed', () => {
    render(<PostCard post={{ ...base, status: 'failed', metadata: null }} index={0} total={1} onEditCaption={noop} onChangeDate={noop} />);
    expect(screen.queryByText(/Edit Caption/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/schedule/PostCard.test.tsx`
Expected: FAIL — the Failed badge/error text isn't rendered. (Per project note, trust this file's per-test results, not the global exit code.)

- [ ] **Step 3: Implement the failed state**

In `src/components/schedule/PostCard.tsx`, after the `isPublished` line (65), add:
```tsx
  const isFailed = post.status === 'failed';
  const isTerminal = isPublished || isFailed;
  const firstError = (() => {
    const r = (post.metadata as Record<string, unknown> | null)?.publish_result;
    if (Array.isArray(r)) {
      const withErr = r.find((x) => x && typeof x === 'object' && 'error' in x) as { error?: string } | undefined;
      return withErr?.error ?? null;
    }
    return null;
  })();
```
Change the wrapper opacity (line 72) to fade on terminal:
```tsx
        isTerminal && 'opacity-60'
```
In the badge row (after the `isPublished && (...)` block, ~line 93) add:
```tsx
          {isFailed && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5 flex items-center gap-1">
              ✕ Failed
            </span>
          )}
```
After the caption block (~line 116) add the error line:
```tsx
      {isFailed && firstError && (
        <p className="text-xs text-red-600 mt-1">{firstError}</p>
      )}
```
Change the action-row guard (line 119) from `{!isPublished && (` to `{!isTerminal && (`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/schedule/PostCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (clean, per Task 0 baseline).

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/PostCard.tsx src/components/schedule/PostCard.test.tsx
git commit -m "feat(schedule): show Failed badge + error on PostCard"
```

---

## Task 6: Registration runbook

**Files:**
- Create: `docs/superpowers/runbooks/outstand-webhook.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Runbook — Outstand Publish Webhook

Closes the scheduled-post lifecycle. The `outstand-webhook` edge function
receives Outstand events and updates `donny_scheduled_posts` + flags expired
account tokens. See spec `docs/superpowers/specs/2026-06-07-outstand-publish-webhook-design.md`.

## One-time setup (per environment: staging, then prod)

1. **Secret** — set `OUTSTAND_WEBHOOK_SECRET` (strong random) on the project
   (Supabase dashboard → Edge Functions → Secrets, or
   `supabase secrets set OUTSTAND_WEBHOOK_SECRET=… --project-ref <ref>`).
2. **Deploy** — deploy the `outstand-webhook` function and apply the
   `outstand_webhook_events` migration to the project.
3. **Register in Outstand** — outstand.so → Settings → Webhooks → Add Webhook:
   - URL: `https://<project-ref>.supabase.co/functions/v1/outstand-webhook`
   - Events: `post.published`, `post.error`, `account.token_expired`
   - Signing secret: the same value as `OUTSTAND_WEBHOOK_SECRET`.

## Verify
- Send a signed test event (see plan Task 4 Step 3) → 200 `processed`; wrong
  signature → 401.
- Schedule a real test post, let it publish → row flips to `published`,
  `published_at` set, green badge in the schedule view.

## Project refs
- Staging: `mhffqrawgizhprbobcta`
- Prod: `zocahiffooqdybdhguqv`
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/runbooks/outstand-webhook.md
git commit -m "docs(runbook): Outstand webhook registration"
```

---

## Task 7: Close the documented gap

**Files:**
- Modify: `docs/flows/campaign-lifecycle.md`

- [ ] **Step 1: Update the auto-posting docs**

Remove the "Posts never reach `published` (confirmed gap)" bullet from the Known Gaps section, and in the auto-posting prose note that the `outstand-webhook` function now advances posts to `published`/`failed` (with `published_at`) on Outstand's `post.published`/`post.error`. Update the `donny_scheduled_posts` status-transition row to reflect that the webhook completes the lifecycle.

- [ ] **Step 2: Commit**

```bash
git add docs/flows/campaign-lifecycle.md
git commit -m "docs(flows): close auto-posting publish-status gap"
```

---

## Task 8: Production rollout + end-to-end verification

**Files:** none (deploy + manual verify) — do this only after Tasks 1–5 are merged.

- [ ] **Step 1: Apply migration + deploy to prod**

Apply the `outstand_webhook_events` migration and deploy `outstand-webhook` to prod (ref `zocahiffooqdybdhguqv`). Set `OUTSTAND_WEBHOOK_SECRET` on prod.

- [ ] **Step 2: Register the prod webhook in Outstand**

Per the runbook, using the prod URL + prod secret. Events: `post.published`, `post.error`, `account.token_expired`.

- [ ] **Step 3: End-to-end check**

Schedule a real post in prod (a low-stakes test account), let it publish, and confirm the row flips to `published` with `published_at` and the green badge. Force a failure (e.g. a revoked account) and confirm `failed` + red badge. Verify `account.token_expired` marks the account `error` and the reconnect prompt appears.

- [ ] **Step 4: Validate payload assumptions (spec §10)**

From a real delivered event, confirm the actual field casing (`postId` vs `post.id`, `socialAccounts` vs `social_accounts`) and that `account.token_expired.accountId` equals `business_outstand_accounts.outstand_social_account_id`. If anything differs, adjust `parseOutstandEvent` (it already accepts the common variants) and re-deploy.

---

## Notes for the implementer

- **Deploy discipline:** the migration + edge function deploy **separately** from the `main` push (via Supabase MCP/CLI). The frontend badge ships via the normal `main` → Lovable deploy. Staging (`mhffqrawgizhprbobcta`) before prod (`zocahiffooqdybdhguqv`).
- **Idempotency ordering matters:** the audit row is inserted *after* the post update, so a transient update failure lets Outstand's retry succeed. Don't reorder it.
- **Never downgrade `published`:** both terminal updates are guarded `status <> 'published'`.
- **Vitest exit code is unreliable** in this repo (pre-existing failures in nested worktrees) — judge `PostCard.test.tsx` by its own per-test PASS lines.
