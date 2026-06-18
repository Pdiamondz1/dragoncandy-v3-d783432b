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
  // Escape backslashes BEFORE quotes: a double-quoted YAML scalar treats "\" as
  // an escape prefix, so an unescaped title like `C:\Users` would emit invalid
  // YAML (`\U…`) and break the later knowledge sync.
  const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
  // Collapse interior newlines so a multi-line title can't break the YAML
  // frontmatter block (title is emitted both as a quoted scalar and an H1).
  const title = String(body.title ?? "").replace(/[\r\n]+/g, " ").trim();
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  // Clamp the provenance question so an over-long paste can't bloat the page.
  const question = typeof body.question === "string" ? body.question.slice(0, 500) : "";
  const tags = Array.isArray(body.tags)
    ? body.tags
        .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
        .filter((t) => /^[a-z0-9]/.test(t)) // drop empties and leading-dash tags
        .slice(0, 8)
    : [];

  if (!FOLDERS.includes(folder)) return json({ error: "invalid_folder" }, 400);
  if (!FILENAME_RE.test(filename)) return json({ error: "invalid_filename" }, 400);
  if (!title) return json({ error: "title required" }, 400);
  if (title.length > 200) return json({ error: "title too long (max 200 chars)" }, 400);
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

    // 3. branch — folder+filename-derived ⇒ re-saving the SAME page recovers the
    //    same branch/PR (idempotent), but `concepts/foo` and `analyses/foo` map to
    //    DISTINCT branches so a same-filename save in another folder can't fold
    //    itself into an unrelated open PR.
    const branch = `donny-wiki-answer/${folder}-${filename}`;
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

    const putBody = (sha?: string) =>
      JSON.stringify({
        message: `docs(wiki): save Donny answer — ${title}`,
        content: toBase64(content),
        branch,
        ...(sha ? { sha } : {}),
      });

    if (existingMd !== content) {
      const putRes = await fetch(`${GH}/repos/${REPO}/contents/${path}`, {
        method: "PUT",
        headers: ghHeaders(),
        body: putBody(existingSha),
      });
      // A 422 here means our write was rejected — typically a create race: a
      // concurrent request created the file between our read and our PUT, so we
      // lacked its sha. Unlike wiki-commit-pr (where retries re-PUT IDENTICAL
      // bytes, so a 422 is a harmless no-op), two DIFFERENT answers can map to
      // the same filename here, so we must NOT assume our content landed.
      // Refetch the branch file: if it already holds our exact bytes, we're done
      // (idempotent double-submit); if it differs, a different page owns this
      // filename — report a typed conflict rather than a false success.
      if (putRes.status === 422) {
        const reRes = await fetch(
          `${GH}/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(branch)}`,
          { headers: ghHeaders() },
        );
        if (!reRes.ok) return json({ error: `github put 422 (refetch ${reRes.status})` }, 502);
        const rf = await reRes.json();
        if (decodeContent(rf.content) !== content) {
          const retry = await fetch(`${GH}/repos/${REPO}/contents/${path}`, {
            method: "PUT",
            headers: ghHeaders(),
            body: putBody(rf.sha),
          });
          if (!retry.ok) return json({ error: "save_conflict" }, 200);
        }
      } else if (!putRes.ok) {
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
