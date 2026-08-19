# Contributing to DragonCandy

This code runs a live product with real users and real money. Most rules below exist because
something went wrong once.

---

## 1. Setup

**Use Node 24.** Node 26 breaks 50 tests that pass in CI.

```bash
nvm use            # reads .nvmrc
npm ci             # not `npm install` — respects the lockfile
cp .env.example .env.local
```

Put the **test database** values in `.env.local`. That file is gitignored and overrides everything
else. Ask a maintainer for the key.

```bash
npm run dev        # http://127.0.0.1:8080
```

**If it refuses to start,** it caught you pointing at the real customer database. That's the guard
working. Fix `.env.local` — don't bypass it.

Need real data to reproduce a bug? Use a preview website instead. If you truly can't, opt in for one
session with `VITE_ALLOW_PROD_FROM_LOCAL=true npm run dev`, and know exactly what you're touching.

Check everything works:

```bash
npm run build && npm run typecheck && npm run lint && npm run test
```

---

## 2. Making a change

Start from a branch. You can't commit to `main` — it's blocked.

```bash
git fetch origin
git checkout -b your-feature origin/main
```

Build it. Before pushing, run exactly what CI runs:

```bash
npm run build && npm run typecheck && npm run lint && npm run test
```

Push and open a pull request:

```bash
git push -u origin your-feature
gh pr create --base main --fill
```

That automatically runs the checks, builds you a preview website on the test database, and runs
browser tests against it.

**Test your own change on that preview before asking anyone to look.**

```bash
npm run preview:url      # prints your branch's preview address
```

Log in with the test accounts (`restaurant.staging@`, `creator.staging@`, `brand.staging@` — all
`@dragoncandy.test`). Click through your change **on desktop and on a phone**.

Then wait for the checks (`gh pr checks <n> --watch`), get a review, and a person merges it.

After it's merged, check it live on dragoncandy.com — both screen sizes, and look at the browser
console for errors.

**Changed the database or a backend function?** Merging does *not* deploy those. You deploy them by
hand, twice: to the test environment before merging, and to production after. Details in
[`docs/runbooks/feature-change-workflow.md`](docs/runbooks/feature-change-workflow.md).

---

## 3. The rules you can't break

Breaking these can take the product down or expose customer data.

**Never point your laptop at the real database.** See above.

**Never delete or rename a database column or table.** Add new columns, and allow them to be empty.
Database changes only go forwards.

**Assume every table checks permissions.** Security lives in the database. Before trusting a query,
check the policy allows the user who will actually run it — not the one you assumed.

**Being logged in is not being allowed.** The public key is a valid login token and ships inside the
browser bundle. So "requires a token" only blocks requests with *no* token at all. Every backend
function must work out who is calling and what they may touch.

**Service-role code skips all permission checks.** If your code uses the service key, it has to
re-check everything itself.

**A `SECURITY DEFINER` database function skips the permission policy on the table it writes to.** If
you write one, re-check the same rule inside it.

**Don't touch login or session code without asking first.**

**Stripe stays in test mode.** Real keys need Dame's explicit approval.

**Desktop and phone are separate targets.** Desktop styles use `lg:`/`xl:` prefixes. Phone styles
use no prefix. Never apply one to the other. Test both.

**One change per pull request.** Bulk changes have broken production here before.

---

## 4. Code style

TypeScript strict mode. No `any` if a real type will do. Function components and hooks only.

React Query for every database read and write. Tailwind with the `dc-*` colour tokens — never a raw
hex code. `@/` means `src/`.

Always list the fields you want (`.select('id, name')`), never `select *`. Always handle the error
case. Always handle loading and error states in the UI.

Named exports for components. Default exports only for pages.

Hooks are named `use<Thing><Action>`. Query keys look like `['thing', id]`. Use
`enabled: !!something` for queries that depend on other data, and refresh related queries after a
change succeeds.

`console.log` is blocked by the linter. `console.error` and `console.warn` are fine.

**Before opening a pull request**, check your own work for: functions over 30 lines, logic repeated
more than twice, any use of `any`, components with more than three props, and missing error
handling.

---

## 5. Review

Every change gets **two AI reviews and a person**:

1. Your own AI review
2. Automated security review — required if you touched the backend, database permissions, or
   anything scoped to a customer
3. **A second review by a different AI model** (`codex review --base main`), re-run until clean
4. A person reviews and merges

This isn't ceremony. The second review keeps finding real bugs the first one missed.

---

## 6. "Done" means

- [ ] Merged
- [ ] Checked on desktop **and** phone
- [ ] Checked live in production, no new console errors
- [ ] Database changes applied to the test environment **and** production — and you confirmed the
      thing actually exists, not just that the migration was recorded
- [ ] Docs updated if behaviour, the database, or a workflow rule changed

That "confirmed it actually exists" line is deliberate. A migration marked as applied is not proof.
That has caught us out before.

---

## 7. Ask

Ask early rather than guessing. The three things that look simple and aren't: database permissions,
the payout code, and backend function permissions. Nobody will mind the question.
