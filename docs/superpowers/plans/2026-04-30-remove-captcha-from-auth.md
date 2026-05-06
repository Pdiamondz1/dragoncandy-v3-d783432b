# Remove CAPTCHA from Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Google reCAPTCHA v2 from login and signup pages to eliminate the intermittent CAPTCHA rendering bug that blocks users from authenticating.

**Architecture:** Pure deletion — strip all CAPTCHA-related frontend code from `AuthForm.tsx`, delete the `ReCaptcha.tsx` component, delete the `verify-recaptcha` Edge Function, and clean up config. Auth security relies on Supabase's built-in rate limiting and the existing email verification flow.

**Tech Stack:** React + TypeScript, Supabase Edge Functions, Supabase config (TOML)

**Spec:** `docs/superpowers/specs/2026-04-30-remove-captcha-from-auth-design.md`

---

### Task 1: Strip CAPTCHA from AuthForm.tsx

**Files:**
- Modify: `src/components/auth/AuthForm.tsx`

- [ ] **Step 1: Remove CAPTCHA imports**

Remove the ReCaptcha import on line 7:

```diff
- import ReCaptcha, { ReCaptchaHandle } from "./ReCaptcha";
```

- [ ] **Step 2: Remove captchaRef**

Remove the ref on line 23:

```diff
- const captchaRef = useRef<ReCaptchaHandle>(null);
```

Also remove `useRef` from the React import on line 1 if no other refs remain. Current import:

```typescript
import React, { useState, useRef, useCallback } from "react";
```

After removal (no other `useRef` or `useCallback` usage remains):

```typescript
import React, { useState } from "react";
```

- [ ] **Step 3: Remove CAPTCHA callback handlers**

Remove `handleCaptchaExpired` (lines 27-33) and `handleCaptchaError` (lines 35-41):

```diff
- const handleCaptchaExpired = useCallback(() => {
-   toast({
-     title: "CAPTCHA expired",
-     description: "Please verify again.",
-     variant: "destructive",
-   });
- }, []);
-
- const handleCaptchaError = useCallback(() => {
-   toast({
-     title: "CAPTCHA error",
-     description: "There was an error loading the CAPTCHA. Please refresh the page.",
-     variant: "destructive",
-   });
- }, []);
```

- [ ] **Step 4: Remove CAPTCHA validation block from handleSubmit**

In `handleSubmit`, remove the entire CAPTCHA validation block (lines 55-111). This is the code between `setLoading(true);` and the `if (mode === "signup")` check. Remove:

```diff
-     // Get reCAPTCHA token with timestamp
-     const tokenData = captchaRef.current?.getTokenWithAge();
-
-     if (!tokenData || !tokenData.token) {
-       onError("Please complete the CAPTCHA verification.");
-       setLoading(false);
-       return;
-     }
-
-     // Check token age (Google tokens expire after 2 minutes)
-     const tokenAgeSeconds = (Date.now() - tokenData.issuedAt) / 1000;
-     const MAX_TOKEN_AGE = 100; // 100 seconds to be safe
-
-     if (tokenAgeSeconds > MAX_TOKEN_AGE) {
-       onError("CAPTCHA expired. Please verify again.");
-       toast({
-         title: "CAPTCHA Expired",
-         description: "Please complete the CAPTCHA verification again.",
-         variant: "destructive",
-       });
-       captchaRef.current?.reset();
-       setLoading(false);
-       return;
-     }
-
-     // Verify reCAPTCHA token with backend
-     const { data: verificationData, error: verificationError } = await supabase.functions.invoke(
-       'verify-recaptcha',
-       {
-         body: { token: tokenData.token },
-       }
-     );
-
-     if (verificationError || !verificationData?.success) {
-       console.error('❌ reCAPTCHA verification failed:', verificationError || verificationData);
-
-       const errorCodes = verificationData?.errorCodes || [];
-       let errorMessage = "CAPTCHA verification failed. Please try again.";
-
-       if (errorCodes.includes('invalid-input-secret')) {
-         errorMessage = "Server configuration error. Please contact support.";
-       } else if (errorCodes.includes('timeout-or-duplicate')) {
-         errorMessage = "CAPTCHA expired or already used. Please verify again.";
-       } else if (errorCodes.includes('invalid-input-response')) {
-         errorMessage = "Invalid CAPTCHA response. Please try again.";
-       }
-
-       onError(errorMessage);
-       toast({
-         title: "Verification Failed",
-         description: errorMessage,
-         variant: "destructive",
-       });
-       captchaRef.current?.reset();
-       setLoading(false);
-       return;
-     }
```

- [ ] **Step 5: Remove all captchaRef.current?.reset() calls**

Remove every `captchaRef.current?.reset();` line remaining in `handleSubmit`. There are 5 occurrences scattered in the signup error path (line 137), signup success path (line 175), login error path (line 189), login email-verification path (line 203), and the catch block (line 220).

- [ ] **Step 6: Remove the ReCaptcha JSX element**

Remove the CAPTCHA widget from the form JSX (lines 328-333):

```diff
-         {/* reCAPTCHA Widget */}
-         <ReCaptcha
-           ref={captchaRef}
-           onExpired={handleCaptchaExpired}
-           onError={handleCaptchaError}
-         />
```

- [ ] **Step 7: Verify the file compiles**

Run: `npx tsc --noEmit src/components/auth/AuthForm.tsx`

If that doesn't work with a single file, run:

```bash
npx tsc --noEmit
```

Expected: no errors related to AuthForm.tsx. There may be pre-existing errors in other files — ignore those.

- [ ] **Step 8: Commit**

```bash
git add src/components/auth/AuthForm.tsx
git commit -m "fix: remove CAPTCHA gate from login and signup forms

CAPTCHA widget randomly failed to render, blocking users from
authenticating. Auth security now relies on Supabase rate limiting
and existing email verification flow."
```

---

### Task 2: Delete ReCaptcha component

**Files:**
- Delete: `src/components/auth/ReCaptcha.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm src/components/auth/ReCaptcha.tsx
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "ReCaptcha" src/
```

Expected: no results (AuthForm.tsx import was already removed in Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/ReCaptcha.tsx
git commit -m "chore: delete ReCaptcha component"
```

---

### Task 3: Delete verify-recaptcha Edge Function

**Files:**
- Delete: `supabase/functions/verify-recaptcha/index.ts`

- [ ] **Step 1: Delete the function directory**

```bash
rm -rf supabase/functions/verify-recaptcha
```

- [ ] **Step 2: Remove from supabase/config.toml**

Remove the `[functions.verify-recaptcha]` block (lines 15-16):

```diff
- [functions.verify-recaptcha]
- verify_jwt = false
-
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/verify-recaptcha supabase/config.toml
git commit -m "chore: delete verify-recaptcha edge function and config"
```

---

### Task 4: Clean up environment config

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Remove VITE_RECAPTCHA_SITE_KEY from .env.example**

Remove line 14:

```diff
- VITE_RECAPTCHA_SITE_KEY=
```

The file should end with:

```
# Google
VITE_GOOGLE_MAPS_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: remove RECAPTCHA env var from .env.example"
```

---

### Task 5: Smoke test login and signup

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test login page**

Open `http://localhost:5173/auth?mode=login` in a browser. Verify:
- No CAPTCHA widget visible
- No "Please complete the CAPTCHA verification" error
- No console errors related to reCAPTCHA or grecaptcha
- Login form submits normally (email + password → login button)

- [ ] **Step 3: Test signup page**

Open `http://localhost:5173/auth?mode=signup` in a browser. Verify:
- No CAPTCHA widget visible
- No console errors related to reCAPTCHA
- Signup form submits normally (full name + email + password → create account)

- [ ] **Step 4: Test mobile viewport**

In browser DevTools, toggle device toolbar (375px width). Repeat login and signup checks — confirm no CAPTCHA widget, no errors, form layout is correct.
