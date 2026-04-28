## Fix: Missing reCAPTCHA widget on Login

### What's actually missing
You're seeing the page render with email, password, and the teal "Login" button — but the Google reCAPTCHA "I'm not a robot" checkbox widget (which normally sits between the password field and the Login button) is gone. Because `AuthForm` requires a CAPTCHA token to submit, this also makes login effectively impossible.

### Root cause
The `VITE_RECAPTCHA_SITE_KEY` env var IS set, so that's not the issue. The bug is in `src/components/auth/ReCaptcha.tsx`:

1. Its `useEffect` lists `onVerify`, `onExpired`, `onError` in the dependency array.
2. In `AuthForm.tsx` (lines 315–328) those callbacks are passed as inline arrow functions, so they get a new function identity on every parent render.
3. The effect therefore re-runs on every render, repeatedly trying to call `window.grecaptcha.render(...)` on the same DOM node.
4. On the second call, Google throws `reCAPTCHA has already been rendered in this element`, which is swallowed by the try/catch — and the widget never appears.

### The fix (two small changes)

**1. `src/components/auth/ReCaptcha.tsx`** — make the effect stable and self-cleaning:
- Remove `onVerify`, `onExpired`, `onError` from the `useEffect` dependency array (depend only on `siteKey`).
- Store the latest callbacks in refs so the rendered widget always calls the current versions without re-rendering the widget.
- In the cleanup function, also clear the container's contents (`containerRef.current.innerHTML = ''`) and reset `widgetIdRef.current = null` so re-mounts can render cleanly.

**2. `src/components/auth/AuthForm.tsx`** — defensive: wrap the `onExpired` and `onError` props passed to `<ReCaptcha />` in `useCallback` so they have a stable identity. (Belt-and-suspenders; the Recaptcha fix alone is sufficient, but this avoids the same class of bug if we add deps back later.)

### Verification after the fix
- Reload `/auth/login` and confirm the Google reCAPTCHA checkbox renders between the password field and the Login button.
- Confirm the checkbox can be ticked, and that submitting without ticking still shows "Please complete the CAPTCHA verification."
- Confirm normal login still works end-to-end.

No other files need to change. The Site Gate password page is unrelated and is not affected.
