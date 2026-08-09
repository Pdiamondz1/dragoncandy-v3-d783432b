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
import { createClient } from "npm:@supabase/supabase-js@2";
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

    // 4. PUT file — skip when the branch already holds the exact content (a
    //    retry after a partial prior run). GitHub's contents API 422s on
    //    unchanged content, so a 422 here is NOT fatal: fall through to the PR
    //    step, which creates or recovers the existing PR.
    if (existingMd !== content) {
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
      if (!putRes.ok && putRes.status !== 422) {
        return json({ error: `github put ${putRes.status}` }, 502);
      }
    }

    // 5. PR — recover an existing open PR if the branch already has one (a prior
    //    run created the PR but died before persisting, or two admins raced).
    //    GitHub returns 422 for POST /pulls when a PR already exists for head.
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

    // 6. Persist the PR metadata. The PR already exists, so if the row update
    //    fails we still return the URL (the user gets their PR) but flag
    //    persisted:false; a later click reconciles via the 422 path above.
    const { error: upErr } = await admin
      .from("aios_corrections")
      .update({
        wiki_pr_url: pr.html_url,
        wiki_pr_number: pr.number,
        wiki_committed_at: new Date().toISOString(),
      })
      .eq("id", correctionId);
    if (upErr) {
      console.error("wiki-commit-pr: PR created but row update failed", upErr);
      return json({ url: pr.html_url, number: pr.number, persisted: false }, 200);
    }

    return json({ url: pr.html_url, number: pr.number });
  } catch (e) {
    return json({ error: `commit failed: ${(e as Error).message}` }, 502);
  }
});
