# Session Extract: Core Docs + Wiki Sync — Post-June-2 Work

## Session Metadata
- Created: 2026-06-07
- Project: C:\GIT\dragoncandy-v3-d783432b
- Branch: main (worktree: update-wiki-claude)
- Type: Documentation sync — synthesized from commits dated 2026-06-01 → 2026-06-06,
  closing the gap since the 2026-06-02 QA-staging Plan B ingest.

## Purpose

Bring `CLAUDE.md`, `PROJECT_CONTEXT.md`, and the wiki back in line with the codebase.
This extract captures the workstreams that shipped after the last wiki ingest
(2026-06-02) and were not yet reflected in any wiki page.

## Codebase Scale (verified 2026-06-07)

- **60 pages**, **183 hooks**, **73 edge functions** (excluding `_shared/`).
- Prior docs claimed 67 (CLAUDE.md) / 71 (PROJECT_CONTEXT.md) edge functions — corrected to 73.
- New edge function since last sync: `dragonshare-notify` (notifications fanout).

---

## 1. DragonShare Notifications Pipeline (shipped)

A dedicated notifications layer was built on top of the existing DragonShare
amplification engine.

- **`dragonshare-notify` fanout edge function** (commit 0feb7232) is now the single
  owner of DragonShare notification delivery across three channels: in-app bell +
  email + Donny. **Raw push inserts were retired** (88a6923d) so all delivery routes
  through this one function.
- **Notification category + routing** (c3f9679f): DragonShare is its own notification
  category (dropped from the generic "content" category, fec164a8), with its own types
  and routing.
- **Email templates** (178ec5dc): `create-notification` email mapping + 4 DragonShare
  email templates.
- **Fired on three lifecycle events** (f20095cf): submit, decline, and boost fulfillment.
- **Dashboard activity parity** (214af2ae plan → 3c2cedd6, 56d964aa, 6ed1f29b): a
  dedicated DragonShare activity card on **both** the creator and business dashboards,
  with DragonShare events folded into each role's recent-activity feed via an activity
  derive helper + creator/business activity hooks. Whole-dollar formatting matches the
  rest of the app (b2213f96); business activity query failures surface instead of
  failing silently (f0ff5e31).
- Boost-paid notifications use the clean business name (32e9ca55).

Design spec: `7cc93d25` (notifications + dashboard parity), reworked after spec review
(9cdf8894), plan at `214af2ae`.

## 2. CGC (Customer-Generated Content) Submission Unblock (shipped)

- Customer submissions were unblocked (3fa33d91): storage **upload RLS** fix + a missing
  `social_handles` column.
- Posting/download parity, real duration, atomic delete + business notifications (27828dae).
- Flag RPC + creator-platform RPC fixes; auto-draft now uses uploaded media (e9158630).

## 3. iOS Camera / Photo-Library Capture (shipped — Capacitor Phase 2 begins)

The first native value-add for the Capacitor iOS shell (advances the camera-first North
Star and satisfies App Store guideline 4.2's "more than a wrapper" bar).

- Native capture UI for DragonShare uploads.
- iOS permission strings added (camera + photo library).
- `captureFromCamera` helper feeding a shared `DragonShareUploadArea`.

This moves the Capacitor entity from "Phase 1 shipped, Phase 2 planned" to
"Phase 2 started (camera)". Push + share plugins are still next, then TestFlight.

## 4. Legal / Compliance Pages (shipped)

- Privacy Policy and Terms of Service pages added. These also satisfy the App Store
  Connect prerequisite (hosted privacy policy/terms) noted in the Capacitor entity.

## 5. Outstand Account Recovery (shipped)

- Reconcile + reconnect-needed prompt for accounts wiped by an **Outstand billing event**
  (cfeebd5a). When Outstand drops a connected account (e.g. after a billing lapse), the
  app now reconciles state and prompts the user to re-link rather than failing silently.
- Spec: account recovery after billing wipe (b49c685b).
- **Real profile photos** now surface for connected social accounts (81b213c9) — previously
  placeholder/initial avatars.

This is the first material reason to give Outstand its own wiki entity: it is the
social-posting bridge (Instagram, TikTok, YouTube) underpinning both DragonShare boosts
and Donny scheduled posts, and now has its own recovery/reconciliation behavior.

## 6. QA Staging — Plan C e2e Gate (shipped)

Completes the three-plan QA/CI-CD effort (Plan A = CI gate, Plan B = staging Supabase,
Plan C = e2e gate).

- **Plan C** (33f24f85): a curated e2e smoke gate runs on staging previews.
- e2e auth + smoke hardened to be robust against a freshly-seeded staging DB (701e0aaa).
- End-to-end QA staging/CI-CD gate **runbook** added (eee35ef5).
- DX: preview-url helper + feature-change workflow doc (59609986).
- Staging env-wiring fix carried to `VerifyEmail` catch-branch fallback (83587b84),
  completing the `VITE_SUPABASE_URL` migration started in Plan B.
- CI: Lighthouse config hardened — `.cjs` rename (type:module repo), valid presets,
  distinct desktop/mobile artifact names, bars to measured baseline (1526230e → 9eb5af9e).

## 7. Known Issue Carried Forward

- **`campaign_status` enum missing `in_progress`**: ~11 source files reference an
  `in_progress` value the enum does not contain (surfaced during the May counter-offer
  enum fix). Still un-added; should be resolved before it bites a live collaboration flow.

---

## Cross-Doc Sync Performed This Session

- `CLAUDE.md`: edge-function count 67 → 73 (two places).
- `PROJECT_CONTEXT.md`: scale date → 2026-06-07 and 71 → 73; §5 workstreams expanded
  (DragonShare notifications, iOS camera, legal pages, Outstand recovery, QA staging
  Plans A/B/C, social profile photos); §6 enum triage note; §10 71 → 73; live metrics
  refreshed with current figures.

## Related Resources

- Memory: [[project_qa_staging_supabase]], [[project_lovable_edge_function_deploy_gap]],
  [[project_dragonshare_content_file_path_public_url]], [[project_apple_app_store_strategy]]
- Prior ingest: [[QA Staging Supabase (Plan B) Session]] (2026-06-02)
- Specs: `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`,
  `docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`

---

**Security Reminder**: No secret values are recorded here — names and locations only.
