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

## One-time setup

1. **GCP project** — create one (or reuse the existing DragonCandy project).
   Enable the **Gmail API** and the **Admin SDK API**.
2. **Service account** — create one, no project roles needed. Create a JSON key
   and download it. Note the **client email** and the numeric **client ID**.
3. **Domain-wide delegation** — `admin.google.com` -> Security -> Access and
   data control -> API controls -> Domain-wide delegation -> Add new. Enter the
   numeric client ID and exactly these two scopes:

       https://www.googleapis.com/auth/gmail.settings.basic
       https://www.googleapis.com/auth/admin.directory.user.readonly

4. **Apps Script project** — create one at script.google.com owned by an admin.
   Add the **Admin SDK Directory API** advanced service (identifier
   `AdminDirectory`). Then Project Settings -> Script Properties:

   | Property | Value |
   |---|---|
   | `SA_CLIENT_EMAIL` | the service account's client email |
   | `SA_PRIVATE_KEY` | `private_key` from the JSON key, newlines as `\n` |
   | `LOG_SHEET_ID` | id of the run-log Sheet in `06 · Brand` |

5. **Push the code**

       npm run build:workspace
       cd scripts/workspace && clasp push

6. **Dry run before anything is written.** Run `dryRun()` in the Apps Script
   editor and read the log. Every user must show a title. A user with no title
   is refused rather than given a signature with a blank line -- set their title
   in the admin console first.

7. **Run `installAllSignatures()` once by hand.** Check the log Sheet, then
   check a real inbox.

8. **Add the trigger** — Triggers -> Add trigger -> `installAllSignatures`,
   time-driven, day timer, 2am-3am.

## Editing a signature

Edit `signature.js`, run its tests, `npm run build:workspace`, `clasp push`.
Never edit the `.gs` files in `dist/` -- they are generated and will be
overwritten.

## Changing someone's title

Change it in the Google admin console. The script reads titles from the
directory, so the signature follows within 24 hours. Do not hardcode titles
here.
