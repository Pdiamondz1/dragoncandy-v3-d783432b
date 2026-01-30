
## Goal
Fix the “can’t type / can’t edit” behavior on **Restaurant Dashboard → Settings → Business Profile** so users can freely edit fields and save changes.

## What’s most likely happening (root cause)
In `src/pages/BusinessSettings.tsx`, the profile-loading `useEffect` includes `setFormDataFromProfile` in its dependency array:

```ts
useEffect(() => { ... }, [user, navigate, setFormDataFromProfile]);
```

But in `src/hooks/useBusinessProfileForm.ts`, `setFormDataFromProfile` is **not memoized** (it’s created inline on every render). That means:
- Every keystroke triggers state update → component re-renders
- `setFormDataFromProfile` becomes a new function reference
- The `useEffect` re-runs
- It re-fetches the profile and **resets the form state back to the DB values**
- This feels like “I can’t type” (because your input keeps snapping back)

There is also a secondary issue: `BusinessSettings.tsx` loads from `business_profiles` with only `.eq('user_id', user.id).maybeSingle()` and **does not filter `account_type`**. If a user ever has both `restaurant` + `brand` rows, this can lead to wrong row selection or multiple-row issues.

## Plan (code changes)

### 1) Fix form reset loop by stabilizing `setFormDataFromProfile`
**File:** `src/hooks/useBusinessProfileForm.ts`

- Add a `hasLoadedRef` guard like you already do in `useCreatorProfileForm`.
- Wrap `setFormDataFromProfile` in `useCallback` so it has a stable identity.
- Prevent overwriting user edits after initial load.

Implementation approach:
- `const hasLoadedRef = useRef(false)`
- `const setFormDataFromProfile = useCallback((businessProfile) => { if (hasLoadedRef.current) return; ...; hasLoadedRef.current = true; }, [])`
- Optionally add a `resetLoaded()` function if we ever need to force reload.

This ensures the page can load profile values once, and then user typing won’t be overwritten.

### 2) Ensure Business Settings loads the restaurant profile specifically
**File:** `src/pages/BusinessSettings.tsx`

Update the query in `loadProfile` to:
- Filter by `account_type = 'restaurant'` to match the settings page role
- Use `.maybeSingle()` safely and log/handle errors

Change:
```ts
.from('business_profiles')
.select('*')
.eq('user_id', user.id)
.eq('account_type', 'restaurant')
.maybeSingle();
```

This prevents loading the wrong profile data and prevents ambiguity if the user has multiple `business_profiles` rows.

### 3) Make the effect run only when it should (once per user session)
**File:** `src/pages/BusinessSettings.tsx`

After step (1), `setFormDataFromProfile` becomes stable. We will:
- Keep it in deps (safe now), OR
- Remove it from deps and rely on `user.id` changes only (also safe)

Preferred approach:
- Keep dependencies minimal: `[user?.id, navigate]`
- Call `setFormDataFromProfile` after fetch (the callback is guarded anyway)

This removes any remaining chance of re-fetching on keystrokes.

### 4) Quick verification checklist (manual)
1. Log in as a restaurant user.
2. Go to `/dashboard/business/settings`.
3. Click inside “Business Name” and type: confirm the text stays (doesn’t revert).
4. Edit several fields (website, postal code, description).
5. Click “Update Profile”.
6. Refresh the page and confirm changes persisted.

## Out of scope (but noted)
- reCAPTCHA uses `import.meta.env.VITE_RECAPTCHA_SITE_KEY` in `src/components/auth/ReCaptcha.tsx`. If that key is not correctly provided at runtime, login/signup can be flaky. This is separate from the “can’t type in settings” bug, but if you still see “CAPTCHA error” toasts, we should address that next.

## Files to change
- `src/hooks/useBusinessProfileForm.ts`
- `src/pages/BusinessSettings.tsx`

## Expected result
- Users can type into settings fields normally (no snapping back).
- Settings page consistently loads the correct restaurant profile.
- Saving continues to work (and now the form is usable to make changes).
