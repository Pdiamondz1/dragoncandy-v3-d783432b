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

   This is the **only** scope the delegation grant needs. The directory read
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

## Shared identities depend on how support@/sales@/etc. are provisioned

Right now `support@`, `sales@`, `info@`, `admin@`, `privacy@`, `legal@` and
`appstore@` are all **aliases on `dame@dragoncandy.com`**, which is why they
show up in `dame@`'s `settings/sendAs` list and get a signature installed by
`installForUser_`'s shared-identity branch.

If these are ever converted to real Google Groups (see the corporate-setup
spec's decision 9), **they will vanish from every user's sendAs list** — a
Group is not a send-as identity. The shared-identity branch will quietly stop
matching anything and those signatures will stop being installed, with no
error anywhere.

If that conversion happens: each person who should be able to send as a
shared address needs to add and verify it themselves in Gmail (Settings ->
Accounts and Import -> Send mail as). Only after that will the script find
the identity in their `sendAs` list and install the shared signature for it.
This is a manual step per person per address; nothing in this script can do
it for them.

## Editing a signature

Edit `signature.js`, run its tests, `npm run build:workspace`, `clasp push`.
Never edit the `.gs` files in `dist/` -- they are generated and will be
overwritten.

## Changing someone's title

Change it in the Google admin console. The script reads titles from the
directory, so the signature follows within 24 hours. Do not hardcode titles
here.
