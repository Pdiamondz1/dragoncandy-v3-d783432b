# Runbook — Google OAuth verification demo video

**Status (2026-08-23): recordable today, against production, with no new infrastructure.**
This runbook exists because the previous plan for this video was built on a requirement
Google does not have.

## The claim this corrects

`docs/PROJECT_CONTEXT.md` said the demo video "is awkward rather than tedious — Google
requires the unverified-app screen to appear in it and forbids recording against production
traffic, so with the app now *in production* it needs a separate test project or a hidden
staging route."

**Both halves are false.** Google's demo-video page
(<https://support.google.com/cloud/answer/13804565>) and its verification-requirements page
(<https://support.google.com/cloud/answer/13464321>) between them state four requirements,
and neither the unverified-app screen nor a non-production environment is among them. There
is no staging route to build, and there was never a blocker here beyond recording a screen
capture.

This is the fourth claim about Google's console corrected in a single day, and it has the
same shape as the other three: written from what the console *showed*, never checkable from
inside this repository, and convincing because it was specific. The durable rule generalises
the one already in `PROJECT_CONTEXT.md` §5 (*the consent screen is not the record of what was
granted*): **a claim about a third party's rules is worth exactly what the third party's own
page says, and that page is one fetch away.**

## What Google actually requires

| # | Requirement | Source |
|---|---|---|
| 1 | "The end-to-end flow of your app including the OAuth grant process. Be sure to show all points of integration with the Google API you are requesting." | 13804565 |
| 2 | The complete OAuth consent screen, showing "the same exact scopes you are requesting (or you have already been approved for)" | 13804565 |
| 3 | "The app functionalities that utilize the requested OAuth scopes" — each requested scope demonstrably used | 13804565 |
| 4 | The same application as submitted, "including app name, branding" | 13464321 |

**Not** required — checked explicitly, because we had assumed otherwise: the "Google hasn't
verified this app" interstitial; a test or staging environment; anything about the URL bar or
the client ID. That last one is asserted confidently by several third-party guides but appears
on neither Google page, so treat it as cheap insurance rather than a rule — keep the URL bar
in frame anyway, it costs nothing.

## No revoke, no disconnect — and why the first draft said otherwise

Requirement 2 is the consent screen, and Google's flow puts it on the **second** of two screens.
Screen 1 is identity (pick an account, Continue). Screen 2 itemises the scopes:

- "View your YouTube account"
- "View YouTube Analytics reports for your YouTube content"

**Screen 2 appears on every connect for this app**, including a reconnect by an account that
already holds both scopes. `buildAuthUrl` sends **`prompt=consent`** unconditionally
(`supabase/functions/_shared/youtube.ts`), and Google's OAuth documentation is explicit that
`consent` means *prompt the user for consent*, while *"if you don't specify this parameter, the
user will be prompted only the first time your project requests access."* We always specify it.

You also do not need to disconnect to reach the button: `YouTubeAnalyticsCard` renders it
whichever state the card is in, labelled **"Connect another channel"** once a channel is linked.

**The first draft of this runbook opened with a mandatory revoke**, on the strength of a claim in
`docs/wiki/concepts/youtube-analytics-connector.md` that screen 2 is "skipped when the account
already holds those scopes". That describes an app which *omits* `prompt` — not this one. The
Codex second review caught it against the code before this runbook was merged, which is worth
recording: the claim had already been through a same-day correction pass and read as settled, so
nothing internal was going to re-open it. **Do not revoke a working production grant to satisfy a
requirement that is already met.**

One cheap check while recording, since it costs nothing: if screen 2 does **not** appear in your
take, stop. That would mean `prompt=consent` is not reaching Google — a real defect, not a
recording problem.

## Recording

One take, roughly 60–90 seconds, no cuts. Cuts read as omissions.

1. **Start signed in, on `/settings`**, with the YouTube analytics card visible. This satisfies
   requirement 4 — app name and branding on screen — and establishes that the recording is our
   app. Starting from the connected state is fine. (If you want the button to read "Connect
   YouTube" rather than "Connect another channel", disconnect first — but that is a presentation
   choice that costs you the live grant, not a Google requirement.)
2. **Press the teal connect button.** The red button beside it is Outstand and it publishes;
   nothing on the buttons themselves says which is which.
3. **Screen 1** — account chooser. Pick `dame@dragoncandy.com`.
4. **Screen 2** — hold here for two or three seconds with both scope lines legible. This is
   the frame the reviewer is looking for. Then Allow.
5. **Land back in the app** (`/youtube/callback` → Settings) and let the analytics card finish
   loading.
6. **Show the data.** The card renders views, watch time, average view duration and "N days of
   data". That is requirement 3: `youtube.readonly` resolves the channel identity shown on the
   card, `yt-analytics.readonly` produces the figures. Say which is which out loud or caption
   it — do not make the reviewer infer the mapping.
7. **Optionally press Disconnect** at the end. Not required, but showing that the grant is
   releasable reads well against a read-only scope request.

Upload to YouTube as **unlisted**, paste the link into the Data Access page's demo-video
field, then **scroll to the bottom of that page and press the real Save**. The scope panel's
own "Update" button only stages the change; the justification was lost exactly this way on the
first attempt and was caught only by reloading rather than trusting the post-save render.

## Before you submit: the site gate will fail verification

Verification is not only about the video. The homepage must be "hosted on a verified domain
you own" and must "describe your app's functionality to its users", and the privacy policy
must be "hosted within the domain that hosts your homepage" (13464321). **Both must be
reachable by a reviewer who is signed in to nothing.**

**Half of this is now fixed, and half is not. Read both halves before sequencing anything.**

**FIXED (2026-08-26, #547) — the legal pages, BOTH of them.** The second option below shipped:
real static `public/privacy.html` **and `public/terms.html`**, generated from the app's own
legal sources and on the gate's allowlist. So **use `https://dragoncandy.com/privacy.html` and
`https://dragoncandy.com/terms.html`** wherever a console asks — they work gated *and* ungated,
which the pretty routes never will. (The shipped paths are `public/*.html`, not the
`public/legal/…` this section originally proposed.)

Privacy shipped first and terms followed at the Codex second review, which is worth recording:
every console asks for **both** URLs on the same form, so shipping only privacy left an
anonymously inaccessible legal URL in a live submission. That closes the legal-URL requirement
for Google, Meta, TikTok and X alike.

**STILL OPEN — the HOMEPAGE.** Google's verification requires the homepage to be "hosted on a
verified domain you own" and to "describe your app's functionality to its users", **also
reachable by a reviewer signed in to nothing**. `https://dragoncandy.com/` is the SPA and still
answers **401** under the gate. Nothing in #547 touched that, and it is easy to read the
privacy-policy fix as having closed the whole problem — it did not. This half is the one that
remains a sequencing decision:

- **Submit before the gate goes on** — but the review window is measured in weeks and will
  overlap whatever the gate was switched on for.
- **Serve a static homepage too**, the same shape as `privacy.html`. Nobody has built one, and
  it is a harder call than the policy was: a static marketing page has to *describe the app's
  functionality* convincingly, and it would have to be kept in step with a landing page that
  changes far more often than a privacy policy does.

The rule the fix had to obey, and which any future entry must too: the gate's own header records
that allowlisting a path with **no backing file** does not serve "nothing" — `vercel.json`
rewrites unmatched paths to `/index.html`, so it hands an anonymous browser the entire SPA, and
because the app talks straight to `supabase.co` that shell is a working product. `/privacy` is
an SPA route, so allowlisting it directly is the documented leak, not a fix. That rule is now
machine-checked in `gate/decide.test.ts` rather than merely written down.

Prod is **not** gated as of 2026-08-26 (the apex returns 200), so this remains a sequencing
constraint rather than a live defect. See `docs/wiki/concepts/site-access-lockdown.md`.

## After the video

Submitting for verification is a separate action in the Verification Center. It is what lifts
the **100-user lifetime cap** — publishing to production did not, and per Google's own console
text the cap "cannot be reset or changed". 1 of 100 is currently used.

## See also

- `docs/wiki/concepts/youtube-analytics-connector.md` — the connector, its scopes, and the
  two-screen consent finding
- `docs/runbooks/site-access-lockdown.md` — the gate this has to be sequenced against
