#!/usr/bin/env node
/**
 * scan-traces.mjs — read Claude Code's own session traces and report what the agent layer
 * actually did: which tools error, where permission gates trip, which skills silently fail,
 * which skills never fire at all.
 *
 * Zero dependencies (node: builtins only) and fully streamed — a project's trace directory
 * can be tens of MB, so nothing is ever read whole into memory.
 *
 * Usage:
 *   node scan-traces.mjs [--project <dir>] [--days N] [--dir <traceDir>] [--json]
 *
 *   --project <dir>  Project root to analyse. Default: cwd.
 *   --days N         Look-back window in days. Default: 14.
 *   --dir <path>     Trace directory override. Skips cwd->slug resolution entirely.
 *   --json           Emit raw JSON instead of the human summary.
 *
 * PRIVACY: transcripts contain the operator's own prompts and may contain secrets. This
 * script emits aggregate counts plus SHORT, REDACTED error strings — never transcript
 * content. Do not change that without reading the privacy rule in SKILL.md.
 */

import { createReadStream } from "node:fs";
import { readdir, stat, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_DAYS = 14;
const ERR_SNIPPET_MAX = 200;
const REPEAT_FAILURE_MIN = 3;      // same tool failing >=N times in one session = reported cluster
const CLUSTER_GATE = 5;            // ...but only >=N fails a gating check (3 is common and noisy)
const SKILL_MIN_TURNS = 10;        // ignore error rate on skills with too little activity to judge
const SKILL_ERROR_RATE_GATE = 0.25;
// Policy events: reported and grouped, but never counted as failures. A gate that blocks is
// the system working; counting it as a fault is how an auditor invents its own bad news.
const ADVISORY_KINDS = new Set(["hook-blocked", "policy-blocked", "classifier-denial", "permission-denial"]);

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const args = { project: process.cwd(), days: DEFAULT_DAYS, dir: null, json: false, includeGlobal: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--include-global") args.includeGlobal = true;
    else if (a === "--days") args.days = Number(argv[++i]) || DEFAULT_DAYS;
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--project") args.project = argv[++i];
  }
  return args;
}

// ---------------------------------------------------------------- trace dir resolution

/**
 * Claude Code stores a project's sessions under ~/.claude/projects/<slug>, where the slug is
 * the absolute project path with every non-alphanumeric character replaced by "-".
 * A git worktree is a distinct path, so it gets its OWN directory — scanning the main
 * checkout will not show you a worktree's sessions.
 */
export function slugForProject(projectPath) {
  return path.resolve(projectPath).replace(/[^A-Za-z0-9-]/g, "-");
}

async function resolveTraceDir(projectPath) {
  const root = path.join(homedir(), ".claude", "projects");
  const exact = path.join(root, slugForProject(projectPath));
  try {
    if ((await stat(exact)).isDirectory()) return { dir: exact, root };
  } catch { /* fall through to fuzzy match */ }

  // Fallback: the slug rule can drift between Claude Code versions. Match on the basename
  // so a rename of the transform doesn't silently yield "no traces found".
  const base = path.basename(path.resolve(projectPath)).replace(/[^A-Za-z0-9-]/g, "-");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const hit = entries.find((e) => e.isDirectory() && e.name.endsWith(base));
    if (hit) return { dir: path.join(root, hit.name), root, fuzzy: true };
  } catch { /* no projects dir at all */ }
  return { dir: null, root };
}

async function collectSessionFiles(dir, sinceMs) {
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".jsonl")) {
        try {
          const st = await stat(full);
          if (st.mtimeMs >= sinceMs) out.push({ file: full, mtimeMs: st.mtimeMs });
        } catch { /* vanished mid-scan */ }
      }
    }
  }
  await walk(dir);
  return out;
}

// ---------------------------------------------------------------- redaction

const SECRET_PATTERNS = [
  /\bsb_secret_[A-Za-z0-9_-]+/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, // JWT
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,          // classic GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,        // fine-grained PATs — a DIFFERENT prefix
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /\b(?:api[_-]?key|token|secret|password)["'\s:=]+[A-Za-z0-9._-]{12,}/gi,
];

export function redact(text) {
  let s = String(text ?? "");
  for (const re of SECRET_PATTERNS) s = s.replace(re, "[REDACTED]");
  return s;
}

export function snippet(text) {
  const s = redact(text).replace(/\s+/g, " ").trim();
  return s.length > ERR_SNIPPET_MAX ? s.slice(0, ERR_SNIPPET_MAX) + "…" : s;
}

// ---------------------------------------------------------------- classification

/**
 * A permission/classifier denial is a fundamentally different signal from a tool error:
 * the tool did not fail, the agent was stopped. These are the highest-value lines in a
 * trace because they mark where autonomy and policy actually collide.
 */
export function classifyError(text) {
  const s = String(text ?? "");
  // A hook that RAN and returned a decision is the gate working, not breaking. Claude Code
  // surfaces a hook denial with an "error" prefix, and a prompt-type hook echoes its own
  // prompt in brackets before the decision: `hook error: [<prompt>]: <reason>`. Classifying
  // that as a failure inverts the finding — it reports a gate that is correctly failing
  // CLOSED as one that is failing open. Only a hook with no decision payload is a real fault.
  // Match on "hook error" alone — the hook type can appear either BEFORE it
  // (`PreToolUse:Bash hook error: [...]`) or inside the brackets
  // (`hook error: [PreToolUse:...]: <decision>`). Requiring the prefix drops the second
  // shape into tool-error, where policy blocks masquerade as failures and inflate the
  // repeat-failure clusters. The bracketed decision payload is the reliable discriminator.
  if (/hook error/i.test(s)) {
    return /hook error:\s*\[[\s\S]*?\]\s*:/.test(s) ? "hook-blocked" : "hook-error";
  }
  // Likewise a blocked tool call is a policy event, not a malfunction.
  if (/<tool_use_error>\s*Blocked:/i.test(s)) return "policy-blocked";
  if (/denied by the Claude Code auto mode classifier/i.test(s)) return "classifier-denial";
  if (/Permission (for this action was denied|denied)/i.test(s)) return "permission-denial";
  if (/requested permissions?.*(hasn't granted|not granted)/i.test(s)) return "permission-denial";
  if (/\btimed out\b|\btimeout\b/i.test(s)) return "timeout";
  return "tool-error";
}

/** Group an error to a stable key so the same failure across sessions collapses to one row. */
export function fingerprintError(tool, text) {
  const s = redact(text)
    .replace(/\s+/g, " ")
    .replace(/0x[0-9a-f]+/gi, "0xN")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b\d+\b/g, "N")
    .trim()
    .slice(0, 120);
  return `${tool}::${s}`;
}

// ---------------------------------------------------------------- the scan

function newAcc() {
  return {
    files: 0, lines: 0, parseErrors: 0,
    sessions: new Set(),
    branches: new Map(),
    tools: new Map(),          // toolName -> calls
    skills: new Map(),         // skill -> { turns, errors }
    agents: new Map(),         // subagent type -> turns
    errorsByTool: new Map(),   // toolName -> count
    errorGroups: new Map(),    // fingerprint -> { tool, kind, count, sample, sessions:Set }
    clusters: [],              // repeat-failure clusters
    totalErrors: 0,
    firstMs: null, lastMs: null,
  };
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

async function scanFile(file, acc, sinceMs) {
  // tool_use id -> tool name, so a tool_result error can be attributed to a real tool.
  // Without this correlation every error groups as "?" — the tool name simply is not on
  // the result object. This is the one non-obvious part of the whole script.
  const toolNames = new Map();
  // tool_use_id -> the attributionSkill of the assistant turn that ISSUED the call. A
  // tool_result arrives on a USER turn carrying no attributionSkill, so it must be attributed
  // through the id. A "last skill seen" carry-forward is NOT good enough: it charges a short
  // git skill with browser timeouts from unrelated later work (observed: refresh-main showed a
  // fabricated 68% error rate built almost entirely from Chrome screenshot failures it never
  // issued). Exact id-based attribution or nothing.
  const toolSkills = new Map();
  const perSessionToolFails = new Map(); // "session::tool" -> count
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    acc.lines++;
    let o;
    try { o = JSON.parse(line); } catch { acc.parseErrors++; continue; }

    const content = o.message?.content;

    // Map tool_use id -> name for EVERY record, in window or not. A long session's
    // tool_result can reference a tool_use emitted before the boundary, and losing that
    // mapping would drop the error back into the useless "?" bucket.
    if (Array.isArray(content)) {
      for (const block of content) {
        // Names only. Skill attribution is bound to the window below, so an error's
        // numerator can never outlive its turn in the denominator.
        if (block?.type === "tool_use" && block.name && block.id) toolNames.set(block.id, block.name);
      }
    }

    // The mtime prefilter only chooses FILES. A long-lived or resumed session can be
    // modified inside the window while holding events from long before it, so without
    // this per-record check a stale hook error or denial would be counted against the
    // requested --days and fail the gate for something that happened months ago.
    // Records with no parseable timestamp are kept: they cannot be placed, and dropping
    // them would hide real failures. (Skill attribution is unaffected by this cutoff: it
    // rides the toolSkills id map built above, which is window-independent.)
    const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(ts) && ts < sinceMs) continue;

    if (o.sessionId) acc.sessions.add(o.sessionId);
    if (o.gitBranch) bump(acc.branches, o.gitBranch);
    if (o.attributionAgent) bump(acc.agents, o.attributionAgent);

    if (!Number.isNaN(ts)) {
      if (acc.firstMs === null || ts < acc.firstMs) acc.firstMs = ts;
      if (acc.lastMs === null || ts > acc.lastMs) acc.lastMs = ts;
    }

    const skill = o.attributionSkill || null;
    if (skill) {
      if (!acc.skills.has(skill)) acc.skills.set(skill, { turns: 0, errors: 0 });
      acc.skills.get(skill).turns++;
      // Bind attribution to a turn that was actually counted. If the issuing turn falls
      // outside --days it contributes no `turns`, so its later in-window failure must not
      // contribute `errors` either — otherwise a boundary-crossing session inflates the
      // numerator against a denominator that was never incremented, and the rate gate trips
      // on arithmetic rather than on anything real.
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use" && block.id) toolSkills.set(block.id, skill);
        }
      }
    }

    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block?.type === "tool_use" && block.name) {
        bump(acc.tools, block.name); // id->name mapping already done above, window-independent
        continue;
      }
      if (block?.type !== "tool_result") continue;

      const isError = block.is_error === true || o.toolUseResult?.is_error === true;
      if (!isError) continue;

      const tool = toolNames.get(block.tool_use_id) || o.toolUseResult?.toolName || "unknown";
      const raw = typeof block.content === "string"
        ? block.content
        : Array.isArray(block.content)
          ? block.content.map((c) => c?.text ?? "").join(" ")
          : JSON.stringify(o.toolUseResult ?? "");

      // Classify BEFORE counting. A policy event is not a failure, so it must not touch the
      // failure counters at all — otherwise a skill that correctly trips several permission
      // blocks fails the error-rate and cluster gates for behaving properly, which is the
      // same false-positive class this classifier exists to remove.
      const kind = classifyError(raw);
      const isPolicy = ADVISORY_KINDS.has(kind);

      const fp = fingerprintError(tool, raw);
      if (!acc.errorGroups.has(fp)) {
        acc.errorGroups.set(fp, { tool, kind, count: 0, sample: snippet(raw), sessions: new Set() });
      }
      const g = acc.errorGroups.get(fp);
      g.count++;
      if (o.sessionId) g.sessions.add(o.sessionId);

      if (isPolicy) continue; // grouped and reported, never counted as a failure

      acc.totalErrors++;
      bump(acc.errorsByTool, tool);
      // Exact attribution via the issuing assistant turn. Unattributed errors stay
      // unattributed — charging them to a nearby skill is how a clean skill acquires a
      // fabricated error rate.
      const owner = toolSkills.get(block.tool_use_id) || null;
      if (owner) {
        if (!acc.skills.has(owner)) acc.skills.set(owner, { turns: 0, errors: 0 });
        acc.skills.get(owner).errors++;
      }

      const ck = `${o.sessionId || file}::${tool}`;
      perSessionToolFails.set(ck, (perSessionToolFails.get(ck) || 0) + 1);
    }
  }

  for (const [key, count] of perSessionToolFails) {
    if (count >= REPEAT_FAILURE_MIN) {
      const [session, tool] = key.split("::");
      acc.clusters.push({ session, tool, count, file: path.basename(file) });
    }
  }
  acc.files++;
}

// ---------------------------------------------------------------- declared skills (dead-skill check)

/**
 * Only PROJECT skills by default. A global skill that never fires in one project is normal,
 * not a finding — including them turned an actionable list of ~20 into 85 rows of other
 * projects' tooling, which is how a useful signal becomes noise nobody reads.
 */
async function declaredSkills(projectPath, includeGlobal = false) {
  const bases = [path.join(projectPath, ".claude", "skills")];
  if (includeGlobal) bases.push(path.join(homedir(), ".claude", "skills"));
  const out = new Set();
  for (const base of bases) {
    try {
      const entries = await readdir(base, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        try {
          await stat(path.join(base, e.name, "SKILL.md"));
          out.add(e.name);
        } catch { /* directory without a SKILL.md is not an invocable skill */ }
      }
    } catch { /* no such skills dir */ }
  }
  return out;
}

/** attributionSkill may be namespaced ("superpowers:brainstorming"); compare on the bare name. */
function bareSkillName(s) {
  return s.includes(":") ? s.split(":").pop() : s;
}

// ---------------------------------------------------------------- report

function topN(map, n = 15) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function buildReport(acc, ctx) {
  const groups = [...acc.errorGroups.values()].sort((a, b) => b.count - a.count);
  const denials = groups.filter((g) => g.kind === "classifier-denial" || g.kind === "permission-denial");
  const hookErrors = groups.filter((g) => g.kind === "hook-error");
  const skillRows = [...acc.skills.entries()]
    .map(([name, v]) => ({ name, ...v, errorRate: v.turns ? v.errors / v.turns : 0 }))
    .sort((a, b) => b.turns - a.turns);

  const fired = new Set([...acc.skills.keys()].map(bareSkillName));
  const dead = [...ctx.declared].filter((s) => !fired.has(s)).sort();

  // The four gating conditions. Each is a pure count so the verdict is reproducible:
  // same traces in -> same verdict out. Everything else in this report is advisory.
  const bigClusters = acc.clusters.filter((c) => c.count >= CLUSTER_GATE);
  const failingSkills = skillRows.filter(
    (s) => s.turns >= SKILL_MIN_TURNS && s.errorRate > SKILL_ERROR_RATE_GATE,
  );
  const gate = { // exposed as `observations` — counts a human interprets, never a verdict
    hookErrors: hookErrors.reduce((n, g) => n + g.count, 0),
    denials: denials.reduce((n, g) => n + g.count, 0),
    failingSkills: failingSkills.map((s) => ({
      name: s.name, turns: s.turns, errors: s.errors, pct: Math.round(s.errorRate * 100),
    })),
    bigClusters,
  };

  return {
    observations: gate,
    scope: {
      project: ctx.project,
      traceDir: ctx.traceDir,
      fuzzyMatch: ctx.fuzzy || false,
      windowDays: ctx.days,
      files: acc.files,
      lines: acc.lines,
      sessions: acc.sessions.size,
      parseErrors: acc.parseErrors,
      firstEvent: acc.firstMs ? new Date(acc.firstMs).toISOString() : null,
      lastEvent: acc.lastMs ? new Date(acc.lastMs).toISOString() : null,
    },
    totals: { toolCalls: [...acc.tools.values()].reduce((a, b) => a + b, 0), errors: acc.totalErrors },
    denials: denials.map((g) => ({ tool: g.tool, kind: g.kind, count: g.count, sessions: g.sessions.size, sample: g.sample })),
    hookErrors: hookErrors.map((g) => ({ tool: g.tool, count: g.count, sessions: g.sessions.size, sample: g.sample })),
    errorGroups: groups.slice(0, 25).map((g) => ({ tool: g.tool, kind: g.kind, count: g.count, sessions: g.sessions.size, sample: g.sample })),
    errorsByTool: topN(acc.errorsByTool),
    repeatFailureClusters: acc.clusters.sort((a, b) => b.count - a.count).slice(0, 15),
    tools: topN(acc.tools),
    skills: skillRows,
    deadSkills: dead,
    agents: topN(acc.agents),
    branches: topN(acc.branches, 10),
  };
}

function printHuman(r) {
  const s = r.scope;
  const L = console.log;
  L(`# Trace scan`);
  L(`project     ${s.project}`);
  L(`traceDir    ${s.traceDir}${s.fuzzyMatch ? "  (fuzzy-matched)" : ""}`);
  L(`window      last ${s.windowDays}d — ${s.files} files, ${s.sessions} sessions, ${s.lines} lines`);
  if (s.parseErrors) L(`unparseable ${s.parseErrors} lines`);
  L(`totals      ${r.totals.toolCalls} tool calls, ${r.totals.errors} errors`);

  const g = r.observations;
  L(`\n## Observations — counts, NOT a verdict`);
  L(`  Every one of these has misled at least once. Verify before repeating any of them:`);
  L(`  ask "does this subject even do the thing it is blamed for?" first.`);
  L(`  hook FAILURES (a block is not a failure)   ${g.hookErrors}`);
  L(`  permission/classifier events (not bugs)    ${g.denials}`);
  L(`  skills over ${Math.round(SKILL_ERROR_RATE_GATE * 100)}% err rate            ${g.failingSkills.length}${
    g.failingSkills.length ? "  -> " + g.failingSkills.map((s) => `${s.name} ${s.pct}%`).join(", ") : ""}`);
  L(`  repeat clusters >=${CLUSTER_GATE} in a session          ${g.bigClusters.length}`);

  L(`\n## Hook errors (${r.hookErrors.length})`);
  if (!r.hookErrors.length) L(`  none`);
  for (const h of r.hookErrors) L(`  ${h.tool} ×${h.count}\n      ${h.sample}`);

  L(`\n## Permission / classifier denials (${r.denials.length})`);
  if (!r.denials.length) L(`  none`);
  for (const d of r.denials) L(`  [${d.kind}] ${d.tool} ×${d.count} (${d.sessions} sessions)\n      ${d.sample}`);

  L(`\n## Top error groups`);
  if (!r.errorGroups.length) L(`  none`);
  for (const g of r.errorGroups.slice(0, 12)) L(`  ${g.tool} ×${g.count} [${g.kind}]\n      ${g.sample}`);

  L(`\n## Repeat-failure clusters (same tool failing >=${REPEAT_FAILURE_MIN}x in one session)`);
  if (!r.repeatFailureClusters.length) L(`  none`);
  for (const c of r.repeatFailureClusters) L(`  ${c.tool} ×${c.count}  session ${String(c.session).slice(0, 8)}`);

  L(`\n## Skills (turns / errors)`);
  if (!r.skills.length) L(`  none attributed`);
  for (const k of r.skills) {
    const rate = k.turns ? ` ${(k.errorRate * 100).toFixed(0)}%` : "";
    L(`  ${k.name.padEnd(42)} ${String(k.turns).padStart(5)} turns  ${String(k.errors).padStart(4)} err${rate}`);
  }

  L(`\n## Declared but never fired in window (${r.deadSkills.length})`);
  L(r.deadSkills.length ? `  ${r.deadSkills.join(", ")}` : `  none`);

  L(`\n## Subagents`);
  if (!r.agents.length) L(`  none`);
  for (const [name, n] of r.agents) L(`  ${name.padEnd(30)} ${n}`);

  L(`\n## Tools`);
  for (const [name, n] of r.tools) L(`  ${name.padEnd(42)} ${n}`);
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = path.resolve(args.project);
  let traceDir = args.dir;
  let fuzzy = false;

  if (!traceDir) {
    const res = await resolveTraceDir(project);
    traceDir = res.dir;
    fuzzy = res.fuzzy || false;
    if (!traceDir) {
      console.error(`No trace directory found for ${project}`);
      console.error(`Looked for: ${path.join(res.root, slugForProject(project))}`);
      console.error(`Pass --dir <path> to override, or --project <dir> if the project root is elsewhere.`);
      process.exit(2);
    }
  }

  const sinceMs = Date.now() - args.days * 86400_000;
  const files = await collectSessionFiles(traceDir, sinceMs);
  if (!files.length) {
    console.error(`No .jsonl sessions modified in the last ${args.days}d under ${traceDir}`);
    process.exit(3);
  }

  const acc = newAcc();
  for (const f of files) await scanFile(f.file, acc, sinceMs);

  const report = buildReport(acc, {
    project, traceDir, fuzzy, days: args.days,
    declared: await declaredSkills(project, args.includeGlobal),
  });

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
}

// Only run when invoked directly, so the pure helpers above stay importable for tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("scan-traces.mjs")) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
