# Workspace signature automation

Installs every DragonCandy employee's Gmail signature automatically, and keeps
them installed. A new hire is signed within 24 hours of appearing in the
directory, with no onboarding step.

## Why this exists at all

Google Workspace has **no built-in signature management**. There is no admin
setting that applies a signature to everyone. The Gmail API is the only
first-party mechanism, and it needs a service account to act on other people's
accounts.

(Admin -> Gmail -> Compliance -> *Append footer* is not this. It appends below
the entire quoted thread, so on any reply it lands detached at the bottom.)

## Security note — read before setting this up

The service account below can **change Gmail settings for every account in the
domain, indefinitely**. That is standard practice for this task and it is also
a real standing grant. Its private key lives in Apps Script *script properties*
and must never be committed to this repo.

**As of 2026-08-22 that grant is wider than the minimum.** DragonCandy's
delegation carries `gmail.settings.sharing` in addition to
`gmail.settings.basic`, which means the account can also set **who may send
mail as which address, for every user in the domain** — not merely rewrite
signature HTML. That was a deliberate founder decision taken to make
shared-mailbox signatures possible at all; it is reversible by removing the
scope (see the ordering rules below), and it is the honest answer to the
question in the next paragraph.

If a new engineer asks "what can that service account do?" — this paragraph is
the answer.

## Prerequisite — confirm the brand mark is actually being served

Every signature embeds `https://dragoncandy.com/brand/dc-mark-104.png`. That
URL only serves the real image once this branch is merged and Vercel has
deployed it. **Before this, `vercel.json`'s catch-all rewrite makes the same
URL return `200` with the SPA's `index.html`** — a broken image behind a
*success* status, which image proxies will happily cache. A plain `curl -sI`
is not enough; it will show `200` either way. Check the content type instead:

    curl -sI https://dragoncandy.com/brand/dc-mark-104.png | grep -i content-type
    # must print: content-type: image/png
    # a 200 alone proves nothing here -- the SPA catch-all also returns 200 text/html

Do not install a single signature until this prints `image/png`.

## One-time setup

1. **GCP project** — create one (or reuse the existing DragonCandy project).
   Enable the **Gmail API** and the **Admin SDK API**.
2. **Service account** — create one, no project roles needed. Create a JSON key
   and download it. Note the **client email** and the numeric **client ID**.
3. **Domain-wide delegation** — `admin.google.com` -> Security -> Access and
   data control -> API controls -> Domain-wide delegation -> Add new. Enter the
   numeric client ID and exactly this scope:

       https://www.googleapis.com/auth/gmail.settings.basic

   This is the only scope needed to sign **personal** mailboxes, which is what
   a fresh setup does. Signing **shared** addresses additionally needs
   `gmail.settings.sharing` — see "Shared identities" below, and add it only
   once you actually want that. **DragonCandy's live delegation carries both
   as of 2026-08-22**; this step describes the minimum, not our current state.

   The directory read
   (`AdminDirectory.Users.list` in step 4) does not go through this JWT at
   all — it uses the Admin SDK Directory advanced service under the Apps
   Script project owner's own authorization, a separate auth path that needs
   no domain-wide delegation. Don't grant
   `admin.directory.user.readonly` here; nothing in this code uses it via
   delegation, and a standing domain-wide grant to read every user record is
   not something to hand out on the strength of a doc that overstates what's
   needed.

4. **Apps Script project** — create one at script.google.com owned by an admin.
   Add the **Admin SDK Directory API** advanced service (identifier
   `AdminDirectory`). Then Project Settings -> Script Properties:

   | Property | Value |
   |---|---|
   | `SA_CLIENT_EMAIL` | the service account's client email |
   | `SA_PRIVATE_KEY` | `private_key` from the JSON key, newlines as `\n` |
   | `LOG_SHEET_ID` | id of the run-log Sheet in `06 · Brand` |
   | `SHARING_SCOPE_ENABLED` | **`true` since 2026-08-23.** Both steps below are done and shared-mailbox signatures install. Setting it `false` stops *future* shared writes — it does **not** remove signatures already installed; see "Turning it back off" |

5. **Build, then set up clasp, then push.**

       npm run build:workspace

   This generates `scripts/workspace/dist/` — `Code.gs`, `Signature.gs` and
   `appsscript.json`. `clasp push` uploads whatever `rootDir` points at, and
   the source files in this directory are ES modules (`signature.js` has
   `export`), plus a test file that imports vitest and this build script
   itself — every one a V8 syntax error that fails the whole Apps Script
   project at load, `dryRun()` included. So `clasp` must never see the source
   directory; it must see only `dist/`.

   Create `scripts/workspace/.clasp.json` (developer-local, not committed —
   it holds the Apps Script project's script ID, not a secret, but it's
   machine-specific so it stays out of the repo):

       {
         "scriptId": "<the Apps Script project's script ID, from its Project Settings page>",
         "rootDir": "dist"
       }

   Then:

       cd scripts/workspace && clasp push

6. **Dry run before anything is written.** Run `dryRun()` in the Apps Script
   editor and read the log. Every user must show a title. A user with no title
   is refused rather than given a signature with a blank line -- set their title
   in the admin console first. **This only checks the directory read** — it
   never mints an impersonation token, so it will pass cleanly even with a
   missing, malformed or revoked service-account key. It does not substitute
   for step 7.

7. **Run `installAllSignatures()` once by hand.** Check the log Sheet, then
   check a real inbox.

8. **Add the trigger** — Triggers -> Add trigger -> `installAllSignatures`,
   time-driven, day timer, 2am-3am.

## Shared identities: what installs, and what it took to get there

**An alias is not a send-as identity.** This is the single most important thing
to know about the shared-identity branch, and an earlier revision of this file
said the opposite.

`support@`, `sales@`, `info@`, `admin@`, `privacy@`, `appstore@` and
`founders@` are **aliases on `dame@dragoncandy.com`** — verified in the admin
console 2026-08-21. Being an alias means mail addressed to them *arrives* in
`dame@`'s inbox. It does **not** put them in `dame@`'s `settings/sendAs` list,
and `sendAs` is exactly where `installForUser_`'s shared-identity branch looks.

(`SHARED_IDENTITIES` also lists `legal@`, which does not exist yet. That is
deliberate — the list classifies company-versus-personal addresses rather than
recording which ones exist, and an address missing from it is signed as
*personal*. Listing one early is inert; listing one too few is a wrong
signature on the day it is created.)

On the first real run (2026-08-21) `installAllSignatures()` reported **0 shared
signatures installed**, and at that moment it was not a bug and not a
permissions problem — there was simply nothing to match.

**That is no longer the state, so do not diagnose from it.** Three of those
addresses — `info@`, `support@`, `appstore@` — were added as real send-as
identities on `dame@` on 2026-08-21, so they now *do* appear in his `sendAs`
list and the shared branch *does* match them. What happens next depends
entirely on which code is deployed:

| Deployed code | `SHARING_SCOPE_ENABLED` | What `dame@` reports |
|---|---|---|
| pre-#456 | n/a (not read) | `ERROR` — one 403 aborts the whole user, so even his personal signature stops refreshing. Observed 8/21 and 8/22. |
| #456+ | unset / `false` | `PARTIAL`, 3 denied — personal signatures written, shared ones refused cleanly. Observed 8/23. |
| #456+ | `true` | `ok`, shared signatures installed. **This is the live state as of 2026-08-23** — `ok / 4 identities / 3 shared`. |

All three rows were observed in that order, and they are in the log Sheet.

So `0 shared` is only the expected answer for a user with **no** shared
identities — which is everyone except `dame@`. For him the expected answer is
now **`4 identities / 3 shared`**, and anything less means something regressed.

**To make shared signatures install** for anyone else, the address has to
become a send-as identity on their account too. There are two routes.

**Both routes need the `gmail.settings.sharing` scope. Read this before
planning around either one.** An earlier version of this file said Route A was
"manual, but permission-free". **It is not, and running it is what proved
that:**

```
403 PERMISSION_DENIED
Missing required scope "https://www.googleapis.com/auth/gmail.settings.sharing"
for modifying non-primary SendAs
```

Google's reference lists `settings.sendAs.update` as accepting
`gmail.settings.basic` **or** `gmail.settings.sharing`. That is true of the
**primary** identity. Modifying any **non-primary** sendAs — which every shared
address is — requires `sharing`, and no page says so. So adding the identity by
hand gets you an identity this script still cannot write a signature to.

**Route A — the person adds the identity.** Gmail -> Settings -> Accounts and
Import -> "Send mail as" -> Add another email address. For a same-domain
address this completes with no verification email. Fine as far as it goes, but
the signature will not install until the scope is added.

**Route B — this script does it.** `POST settings/sendAs` (Gmail API
`users.settings.sendAs.create`) can create the identity under the service
account's existing domain-wide delegation. Two things to know before reaching
for it:

- **It needs the same scope Route A needs**, so it is not a bigger ask —
  `sendAs.create` and non-primary `sendAs.update` both require
  `gmail.settings.sharing`. Once the scope is there, this route also covers
  Joe, Juwan and Adrian without asking each of them to do anything.
- **Same-domain addresses do not need email verification.** Confirmed by hand
  on 2026-08-21: three addresses added to `dame@`, all accepted immediately,
  no confirmation email.

**What the scope actually costs, stated plainly:** it lets this service account
set **who may send mail as what, for every user in the domain** — not just
rewrite signature HTML. The key lives in a script property. That is the whole
decision, and it is the founder's.

### Turning the scope on — two steps, and the order is not optional

Granting the scope in the admin console does **nothing on its own**. The
impersonation JWT has to request it too, and this script deliberately does not
by default. (Codex caught that; without it an admin would grant the scope,
re-run, get the identical 403, and have no idea why.)

1. **Admin console first.** Security → Access and data control → API controls →
   Domain-wide delegation → edit the existing client → add
   `https://www.googleapis.com/auth/gmail.settings.sharing` alongside
   `gmail.settings.basic`. **DONE 2026-08-22** — client
   `117869070719843760682` now shows both scopes, verified on the list page.
   (The edit dialog appends a row rather than replacing; check `basic` is
   still present before authorizing, because losing it breaks everything.)
2. **Then the script property.** Set `SHARING_SCOPE_ENABLED` to `true`.
   **DONE 2026-08-23.**

**Do not reverse these.** Asking for a scope the delegation does not carry
fails the *entire* token exchange with `unauthorized_client` — not just the
shared identities, but every signature for every user. If that happens, set
`SHARING_SCOPE_ENABLED` back to `false` and everything returns to working
immediately; the error message says so too.

**A granted scope may not be an immediately usable one.** Google's domain-wide
delegation changes propagate on their own schedule, so treat "granted in the
console" as the start of a window rather than a green light. The safe sequence
is: push the code, run `installAllSignatures()` and confirm it reports
`PARTIAL` with a non-zero denied count (which proves the `basic` path still
works), *then* set the property, *then* run again. If that second run throws
`unauthorized_client`, propagation has not finished — set the property back to
`false`, wait, retry.

**That sequence was followed on 2026-08-23 and both runs are in the log Sheet**,
which is why it is written down: `PARTIAL / 1 identity, 3 denied / 0 shared`,
then `ok / 4 identities / 3 shared`. About **seven hours** elapsed between the
console grant (2026-08-22 19:36 ET) and the enabling run (2026-08-23 02:39 ET),
with no `unauthorized_client`. That gap is long enough that it says **nothing**
about how quickly propagation completes — do not read it as "40 minutes is
enough" or any other short interval. If you need to move faster, the `PARTIAL`
run is your instrument: it tells you the narrow path works, and a failed
enabling run after it is diagnosable as propagation rather than breakage.

**Keep the two-run shape if you ever redo this.** The `PARTIAL` run is not a
formality: it is the only observation that separates "the scope fixed it" from
"the scope hid a still-broken loop". Skip it and a success at the end proves
strictly less.

### Turning it back off — and what that does not do

To undo: set `SHARING_SCOPE_ENABLED` to `false` first, *then* remove the scope
from the delegation. Same ordering rule, reversed.

**That stops future shared-identity writes. It does not remove the signatures
already installed.** They live on the sendAs records in Gmail, not in this
script, so after disabling the flag `info@`, `support@` and `appstore@` keep
sending the signature they last received, indefinitely, while every subsequent
run reports `PARTIAL` with a denied count. An operator who reads "disabled" as
"removed" will be wrong about what is going out.

To actually remove them, do one of these while the scope is still granted and
the flag still `true`:

- **Per identity, by hand** — Gmail → Settings → Accounts and Import → "Send
  mail as" → *edit info* on the address → clear the signature. Or delete the
  send-as identity outright, which also stops it matching.
- **In bulk** — patch each identity's signature to an empty string via the same
  `settings/sendAs/{email}` call the installer uses. There is no helper for this
  in `Code.gs`; it would need writing.

Order matters here too: revoke the scope first and you lose the ability to
clear them, leaving stale signatures you cannot reach through this tooling.

An earlier version of this file said no API could create a send-as identity.
That was wrong, and Codex caught it. Then it said the manual route was
permission-free. That was also wrong, and only running it caught that one.

The same constraint applies, for the same reason, if these addresses are ever
converted to real Google Groups (corporate-setup spec, decision 9). A Group is
not a send-as identity either. The conversion would therefore change nothing
about this branch's behaviour, because it is already installing nothing —
but it would remove the aliases, so anyone who *had* completed the manual
send-as step would lose it.

The installer warns when it installs zero shared signatures, so this stays
visible rather than silent.

## Editing a signature

Edit `signature.js`, run its tests, `npm run build:workspace`, `clasp push`.
Never edit the `.gs` files in `dist/` -- they are generated and will be
overwritten.

## Changing someone's title

Change it in the Google admin console. The script reads titles from the
directory, so the signature follows within 24 hours. Do not hardcode titles
here.
