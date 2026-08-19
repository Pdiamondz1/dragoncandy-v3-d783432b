# Your first week

A day-by-day path to one merged pull request. If anything here does not work, that is a bug in
this document — say so, and fixing it is a legitimate first contribution.

**The goal of week one is not output.** It is that you can change this product safely on your own.

---

## Day 1 — Get it running, and see the product

**Morning: setup.**

```bash
nvm use                      # Node 24; 26 breaks 50 tests locally
npm ci
cp .env.example .env.local   # ask a maintainer for the staging anon key
npm run dev                  # http://127.0.0.1:8080
```

If it refuses to start, it caught you pointed at the production database. Fix `.env.local`.

Confirm the whole toolchain works:

```bash
npm run build && npm run typecheck && npm run lint && npm run test
```

All four should pass. You should see roughly 2,443 tests pass.

**Afternoon: use the product as all three people.** This matters more than reading code. Log into
the staging environment as each test account and actually do the thing:

| Account | Do this |
|---|---|
| `restaurant.staging@dragoncandy.test` | Create a campaign. Let Donny generate it. Publish it. Look at the dashboard. |
| `creator.staging@dragoncandy.test` | Find that campaign. Apply. Send a message. |
| `brand.staging@dragoncandy.test` | Browse creators. Look at what a brand sees and does not. |

Write down everything that confused you. **Do not throw that list away** — a fresh pair of eyes
lasts about a week, and it is genuinely valuable to us.

## Day 2 — Read

In this order:

1. `README.md` — what the product is
2. `docs/ARCHITECTURE.md` — how it fits together
3. `CONTRIBUTING.md` — the rules, especially the non-negotiables
4. `docs/DESIGN_SYSTEM.md` — if you touch UI at all
5. `docs/DATABASE_SCHEMA.md` — skim, then return to it as a reference

Then trace **one** feature end to end in the code. Campaign creation is a good one: start at the
route in `src/App.tsx`, follow it into the page, into its hooks, into the Supabase call, and into
the edge function Donny uses to generate it.

Do not try to read the whole codebase. It is 1,174 files. Nobody holds it all.

## Day 3 — Understand the two things that can hurt you

**Row Level Security.** Security lives in the database, not in the client. Pick any table in
`docs/DATABASE_SCHEMA.md` and answer: which of the three roles can read this row, which can write
it, and what stops one customer seeing another's? If you cannot answer that for the table you are
about to touch, ask before you touch it.

**Edge-function authorization.** Read two or three functions in `supabase/functions/`. Notice that
a valid login token is not authorization — the anon key is a valid JWT and ships in the browser.
Notice which functions use the service role, and that those bypass RLS entirely and must re-check
everything themselves.

Ask questions today. This is the part where guessing is expensive.

## Day 4 — Ship something small

Take one item from your Day 1 confusion list — a wrong label, a missing loading state, a broken
link. Small on purpose. The point is the pipeline, not the change.

```bash
git checkout -b fix/your-thing origin/main
# make the change
npm run build && npm run typecheck && npm run lint && npm run test
git push -u origin fix/your-thing
gh pr create --base main --fill
```

Then:

- `npm run preview:url` to get your preview deploy
- Check it **on desktop and mobile** — they are separate targets here
- `gh pr checks <n> --watch` until CI and the smoke suite are green
- Get a review, and let a human merge it
- Verify it live on dragoncandy.com afterwards, and check the browser console

## Day 5 — Close the loop, and tell us what is wrong

Write up what you learned and, more usefully, **what this documentation got wrong**. You are the
only person who will ever read it without already knowing the answers.

Then pick up a real ticket from the backlog in Linear.

---

## Working here

**Ask early.** Nobody minds the question. Guessing about RLS, payouts, or edge-function auth is
expensive; asking is free.

**Small changes.** One thing per pull request. This codebase has a history of bulk changes breaking
production.

**Both viewports, every time.** Desktop uses `lg:`/`xl:` classes, mobile uses base classes. Never
apply one to the other.

**Merged is not deployed.** Database migrations and edge functions deploy separately and by hand,
to each environment.

**When a document and the code disagree, the code is right.** Then fix the document — that is part
of the work, not a favour.

---

## If you are stuck

| Symptom | Likely cause |
|---|---|
| Dev server refuses to start | You are pointed at production. Fix `.env.local`. |
| 50 tests fail locally, CI is green | You are on Node 26. `nvm use`. |
| A query returns `[]` and you expected rows | RLS. You are the wrong role, or the policy excludes you. |
| A change works locally, not on the preview | You changed the database or an edge function and did not deploy it to staging. |
| Preview asks for a login you do not have | Use the staging test accounts, not your own. |
| Something worked yesterday and not today | Check whether a migration or function was deployed to one environment and not the other. |
