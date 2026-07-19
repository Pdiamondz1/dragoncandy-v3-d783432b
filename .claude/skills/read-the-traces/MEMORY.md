# read-the-traces — loop memory

Two zones, per `docs/wiki/concepts/loop-memory-protocol.md`. **Lessons** are read at the
start of every run and acted on. **Run Log** is append-only, newest entry at the TOP.

Memory here is **advisory**: it may sharpen prose and `missing[]` hints, but it MUST NOT
change the four deterministic gate checks.

---

## Lessons

- **Correlate `tool_use` → `tool_result` by `tool_use_id`, always.** The tool name is not on
  the result object. Grouping errors off `toolUseResult` alone attributes 100% of them to
  `"?"`, which makes the whole report useless. This is the single non-obvious mechanic in the
  scanner.
- **A `tool_result` arrives on a USER turn, which carries no `attributionSkill`** — so errors
  must be attributed through the `tool_use_id`, mapped to the **assistant turn that issued the
  call**. Do NOT use a "last skill seen" carry-forward: it charges a short skill with failures
  from unrelated later work. Verified damage — `refresh-main` (a git-only skill) reported a
  **fabricated 68% error rate** built almost entirely from Chrome screenshot timeouts it never
  issued; exact id attribution put it at 4%. Unattributed errors must stay unattributed.
- **A hook that BLOCKS is not a hook that FAILED.** Claude Code surfaces a hook denial with an
  "error" prefix; a prompt-type hook echoes its own prompt as `hook error: [<prompt>]:
  <decision>`. Classifying that as a fault inverts the finding entirely — it reports a gate
  correctly failing *closed* as one failing *open*. Same for `<tool_use_error>Blocked:`. Both
  are policy events, advisory, never gating.
- **Sanity-check a headline finding against what the skill actually does before reporting it.**
  Both false positives above would have been caught by one question: does `refresh-main` even
  drive a browser? (No.) Does a hook that printed a reasoned block message sound broken? (No.)
- **Dead-skill checks are project-scoped by default.** A global skill not firing in one
  project is normal. Including globals turned an actionable ~20-row list into 85 rows of other
  projects' tooling. Use `--include-global` only when deliberately auditing the global set.
- **A worktree has its own trace directory.** Scanning the main checkout shows nothing from a
  worktree. When a scan looks suspiciously empty, check which root you pointed at before
  concluding the window was quiet.
- **Scale is a non-issue if you stream.** 133 MB / 134 files / ~27k lines scans in ~7s with
  the heap capped at 256 MB. If it ever OOMs, something started buffering a whole file.
- **Fresh worktrees say nothing.** A 3-file scan is not evidence of a healthy agent layer.
  Widen `--days` or scan the main checkout before reporting.

---

## Run Log

### 2026-07-18 — first run (build + validation)

**Output:** verdict block in the build session; findings below routed to `/internal/findings`
as `source: "trace-audit"`.

**Happened:** Built the skill and validated it against the DragonCandy main checkout
(`--days 400`, 134 files, 8 sessions, ~27k lines, 5204 tool calls, 161 errors). All four
gates failed on real, previously-unknown defects.

**Worked:**
- Attribution via `tool_use_id` — errors resolved to real tool names on the first try.
- Streaming — 133 MB in 7s under a 256 MB heap cap.
- The known-signal check: the scan surfaced the `[Production Deploy]` classifier denial about
  an unauthenticated `--no-verify-jwt` edge function, exactly as predicted.

**Failed (and fixed mid-build):**
- Skill error attribution was silently all-zero until the last-seen-skill carry-forward.
- The dead-skill list merged global skills and was unusable noise until scoped to the project.
- Referenced a non-existent `skillRowsGate()` and used `skillRows` before its declaration —
  caught immediately by running it, not by reading it.

**Remember:** the first run's headline findings were **two-thirds wrong, and the tool's own
fault** — corrected same session. The "`PreToolUse` hook failing open" was the hook *working*
(a denial, surfaced with an "error" prefix), and "`refresh-main` fails 68%" was Chrome errors
misattributed by a last-skill-seen heuristic to a git-only skill. Both were reported to the
founder before verification and had to be retracted. What survived verification: **six
classifier denials** (real governance events, incl. a merge-without-review and a
fabricated-data prod submission), **Chrome timeouts as the largest reliability drag**, **77
declared-but-never-fired skills**, and — verified independently against prod, not via the
scanner — **`donny_tool_executions` never receiving a row from `donny-orchestrator`**.

The durable lesson is about the tool, not the findings: **an observability tool that
misclassifies is worse than none, because it manufactures alarming false positives that get
acted on.** Verify a headline finding against what the subject actually does before reporting
it.
