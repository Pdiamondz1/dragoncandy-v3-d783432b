## What and why

<!-- One or two sentences. Link the Linear ticket. -->

Closes: DC-

## How to verify

<!-- Steps a reviewer can follow on the preview deploy. Name the role to log in as. -->

## Checklist

- [ ] `npm run build && npm run typecheck && npm run lint && npm run test` pass locally
- [ ] Checked on the preview deploy — **desktop and mobile**
- [ ] Correct for every affected role (business / creator / brand)
- [ ] Codex second review run and clean (`codex review --base main`)

### If this touches the backend

- [ ] Migration is additive and replayable (no dropped or renamed columns)
- [ ] Migration applied to **staging**, and the object confirmed to exist (not just recorded)
- [ ] RLS reviewed: which role can read/write these rows, and what stops cross-tenant access
- [ ] Service-role or `SECURITY DEFINER` code re-asserts the rules RLS would have applied
- [ ] Edge functions deployed to staging; production deploy planned for after merge

### After merge

- [ ] Migration and edge functions deployed to **production**
- [ ] Verified live on dragoncandy.com, both viewports, no new console errors
