---
name: verify-prod
description: "Verify a deploy on dragoncandy.io after pushing to main — poll for the new bundle, then screenshot desktop + mobile and capture console errors. Use after merging/deploying, or when asked to 'verify prod', 'check the deploy', 'test both viewports'."
---

# Verify Prod (DragonCandy)

DragonCandy-specific deploy verification. Lovable deploys from `origin/main` and takes
tens of minutes; verify by polling the bundle hash, then check both viewports for render
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
- **App mounted** — `#root` has children on each viewport.
- **Console errors = 0** — `window.__errs` empty on **both** desktop and mobile (step 4).

**Advisory only (note in `missing[]`, never flip `met`):** visual/layout breakage and screenshot
judgment are subjective — surface them as advisory lines, don't gate on them. A viewport that
can't be reached is **BLOCKED**: `met:false` + a `missing[]` note, not a silent pass.

```json
{"done": false,
 "checklist": [{"criterion": "new bundle deployed (hash changed)", "met": true},
               {"criterion": "#root mounted (desktop + mobile)", "met": true},
               {"criterion": "console errors = 0 (desktop + mobile)", "met": false}],
 "missing": ["mobile console: 1 error `useX is not a function` at index-abc.js — investigate before trusting the deploy"]}
```

`done` = true only when every gate is met (deploy live, app mounted, zero console errors on both viewports).
