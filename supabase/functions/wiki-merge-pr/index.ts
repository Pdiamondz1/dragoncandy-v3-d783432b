// wiki-merge-pr
// Admin-clicked in-UI approval of knowledge PRs. Three actions:
//   list    → open PRs touching ONLY docs/wiki/** (deduped by head branch)
//   preview → the rendered markdown of a PR's first wiki file (for the panel)
//   merge   → squash-merge the PR via GitHub API, then sync each merged file into
//             donny_knowledge + internal_docs via donny-knowledge-sync.
// Reuses GITHUB_WIKI_TOKEN (Contents + Pull Requests R/W) — no new secret.
// Path allow-list (wiki-merge-guard) refuses any PR that touches non-wiki files.
// Human-merge invariant preserved: only an admin can call this; Donny cannot.
//
// CI note (confirmed Task B0): ci.yml runs build/typecheck/lint/test on EVERY
// pull_request to main with NO path filter — so docs/wiki PRs DO trigger required
// status checks. `not_mergeable_yet` (405 from GitHub or mergeable===null after
// re-poll) is the expected transient state until CI passes.
// e2e.yml triggers on deployment_status (not as a PR check) and does NOT gate the
// merge. Confirmed against .github/workflows/ci.yml and .github/workflows/e2e.yml.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildSyncPage, SyncPage } from "../_shared/wiki-sync-payload.ts";
import { assertAllWikiPaths, dedupeByHeadBranch, MERGE_PATH_RE } from "../_shared/wiki-merge-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_WIKI_TOKEN") ?? "";
const REPO = Deno.env.get("GITHUB_WIKI_REPO") ?? "Pdiamondz1/dragoncandy-v3-d783432b";
const BASE = Deno.env.get("GITHUB_WIKI_BASE") ?? "main";
const GH = "https://api.github.com";

const SYNCABLE_STATUSES = new Set(["added", "modified", "changed"]);

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
  // Page through ALL changed files — the wiki-only guard is the merge safety gate,
  // so a >100-file PR must not slip non-wiki files past an unchecked first page.
  async function prChangedPaths(n: number): Promise<{ filename: string; status: string }[]> {
    const files: { filename: string; status: string }[] = [];
    for (let page = 1; page <= 30; page++) { // cap 3000 files; knowledge PRs are tiny
      const r = await fetch(`${GH}/repos/${REPO}/pulls/${n}/files?per_page=100&page=${page}`, { headers: ghHeaders() });
      if (!r.ok) throw new Error(`github pr files ${r.status}`);
      const batch = await r.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      files.push(...batch.map((f: { filename: string; status: string }) => ({ filename: f.filename, status: f.status })));
      if (batch.length < 100) break;
    }
    return files;
  }

  try {
    if (action === "list") {
      const r = await fetch(`${GH}/repos/${REPO}/pulls?state=open&base=${BASE}&per_page=100`, { headers: ghHeaders() });
      if (!r.ok) return json({ error: `github list ${r.status}` }, 502);
      const raw = await r.json();
      const rows = [];
      for (const pr of raw) {
        const files = await prChangedPaths(pr.number);
        const paths = files.map((f) => f.filename);
        if (!assertAllWikiPaths(paths)) continue; // skip non-knowledge PRs
        if (!files.every((f) => SYNCABLE_STATUSES.has(f.status))) continue; // skip PRs with deletions/renames
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
      const files = await prChangedPaths(n);
      const paths = files.map((f) => f.filename);
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
      const files = await prChangedPaths(n);
      const paths = files.map((f) => f.filename);
      if (!assertAllWikiPaths(paths)) return json({ error: "non_wiki_paths" }, 400);
      if (!files.every((f) => SYNCABLE_STATUSES.has(f.status))) return json({ error: "unsupported_file_status" }, 400);

      // 2. Merge unless already merged. GitHub computes `mergeable` async (null
      //    on first read) — re-poll once, then defer to the panel if still unknown.
      if (!pr.merged) {
        if (pr.mergeable === null) {
          await new Promise((r) => setTimeout(r, 1500));
          prRes = await fetch(`${GH}/repos/${REPO}/pulls/${n}`, { headers: ghHeaders() });
          if (!prRes.ok) return json({ error: `github re-poll ${prRes.status}` }, 502);
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
      const pages: SyncPage[] = [];
      for (const path of paths) {
        const fr = await fetch(`${GH}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(BASE)}`, { headers: ghHeaders() });
        if (!fr.ok) return json({ error: `github merged-contents ${fr.status}` }, 502);
        const raw = new TextDecoder().decode(
          Uint8Array.from(atob((await fr.json()).content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
        );
        pages.push(buildSyncPage(path, raw));
      }
      // POST in batches — donny-knowledge-sync rejects pages.length > 100.
      // Matches sync-internal-docs.mjs BATCH=20 (heavy full_content payloads).
      // The PR is already merged (durable) before this loop runs; a failed batch
      // reports merged:true/synced:false — the nightly knowledge-freshness agent
      // self-heals donny_knowledge/internal_docs lag, and re-invoking merge on this
      // PR re-runs the sync idempotently.
      const SYNC_BATCH = 20;
      let syncErrors = 0;
      let syncTransportError: string | null = null;
      for (let i = 0; i < pages.length; i += SYNC_BATCH) {
        const batch = pages.slice(i, i + SYNC_BATCH);
        const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/donny-knowledge-sync`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ pages: batch }),
        });
        const syncBody = await syncRes.json().catch(() => ({}));
        if (!syncRes.ok) { syncTransportError = `sync ${syncRes.status}`; break; }
        // donny-knowledge-sync returns 200 even on per-page upsert failures — surface them.
        // The response includes an aggregate `errors` count (see donny-knowledge-sync/index.ts line ~175).
        syncErrors += (syncBody as { errors?: number }).errors ?? 0;
      }
      if (syncTransportError || syncErrors > 0) {
        const sync_error = syncTransportError ?? `${syncErrors} page(s) failed to sync`;
        return json({ merged: true, synced: false, sync_error });
      }
      return json({ merged: true, synced: true, synced_paths: paths });
    }

    return json({ error: `unknown action "${action}"` }, 400);
  } catch (e) {
    return json({ error: `merge failed: ${(e as Error).message}` }, 502);
  }
});
