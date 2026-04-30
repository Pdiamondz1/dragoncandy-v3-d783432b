# Remove CAPTCHA from Login and Signup Pages

**Date:** 2026-04-30
**Status:** Approved

## Problem

Google reCAPTCHA v2 on the login and signup pages randomly fails to render, displaying "Please complete the CAPTCHA verification" and completely blocking users from authenticating. The CAPTCHA widget is loaded from Google's workspace and intermittently disappears, making it impossible for legitimate users to log in or sign up.

## Decision

Remove CAPTCHA entirely from the auth flow. Supabase Auth provides built-in rate limiting and brute-force protection. The app already enforces email verification on signup (checked again at login), which prevents fake account spam. The threat model for an early-stage marketplace does not justify the UX friction and reliability risk of reCAPTCHA v2.

## Scope

### Files to modify

| File | Action |
|------|--------|
| `src/components/auth/AuthForm.tsx` | Remove all CAPTCHA-related code |
| `src/components/auth/ReCaptcha.tsx` | Delete |
| `supabase/functions/verify-recaptcha/index.ts` | Delete |
| `supabase/config.toml` | Remove `[functions.verify-recaptcha]` entry |
| `.env.example` | Remove `VITE_RECAPTCHA_SITE_KEY` line |

### AuthForm.tsx changes

- Remove `ReCaptcha` and `ReCaptchaHandle` imports
- Remove `captchaRef` ref
- Remove `handleCaptchaExpired` and `handleCaptchaError` callbacks
- Remove CAPTCHA validation block in `handleSubmit` (token check, age check, backend verification call)
- Remove all `captchaRef.current?.reset()` calls
- Remove `<ReCaptcha>` JSX element from the form

### What stays the same

- Email verification flow (enforced on signup, checked on login)
- Supabase Auth built-in rate limiting
- All other auth logic (signup, login, social buttons, password visibility, role selection)
- No new dependencies or components

## Future consideration

If bot attacks become a problem, Cloudflare Turnstile (invisible, no user interaction) is the recommended replacement. It does not require a visible widget and has better reliability than Google reCAPTCHA.
