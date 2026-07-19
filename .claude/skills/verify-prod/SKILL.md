---
name: verify-prod
description: "Verify a deploy on dragoncandy.io after pushing to main — poll for the new bundle, then screenshot desktop + mobile and capture console errors. Use after merging/deploying, or when asked to 'verify prod', 'check the deploy', 'test both viewports'."
---

# Verify Prod (DragonCandy)

DragonCandy-specific deploy verification. Vercel deploys from `origin/main` and typically
lands in ~1–3 minutes (was tens of minutes under Lovable hosting, pre-2026-07-15); verify
by polling the bundle hash, then check both viewports for render
+ console errors. See [[project_verification_env_quirks]]. (For generic local-change
verification use the built-in `/verify`; use this for the real prod deploy.)

## Steps

1. **Baseline the current bundle hash** (before the deploy lands):
   ```bash
   curl -s https://dragoncandy.io/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
   ```

2. **Poll until it changes** (deploy live). Run in the background (Bash `run_in_background`),
   bounded so it can't hang forever:
   ```bash
   base="assets/index-XXXX.js"   # the baseline from step 1
   for i in $(seq 1 60); do
     cur=$(curl -s --max-time 20 https://dragoncandy.io/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
     [ -n "$cur" ] && [ "$cur" != "$base" ] && { echo "DEPLOY_LIVE $cur after ~${i}min"; exit 0; }
     sleep 60
   done; echo "DEPLOY_NOT_DETECTED"; exit 1
   ```

3. **Confirm it's the intended code** — fetch the new bundle and grep for strings the change
   added/removed (sanity that the right build deployed).

4. **Verify both viewports** with the `browser-use` skill (set `PYTHONUTF8=1 PYTHONIOENCODING=utf-8`
   on Windows). Inject a console/error collector BEFORE load via CDP
   (`Page.addScriptToEvaluateOnNewDocument`), then for each viewport navigate, read `window.__errs`,
   and screenshot:
   - **Desktop:** `Emulation.setDeviceMetricsOverride {width:1440,height:900,mobile:false}`.
   - **Mobile:** `Emulation.setDeviceMetricsOverride {width:390,height:844,deviceScaleFactor:3,mobile:true}`.
   (See `browser-use` `references/cdp-python.md` for the `browser-use python` CDP recipe.)

5. **Report:** new bundle hash, `#root` mounted, **console errors = 0** on each viewport, and the
   two screenshots. Flag any error or layout breakage.

## Let the page settle before you capture

Screenshot timeouts are the single largest source of tool errors in this project's traces — 38 of
them, ~29% of all recorded errors — and the second-biggest group names the cause outright:
*"Script injection timed out — the page is busy or mid-navigation."* Capturing is not free: it
injects a script, and a busy renderer cannot answer. These are avoidable, not ambient flakiness.

- **Never capture immediately after `navigate` or a `setDeviceMetricsOverride`.** Both leave the
  renderer mid-work — and step 4 does exactly that twice, which is why this skill owns most of the
  failures. Wait for quiet first: poll `document.readyState === 'complete'`, confirm the element you
  actually care about exists, then capture.
- **A 30s `Page.captureScreenshot` timeout is not flakiness to retry.** It means the renderer was
  still busy; retrying at the same moment reproduces it. If two captures time out in a row, stop and
  report rather than keep firing — that is how one session accumulated 17 failed captures.
- **Don't screenshot what you can read.** For a textual assertion — copy present, error banner
  absent, a route rendered — a DOM query or `get_page_text` is faster and cannot time out. Reserve
  screenshots for genuine *visual* judgment: layout, spacing, theme, overlap.
- **Two captures total is the target** (one per viewport), not a burst.

## Notes

- Local dev browser auth redirects to the prod origin and is unreliable — verify against prod, not localhost.
- Admin-only surfaces (e.g. `/internal/*`) need an internal account; if unavailable, verify the
  public/app surface and note what couldn't be checked.
- `browser-use doctor` may crash on a Windows cp1252 encoding quirk; set the UTF-8 env vars and use the commands directly.

## Verdict block (validator contract)

This skill is also a **validator**: after the human report (step 5), end with exactly one fenced
JSON block — the same `{done, checklist, missing}` shape `aios-playbook-run`'s `parseDoneCheck`
reads — so the deploy-verify step can **close a loop** (`deploy → verify-prod → fix → re-verify`).
The block MUST be the LAST fenced block in the output. See `docs/wiki/concepts/validator-skills.md`.

**Deterministic gates (these flip `met`):**
- **Deploy live** — the bundle hash changed from the baseline (step 2 returned `DEPLOY_LIVE`).
- **Intended code present** — when the change adds/removes a **grepable unique string**, the new
  bundle **contains** the added strings and **no longer contains** the removed ones (step 3), so
  this is *this* deploy and not an unrelated build that merely bumped the hash. When the change has
  no unique literal to grep (CSS-only, numeric constants, assets, minified/code-split code), this
  gate is **N/A → met** — note in prose that intended-code presence wasn't string-verifiable and
  lean on the deploy-live + mount + console gates.
- **App mounted** — `#root` has children on each viewport.
- **Console errors = 0** — `window.__errs` empty on **both** desktop and mobile (step 4).

**Advisory only (surface in the prose summary, never flip `met` and never in `missing[]`):**
visual/layout breakage and screenshot judgment are subjective — report them as advisory lines.
A viewport that can't be reached is **BLOCKED**: `met:false` + a `missing[]` note, not a silent pass.

```json
{"done": false,
 "checklist": [{"criterion": "new bundle deployed (hash changed)", "met": true},
               {"criterion": "bundle contains the intended change (step 3)", "met": true},
               {"criterion": "#root mounted (desktop + mobile)", "met": true},
               {"criterion": "console errors = 0 (desktop + mobile)", "met": false}],
 "missing": ["mobile console: 1 error `useX is not a function` at index-abc.js — investigate before trusting the deploy"]}
```

`done` = true only when every gate is met (deploy live, intended code present, app mounted, zero
console errors on both viewports).
