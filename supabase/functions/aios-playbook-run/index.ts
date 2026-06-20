// aios-playbook-run
// Executes a saved AIOS Founder Playbook (see
// docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md).
//
// Report-only + propose: a run reads internal data with internal Donny's READ
// tools, composes a report, self-assesses against the playbook's done-criteria,
// and — only if the playbook allows it — PROPOSES corrections through the
// existing aios-report-ingest choke point. Nothing auto-applies; a founder
// approves every proposal at /internal/corrections.
//
// Self-contained by design (spec §4.1 "self-contained runner"): it carries a
// compact copy of just the internal READ tools + propose_correction so it never
// imports from donny-chat (which calls serve() at module load) and never
// touches the live chat endpoint.
//
// Auth: verify_jwt=false at the gateway (so the browser CORS OPTIONS preflight
// reaches the handler); the function does its OWN auth — it builds the tool
// client from the caller's session JWT so the live-stats RPCs (which require
// auth.uid()) work and do NOT degrade to the no-session stub, and requires an
// admin role. The service role is used only to read the playbook and write runs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { logCost } from "../_shared/cost-ledger.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const STALE_RUN_MS = 5 * 60 * 1000;
const MAX_TOOL_ROUNDS = 10;
const TOKEN_SAFETY_NET = 300_000;
const MODEL = "claude-sonnet-4-6";

// --- Internal READ tools (compact copy mirroring donny-chat's internal slice).
// v1 omits semantic search (search_internal_knowledge) to avoid the embeddings
// dependency; get_internal_doc (list + fetch) covers finding the right doc. ---
const READ_TOOL_DEFINITIONS = [
  {
    name: "get_internal_doc",
    description:
      "Read internal strategy/wiki docs in FULL. Call with no path to LIST every doc as {path, title}; call with a path to get {path, title, content_md}. Use before proposing a strategy_doc correction.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Exact doc path; omit to list all docs" } },
    },
  },
  {
    name: "get_platform_stats",
    description:
      "Live platform stats: users per role, restaurants/locations, creators, brands, campaigns by status, DragonShare posts/boosts, promotions, content, social connections.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_revenue_stats",
    description: "Aggregate revenue: payment-event sums and DragonShare boost totals (80/20 split).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_cost_stats",
    description: "AI spend from the cost ledger: month-to-date totals by model tier, daily series, latest alert.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_platform_weight_trend",
    description:
      "Daily platform-weight snapshots (db/storage bytes, total users, key table row counts). For scaling/growth/capacity questions.",
    input_schema: {
      type: "object",
      properties: { days: { type: "number", description: "Recent daily snapshots (default 30, max 90)" } },
    },
  },
  {
    name: "get_latest_briefing",
    description: "The most recent weekly operating brief: title, week, KPI status list, full markdown body.",
    input_schema: { type: "object", properties: {} },
  },
];

const PROPOSE_TOOL_DEFINITION = {
  name: "propose_correction",
  description:
    "Propose a correction to internal data for FOUNDER APPROVAL — you do NOT apply it. target_type 'dashboard_setting' (target_ref e.g. 'current_compute_tier_index', proposed_value the new value) or 'strategy_doc' (target_ref the doc path, proposed_value the FULL corrected markdown — fetch it with get_internal_doc first). Include a clear title and rationale_md. It only QUEUES at /internal/corrections; NEVER say it is applied.",
  input_schema: {
    type: "object",
    properties: {
      target_type: { type: "string", enum: ["dashboard_setting", "strategy_doc"] },
      target_ref: { type: "string", description: "Setting key or strategy doc path" },
      title: { type: "string", description: "Short label for the correction" },
      rationale_md: { type: "string", description: "Why the current value is wrong, with evidence" },
      proposed_value: { description: "New value: number/string for a setting; full corrected markdown for a doc" },
    },
    required: ["target_type", "target_ref", "title", "rationale_md", "proposed_value"],
  },
};

interface Playbook {
  id: string;
  slug: string;
  title: string;
  task_md: string;
  preferences_md: string;
  done_criteria_md: string;
  allowed_proposals: string[];
}

// deno-lint-ignore no-explicit-any
type Json = any;

function buildSystemPrompt(fullName: string, pb: Playbook, allowProposals: boolean): { stable: string; volatile: string } {
  const proposalRules = allowProposals
    ? `\n- If — and only if — the task calls for fixing an internal value and you have concrete evidence, call propose_correction (allowed target_type: ${pb.allowed_proposals.join(", ")}). It only QUEUES a proposal for founder approval at /internal/corrections; never claim it is applied or done.`
    : `\n- This playbook is report-only. Do NOT attempt to change any setting or doc; just report findings.`;

  const stable = `You are Donny, DragonCandy's internal operations analyst, executing a SAVED PLAYBOOK on the founders-only AIOS surface. Everything here is internal company data and may be discussed freely.

## How you work
- Answer ONLY from tool results. Never fabricate or estimate a number a tool didn't return.
- Use tools proactively: platform questions → get_platform_stats; money in → get_revenue_stats; AI spend → get_cost_stats; growth/scaling/capacity → get_platform_weight_trend; weekly brief or KPI status → get_latest_briefing; strategy/pricing/playbooks/targets/kill-switches → get_internal_doc (call with no path to list all docs, then with the path to read the right one in full).
- Monetary values from tools are in cents unless labeled otherwise — convert to dollars when presenting.
- Be direct and analytical. Flag bad news plainly. Use short labeled bullet lists, not tables.${proposalRules}

## Required ending (MANDATORY)
After your report, end your final message with a fenced JSON self-assessment, exactly this shape and nothing after it:
\`\`\`json
{"done": true, "checklist": [{"criterion": "<each done-criterion, verbatim or summarized>", "met": true}], "missing": []}
\`\`\`
Set "done" strictly per the playbook's Definition of done: true only if every criterion is met. List any unmet criteria in "missing". If the playbook states no explicit criteria, set done=true with an empty checklist.`;

  const volatile = `You are running the playbook for ${fullName || "a founder"}.`;
  return { stable, volatile };
}

function buildTaskMessage(pb: Playbook): string {
  return `# Playbook: ${pb.title}

## Task
${pb.task_md}

## Preferences & constraints
${pb.preferences_md?.trim() || "(none)"}

## Definition of done
${pb.done_criteria_md?.trim() || "(none specified — set done=true once the task is complete)"}

Execute this task now using the available tools, then write the report and end with the required JSON self-assessment block.`;
}

// Parse the LAST fenced JSON block (or a trailing bare object) that has a boolean
// `done`. Returns null when nothing parseable is present (UI shows a neutral chip).
function parseDoneCheck(text: string): Json | null {
  const candidates: string[] = [];
  const fenced = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const m of fenced) candidates.push(m[1].trim());
  // Fallback: a trailing bare {...} containing "done"
  const bare = text.match(/\{[\s\S]*"done"[\s\S]*\}\s*$/);
  if (bare) candidates.push(bare[0].trim());
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (parsed && typeof parsed.done === "boolean") return parsed;
    } catch { /* try the next candidate */ }
  }
  return null;
}

function extractText(content: Json): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((b: Json) => b.type === "text").map((b: Json) => b.text ?? "").join("");
  }
  return "";
}

async function executeReadTool(
  name: string,
  args: Json,
  userClient: SupabaseClient,
): Promise<Json> {
  switch (name) {
    case "get_internal_doc": {
      if (!args.path || typeof args.path !== "string") {
        const { data, error } = await userClient.from("internal_docs").select("path, title").order("title");
        if (error) throw error;
        return { docs: data ?? [], count: (data ?? []).length };
      }
      const { data, error } = await userClient
        .from("internal_docs").select("path, title, content_md").eq("path", args.path).maybeSingle();
      if (error) throw error;
      return data ?? { error: `no internal doc at path '${args.path}'` };
    }
    case "get_platform_stats": {
      const { data, error } = await userClient.rpc("aios_platform_stats");
      if (error) throw error;
      return data;
    }
    case "get_revenue_stats": {
      const { data, error } = await userClient.rpc("aios_revenue_stats");
      if (error) throw error;
      return data;
    }
    case "get_cost_stats": {
      const { data, error } = await userClient.rpc("aios_cost_stats");
      if (error) throw error;
      return data;
    }
    case "get_platform_weight_trend": {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 90);
      const { data, error } = await userClient
        .from("platform_weight")
        .select("captured_at, db_bytes, storage_bytes, users_total, row_counts")
        .order("captured_at", { ascending: false })
        .limit(days);
      if (error) throw error;
      return data;
    }
    case "get_latest_briefing": {
      const { data, error } = await userClient
        .from("aios_briefings")
        .select("week_start, title, body_md, kpis, published_at, created_at")
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? { message: "No weekly briefings exist yet." };
    }
    default:
      throw new Error(`Unknown read tool: ${name}`);
  }
}

// Propose a correction through the audited aios-report-ingest choke point (the
// server captures the before-value; the agent never writes the target). Returns
// { proposed: true, id } so the caller can collect correction_ids.
async function proposeCorrection(args: Json, slug: string, userId: string): Promise<Json> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/aios-report-ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "correction",
      payload: {
        target_type: args.target_type,
        target_ref: args.target_ref,
        title: args.title,
        rationale_md: args.rationale_md,
        proposed_value: args.proposed_value,
        proposed_by: `playbook:${slug}`,
        acting_user_id: userId,
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { error: data?.error ?? `proposal failed (${resp.status})` };
  return { proposed: true, id: data.id, review_at: "/internal/corrections" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let runId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // The caller's session — used as the tool client so auth.uid() is set and the
    // live-stats RPCs work (not the no-session stub).
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (!user || authError) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    // Admin gate (internal surface).
    const { data: adminRole } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!adminRole) return json({ error: "forbidden: admin only" }, 403);

    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const slug = typeof body.slug === "string" ? body.slug : "";
    const trigger = body.trigger === "donny" ? "donny" : "manual";
    if (!slug) return json({ error: "slug is required" }, 400);

    // Load the active playbook (service role — definition isn't user-scoped).
    const { data: pbRow, error: pbErr } = await admin
      .from("aios_playbooks")
      .select("id, slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals, status")
      .eq("slug", slug)
      .maybeSingle();
    if (pbErr) throw pbErr;
    if (!pbRow) return json({ error: `no playbook with slug '${slug}'` }, 404);
    if (pbRow.status !== "active") return json({ error: "playbook is archived" }, 409);

    const pb: Playbook = {
      ...pbRow,
      allowed_proposals: Array.isArray(pbRow.allowed_proposals) ? pbRow.allowed_proposals : [],
    };
    const allowProposals = pb.allowed_proposals.length > 0;

    // Reap stale running rows so a hard-killed run can't lock the playbook, then
    // insert this run. The partial unique index guarantees one in-flight run.
    await admin
      .from("aios_playbook_runs")
      .update({ status: "failed", error_md: "timed out (stale run reaped)", finished_at: new Date().toISOString() })
      .eq("playbook_id", pb.id)
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - STALE_RUN_MS).toISOString());

    const { data: runRow, error: runErr } = await admin
      .from("aios_playbook_runs")
      .insert({ playbook_id: pb.id, triggered_by: userId, trigger, status: "running" })
      .select("id")
      .single();
    if (runErr) {
      if ((runErr as Json).code === "23505") return json({ error: "a run is already in progress for this playbook" }, 409);
      throw runErr;
    }
    runId = runRow.id;

    // --- Agent loop ---
    const tools = allowProposals ? [...READ_TOOL_DEFINITIONS, PROPOSE_TOOL_DEFINITION] : READ_TOOL_DEFINITIONS;
    const { stable, volatile } = buildSystemPrompt(user.user_metadata?.full_name ?? "", pb, allowProposals);
    const systemBlocks = [
      { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      { type: "text", text: volatile },
    ];
    const messages: Json[] = [{ role: "user", content: buildTaskMessage(pb) }];
    const maxTokens = pb.allowed_proposals.includes("strategy_doc") ? 16384 : 8192;
    const correctionIds: string[] = [];

    const callClaude = () =>
      anthropicFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: systemBlocks, tools, messages }),
      });

    let response = await callClaude();
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    let result = await response.json();
    let totalTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
    await logCost(admin, { userId, edgeFunction: "aios-playbook-run", model: MODEL, tier: "T3", inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0 });

    let rounds = 0;
    while (result.stop_reason === "tool_use") {
      if (rounds >= MAX_TOOL_ROUNDS || totalTokens > TOKEN_SAFETY_NET) break;
      rounds++;
      const toolUseBlocks = (result.content as Json[]).filter((b: Json) => b.type === "tool_use");
      const toolResultBlocks: Json[] = [];

      for (const tu of toolUseBlocks) {
        let toolResult: Json;
        try {
          if (tu.name === "propose_correction") {
            if (!allowProposals) {
              toolResult = { error: "this playbook is report-only; corrections are not permitted" };
            } else if (!pb.allowed_proposals.includes(tu.input?.target_type)) {
              toolResult = { error: `target_type '${tu.input?.target_type}' is not allowed by this playbook` };
            } else {
              toolResult = await proposeCorrection(tu.input, pb.slug, userId);
              if (toolResult?.proposed && toolResult?.id) correctionIds.push(toolResult.id);
            }
          } else {
            toolResult = await executeReadTool(tu.name, tu.input ?? {}, userClient);
          }
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : "tool failed" };
        }
        toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(toolResult) });
      }

      messages.push({ role: "assistant", content: result.content });
      messages.push({ role: "user", content: toolResultBlocks });

      response = await callClaude();
      if (!response.ok) throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
      result = await response.json();
      totalTokens += (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
      await logCost(admin, { userId, edgeFunction: "aios-playbook-run", model: MODEL, tier: "T3", inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0 });
    }

    // If we stopped on a pending tool_use (round cap), do one no-tools turn so the
    // run always produces a report + self-assessment.
    let reportText = extractText(result.content);
    if (!reportText.trim() || result.stop_reason === "tool_use") {
      if (result.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: result.content });
        messages.push({
          role: "user",
          content: (result.content as Json[])
            .filter((b: Json) => b.type === "tool_use")
            .map((b: Json) => ({ type: "tool_result", tool_use_id: b.id, content: "Tool budget reached — write the report now from the data you have, then the JSON self-assessment." })),
        });
      }
      const finalResp = await anthropicFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: systemBlocks, messages }),
      });
      if (finalResp.ok) {
        const finalResult = await finalResp.json();
        const finalText = extractText(finalResult.content);
        if (finalText.trim()) reportText = finalText;
        totalTokens += (finalResult.usage?.input_tokens ?? 0) + (finalResult.usage?.output_tokens ?? 0);
        await logCost(admin, { userId, edgeFunction: "aios-playbook-run", model: MODEL, tier: "T3", inputTokens: finalResult.usage?.input_tokens ?? 0, outputTokens: finalResult.usage?.output_tokens ?? 0 });
      }
    }

    const doneCheck = parseDoneCheck(reportText);

    await admin
      .from("aios_playbook_runs")
      .update({
        status: "completed",
        result_summary_md: reportText || "(no report produced)",
        done_check: doneCheck,
        correction_ids: correctionIds,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return json({
      success: true,
      run_id: runId,
      status: "completed",
      result_summary_md: reportText,
      done_check: doneCheck,
      correction_ids: correctionIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "playbook run failed";
    console.error("[aios-playbook-run]", message);
    if (runId) {
      await admin
        .from("aios_playbook_runs")
        .update({ status: "failed", error_md: message, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    return json({ error: message, run_id: runId }, 500);
  }
});
