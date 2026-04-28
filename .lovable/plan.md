## Fix Missing CAPTCHA Widget on Login

### Problem

On `/auth`, the login form expects a Google reCAPTCHA v2 "I'm not a robot" checkbox to appear above the Login button. Instead, nothing renders, and submitting shows the toast "Please complete the CAPTCHA verification."

### Root Cause

`src/components/auth/ReCaptcha.tsx` waits for `window.grecaptcha` to become available, then calls `window.grecaptcha.render(...)` to mount the checkbox widget. That global is provided by Google's script at `https://www.google.com/recaptcha/api.js`, but that script is **never loaded** — it isn't in `index.html` and nothing injects it dynamically. So the polling `setInterval` runs forever and the widget never appears.

The site key (`VITE_RECAPTCHA_SITE_KEY`) is correctly set in `.env`, and the `verify-recaptcha` Supabase Edge Function is wired up — only the script tag is missing.

### Fix

Inject Google's reCAPTCHA script on demand from inside the `ReCaptcha` component (rather than `index.html`) so it only loads on auth pages and stays self-contained.

In `src/components/auth/ReCaptcha.tsx`:

1. Before starting the existing `setInterval` poll, check if the script has been added. If not, append a `<script src="https://www.google.com/recaptcha/api.js" async defer>` to `document.head`. Guard with an `id` so it only loads once even if the component remounts.
2. Keep the existing `grecaptcha` polling logic — once the script finishes loading, the global appears and `render(...)` runs as it does today.
3. Add a small console warning if `VITE_RECAPTCHA_SITE_KEY` is missing, to make future misconfigurations obvious.

No other files need to change. The site key is already set, the form already wires `captchaRef`, and the Edge Function already verifies tokens — they all start working as soon as the widget mounts.

### Verification

- Visit `/auth` → reCAPTCHA "I'm not a robot" checkbox is visible between password and Login button.
- Complete the checkbox, submit → login proceeds (no "Please complete the CAPTCHA verification" toast).
- Refresh, switch between login/signup tabs → widget still renders (script only loads once).

### Files Changed

- `src/components/auth/ReCaptcha.tsx` — add one-time script injection in the existing `useEffect`.
