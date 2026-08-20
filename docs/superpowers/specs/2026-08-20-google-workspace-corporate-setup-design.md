# DragonCandy Google Workspace — Corporate Setup

> Status: spec. Written 2026-08-20 from a founder interview in the same session.
> Scope: the company's Google Workspace — Drive structure, document set, brand
> application, email signatures, and the admin configuration underneath them.
> Related: `2026-06-11-google-workspace-connections-design.md` (the *product's*
> Google integration — a different thing; see §11).

## 1. Why

DragonCandy has a Workspace with three people in it and no structure. Documents
live in the repo, in the founders' heads, and in `dwilliams@harbormill.net`'s
personal Drive. Four hires are being sourced. Joe is talking to investors and
partners with a pitch deck that exists only as a React component. Nothing that
leaves the company — email, document, deck — looks like it came from the same
organisation, because there is no organisation-level system for it to come from.

This spec builds one: a shared-drive structure the company owns, a document set
written for people who will never open GitHub, and a signature and template
system that makes DragonCandy's outbound surface consistent.

**The forcing function is hiring.** A new PM, designer and two developers arrive
into whatever exists on their first day. Everything here is ordered against that.

## 2. Decisions (founder interview, 2026-08-20)

| # | Decision |
|---|---|
| 1 | **Drive access via `dame@dragoncandy.com`.** The Claude connector is reconnected to the DragonCandy account before anything is created. Files are created natively in Workspace, not imported. |
| 2 | **Two shared drives**, not one — see §4.1 for the permission constraint that forces this. Files owned by the organisation, access granted by Google Group. |
| 3 | **Drive is for humans; the repo stays canonical.** Where a fact lives in the repo, the Drive document links to it rather than restating it. No mirroring, no sync job. |
| 4 | **All four priority jobs in scope**, staged into three waves (§9): onboarding the hires, looking credible to outsiders, Joe's sales collateral, and general organisation. |
| 5 | **The marketing identity is the company identity.** The `landing-*` palette with Bricolage Grotesque / Instrument Sans / Silkscreen — not the `dc-*` app system. |
| 6 | **Signature: Option B — Badge.** Logo mark, hairline, text block. The image is never load-bearing. |
| 7 | **Registered address on shared mailboxes only**, not personal signatures. **No phone number anywhere**, matching the deliberate choice already made for the public website. |
| 8 | **Signatures installed automatically** by an Apps Script + service account with domain-wide delegation, on a daily trigger. New hires are signed within 24 hours with no action. |
| 9 | **The nine shared addresses convert from aliases to real Google Groups.** |
| 10 | **`legal@dragoncandy.com` is created**, bringing the shared set to nine. |

### 2.1 Roster

| Name | Address | Title | Status |
|---|---|---|---|
| Damon Williams | `dame@dragoncandy.com` | CTO | active |
| Joe Castelo | `joe@dragoncandy.com` | CEO | active |
| Juwan Robinson | `jay@dragoncandy.com` | Co-founder | active |
| Adrian Vella | `adrian@dragoncandy.com` | Board Member | **not yet created** |

"Juwan Robinson" is the public-facing form, confirmed in the interview — the
mailbox local-part is `jay`, which is not a name and is not used in signatures
or documents.

## 3. Hard realities the design is built around

These are constraints, not preferences. Each one changed a decision.

1. **Google Workspace has no built-in signature management.** There is no admin
   setting that applies a signature to everyone. The Gmail API is the only
   first-party mechanism; a paid third-party tool is the only alternative.
   (Admin → Gmail → Compliance → *Append footer* exists, but appends **below the
   entire quoted thread**, so on any reply it lands detached at the bottom. It is
   not a signature and is not used here.)

2. **Webfonts do not render in email.** Gmail, Outlook and Apple Mail strip
   `@font-face`. Bricolage Grotesque, Instrument Sans and Silkscreen cannot
   appear as *text* in a signature under any circumstances — only inside an
   image. Signature text is set in `Arial, Helvetica, sans-serif`.

3. **Outlook for Windows renders mail with the Word engine and cannot display
   WebP.** `public/logo.webp` is unusable in a signature. A PNG export is
   required (§7.2). Outlook also needs explicit `width`/`height` attributes on
   `<img>` and layout by `<table>`, not CSS.

4. **In a shared drive, folder permissions can only ADD access, never remove
   it.** A drive member sees every folder in that drive. This is the single
   constraint that forces two drives instead of one (§4.1).

5. **Images are blocked by default in many corporate inboxes**, and dark mode
   auto-inverts light signatures. Both are handled by the same rule: nothing
   load-bearing inside an image, and the mark must carry a transparent
   background. `public/logo.webp` is 280×326 **with an alpha channel**, verified
   — transparency survives the PNG conversion.

## 4. Architecture — Drive

### 4.1 Two shared drives

A single drive cannot express "the developers may read the roadmap but not the
cap table," because folder permissions inside a shared drive are additive only.
Splitting by confidentiality is the only structure that enforces it.

```
Shared drive: DragonCandy                    members: staff@dragoncandy.com
├─ 00 · Company           mission, org chart, how we work, all-hands
├─ 01 · Product           roadmap, specs, release notes, user feedback
├─ 02 · Engineering       pointers to the repo + non-code vendor material
├─ 03 · Strategy & GTM    pitch deck, pricing, market, partnerships
├─ 04 · Sales             one-pagers, outreach templates, pipeline
├─ 05 · People            handbook, onboarding, expectations, IT setup
└─ 06 · Brand             logos, palette, type, templates, signatures

Shared drive: DragonCandy — Confidential     members: founders@dragoncandy.com
├─ 10 · Legal             formation, EIN, D-U-N-S, contracts, IP, trademarks
├─ 11 · Finance           burn, cap table, banking, invoices, tax
├─ 12 · People (private)  offer letters, comp bands, employee files
└─ 13 · Board             ← Adrian Vella shared into this folder only
```

**Numbering is functional, not decorative.** Google sorts folders
alphabetically; the numeric prefix is the only way to control order. The `00–06`
/ `10–13` split also makes the two drives distinguishable at a glance in a
sidebar.

**Adrian's access** works because the additive rule cuts the other way: a folder
inside a shared drive *can* be shared with someone who is not a drive member,
granting access to that subtree only. He is a Content manager on `13 · Board`
and not a member of either drive.

### 4.2 Roles

| Principal | DragonCandy | Confidential |
|---|---|---|
| `founders@` (dame, joe, jay) | Manager | Manager |
| `staff@` (all employees) | Contributor | — |
| Adrian Vella | — | `13 · Board` only, Content manager |

**Contributor, not Content manager, for `staff@`** — contributors can create and
edit but cannot permanently delete or move things out of the drive. At four new
hires arriving into an unfamiliar structure, that is the right default.

### 4.3 `02 · Engineering` is deliberately thin

Decision 3 means engineering documentation is *not* copied here. This folder
holds exactly one document — "Where engineering documentation lives" — pointing
at `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/onboarding/first-week.md`
and the wiki in GitHub, plus the material that genuinely is not code: the
infrastructure capacity report, the cloud platform decision, and a vendor and
account inventory.

## 5. The document set

Twenty items, split three ways by how finished they can honestly be.

### 5.1 Written properly (12)

Each is authored from repo sources and ships as a complete document.

| Folder | Document | Source material |
|---|---|---|
| 00 · Company | What DragonCandy Is | `PROJECT_CONTEXT.md` §1, `dragoncandy-origin-story.md` |
| 00 · Company | How We Work | `CLAUDE.md`, `CONTRIBUTING.md`, Tech Dept Scope |
| 00 · Company | Who Owns What | roster §2.1 + Tech Dept Scope |
| 03 · Strategy | Strategy on a Page | `DragonCandy_Strategy_Briefing.md`, `Moat_Playbook.md` |
| 03 · Strategy | Pricing & Revenue Model | `Pricing_Profitability_Briefing_v2.md`, `STRIPE_PRICES.md` |
| 04 · Sales | DragonCandy for Restaurants | `gtm.md`, `dragoncandy-launch-partner-brief.md` |
| 04 · Sales | Outreach templates | new, from GTM positioning |
| 05 · People | Your First Week | `docs/onboarding/first-week.md`, generalised beyond engineering |
| 05 · People | IT & Account Setup | new — accounts, access, tools, security basics |
| 05 · People | Role Expectations | `docs/hiring/*.md` (4 JDs + requirements brief) |
| 05 · People | 30/60/90 template | Tech Dept Scope's audit-led first 90 days |
| 06 · Brand | Brand Basics | `DESIGN_SYSTEM.md`, `tailwind.config.ts`, this spec §7 |

### 5.2 Structured but deliberately empty (6)

Real headings, correct branding, and honestly blank: board deck template,
all-hands notes template, decision log, meeting notes template, the `10 · Legal`
index-and-checklist (what belongs here, not fabricated contracts), and a burn
tracker Sheet with the right columns and no invented numbers.

**Rationale:** a template that says "nothing here yet" is useful. A document
that *reads* finished but is filler is a trap — particularly for a new hire, who
cannot tell the difference.

### 5.3 Linked, never copied

The engineering set (§4.3), the wiki, and the existing repo documents. One
pointer page each.

### 5.4 Explicitly not written: the employee handbook body

The handbook ships as a **skeleton with a visible "not reviewed by counsel"
banner**. Sections that are genuinely DragonCandy's — how we work, tools,
communication norms, expectations — are written. PTO policy, at-will employment
language, anti-harassment policy, and anything else touching New Jersey
employment law are left as marked gaps.

This is a deliberate refusal, not an oversight. Four employees are about to be
hired; a handbook that reads authoritative and is not legally reviewed is worse
than an obviously incomplete one.

### 5.5 Known gap: Joe has no sendable deck

`src/pitch/slides/slides.tsx` is a React component. It presents live and cannot
be emailed. Wave 3 builds a Google Slides deck in `03 · Strategy` from the same
content, on the template system in §7.4. This also resolves the stale titles
baked into that file (§8).

## 6. Admin configuration

### 6.1 Groups replace aliases

As of 2026-08-10 the shared addresses were **aliases on `dame@`, with zero
groups in the org** — recorded in `src/lib/contactAddresses.ts`, which also
flags the consequence: *"All five deliver to ONE person's inbox today. That is
fine at three employees and will not stay fine."* Confirmed still true in the
2026-08-20 interview.

Nine Google Groups, replacing the eight existing aliases:

| Group | Members | Purpose |
|---|---|---|
| `founders@` | dame, joe, jay | Confidential drive access; internal |
| `staff@` | all employees | DragonCandy drive access; all-hands |
| `support@` | dame, + first hire who can cover | user support |
| `sales@` | joe | inbound sales |
| `info@` | joe, dame | general inbound |
| `admin@` | dame | vendor, billing, Stripe disputes |
| `privacy@` | dame, joe | GDPR / data-rights requests |
| `legal@` | dame, joe | **new** — counsel, contracts, Apple |
| `appstore@` | dame | Apple correspondence |

`staff@` serves double duty as the all-hands list and as the shared-drive access
group. That is deliberate — one list to maintain, and membership of the company
and access to the company's documents are the same fact.

**Migration rule:** create each group, add members, verify delivery with a test
send, and only then remove the corresponding alias from `dame@`. Removing the
alias first drops mail on the floor — and `privacy@` and `legal@` are addresses
with legal response obligations attached.

**`admin@` has a live dependency.** `supabase/functions/stripe-webhook`
sends dispute alerts to it. That address must keep receiving throughout the
migration; it is verified explicitly rather than assumed.

### 6.2 Adrian Vella's account

Created as `adrian@dragoncandy.com`, title Board Member. Not a member of either
shared drive; granted Content manager on `13 · Board` only. Included in the
signature automation like everyone else.

## 7. Brand system

### 7.1 Tokens

Taken verbatim from `tailwind.config.ts` — this spec introduces no new colours.

| Token | Hex | Role |
|---|---|---|
| `landing.grape` / `ink` | `#241332` | primary text, deep ground |
| `landing.pink` | `#F43F7F` | primary accent |
| `landing.pink-ink` | `#C22760` | links, accent text on light |
| `landing.mint` | `#2FC796` | secondary accent |
| `landing.mint-ink` | `#1E9C73` | secondary accent text |
| `landing.yellow` | `#FFC93C` | highlight, sparingly |
| `landing.ink-soft` | `#6B5A7E` | secondary text |
| `landing.line` | `#EFE8F5` | hairlines |
| `landing.lilac` | `#F4EDFA` | tinted panels |
| `landing.paper` | `#FFFFFF` | ground |

**Type:** Bricolage Grotesque (display), Instrument Sans (body), Silkscreen
(pixel utility labels). Self-hosted in `public/fonts/`; all three are available
as Google Fonts, which is what makes them usable in Google Docs and Slides.

**The two-tone rule** — a 3–4px bar, 62% `#F43F7F` then 38% `#2FC796` — is the
recurring device tying signatures and templates together. In email it is built
from two table cells with background colours, which every mail client renders
correctly; this is why it can carry brand where a logo cannot.

### 7.2 Logo assets to produce

`public/logo.webp` is 280×326 with an alpha channel. Exports needed, committed
to `public/brand/` and therefore served from `https://dragoncandy.com/brand/…`:

| File | Size | Use |
|---|---|---|
| `dc-mark-104.png` | 104×122 | signature image (displayed at 52×61 — exactly 2× for retina) |
| `dc-mark-512.png` | 440×512 | documents, decks, general |
| `dc-mark.svg` | vector | print, large format — **only if a vector source exists** |

Transparency must be preserved on every export; it is what keeps the mark from
becoming a white slab in a dark-mode inbox.

**If no vector source exists, that is a real gap** — the logo cannot be scaled
for print or embroidery. Flagged, not solved here.

### 7.3 Signature specification — Option B

**Structure:** mark (52×61) · 1px hairline · text block.

```
[MARK]  │  Damon Williams
        │  CTO · DragonCandy
        │  dame@dragoncandy.com · dragoncandy.com
```

**Rules, in priority order:**

1. **The image is never load-bearing.** No name, title, address or contact
   detail lives inside a picture. Strip every image and the signature is still
   complete and legible.
2. Layout by `<table>`, all CSS inline. No `<div>` layout, no stylesheet, no
   `@font-face`, no web fonts.
3. `<img>` carries explicit `width="52" height="61"`, an `alt` of
   `DragonCandy`, and `border="0"`.
4. Font stack is `Arial, Helvetica, sans-serif` throughout.
5. Colours: name `#241332`, title and separators `#6B5A7E`, links `#C22760`.
6. Total size under 10 KB. Gmail's signature field caps at roughly 10,000
   characters; the hosted image does not count against it.
7. **Personal signatures carry no postal address and no phone** (decision 7).
   Shared-mailbox signatures carry the registered address:
   `33-41 Newark St., 5th Floor, Hoboken, NJ 07030` — the D&B form, per the
   reasoning already recorded in `src/lib/legalEntity.ts`.

**Per-person data** is exactly three fields: display name, title, email address.
Everything else is constant. This is what makes §7.5 a template render rather
than four hand-built files.

**Optional second signature.** Gmail supports multiple signatures. Option C —
the full lockup with the positioning line — is installed as a secondary
signature for cold first contact, primarily for Joe. The badge remains the
default for all replies.

### 7.4 Document and deck templates

Both built on the same two-tone rule and type pairing:

- **Google Docs template** — Bricolage Grotesque headings, Instrument Sans body,
  the two-tone rule under the title, mark in the header, page numbers and
  document owner in the footer.
- **Google Slides template** — title slide, section divider, content, data, and
  closing layouts. This is what the pitch deck (§5.5) is built on.

Both live in `06 · Brand` and are set as the shared drive's default templates.

### 7.5 Signature installation

**Mechanism.** A Google Apps Script bound to the Workspace, running on a daily
time-driven trigger:

```
Daily trigger
  ↓
Admin SDK Directory API → list active users in dragoncandy.com
  ↓
for each user:
    render signature template(displayName, title, primaryEmail)
    Gmail API settings.sendAs.update  (scope: gmail.settings.basic)
  ↓
append run result to a log Sheet in 06 · Brand
```

**Authorisation.** Apps Script's own credentials are per-user and cannot write
another user's Gmail settings. This requires a **service account with
domain-wide delegation**, authorised in Admin console → Security → API controls
→ Domain-wide delegation, with the scopes
`https://www.googleapis.com/auth/gmail.settings.basic` and
`https://www.googleapis.com/auth/admin.directory.user.readonly`. The script
impersonates each user in turn.

**Security note, stated plainly:** that service account can modify Gmail
settings for every account in the domain, indefinitely. This is standard
practice and it is also a genuine key to hold carefully. Its key material lives
in Apps Script's script properties, never in this repo. A new engineer will ask
about it; the answer should be written down in `02 · Engineering`.

**Title is read from the Workspace directory**, not hardcoded in the script.
Changing someone's title in the admin console updates their signature within 24
hours. This is deliberate: it gives the directory a single source of truth and
removes the failure mode this project keeps hitting, where the same fact is
written down in two places and one goes stale.

**Self-healing.** Because the script runs daily and overwrites, a signature
someone edits by hand reverts. New hires are signed within 24 hours of appearing
in the directory with no onboarding step.

**"Signature installed and verified" still goes on the new-hire checklist.**
Automation that fails silently is worse than a manual step someone ticks.

## 8. Repo changes

Small, and all of them corrections rather than additions.

1. **Titles are wrong in three places.** Dame is recorded as "Co-founder & CPO"
   and is now **CTO**; Juwan is recorded as "Shareholder & Advisor" and is now
   **Co-founder**:
   - `docs/PROJECT_CONTEXT.md:36-38`
   - `docs/dragoncandy-origin-story.md:19-23`
   - `src/pitch/slides/slides.tsx:485-496` — **the live investor deck**

   The deck is the urgent one: it is what Joe shows investors, and a signature
   block that disagrees with it is exactly what a diligence reader notices.

2. **`public/brand/` added** with the PNG exports from §7.2, so signatures have
   a stable public URL that is not a Google-hosted image.

3. **`src/lib/contactAddresses.ts` comment updated** once the aliases become
   groups — the file currently documents the alias arrangement as fact, and that
   is about to stop being true. Its "will not stay fine" note is resolved rather
   than deleted.

4. **This spec, plus a wiki page** via `knowledge-sync` on branch finish.

No application code changes. No migrations. No edge function changes.

## 9. Build order

**One wave, one implementation plan.** Wave 1 is infrastructure and is planned
and executed as a unit. Waves 2 and 3 are document production against a
structure that already exists; each gets its own plan when its wave starts.
Trying to plan all three at once would produce a plan whose later half is
guesswork about documents nobody has drafted yet.

### Wave 1 — the workspace becomes real

- Reconnect the Drive connector to `dame@dragoncandy.com`
- Create both shared drives and all eleven folders
- Create the nine Google Groups; verify delivery; then retire the aliases
- Create `adrian@dragoncandy.com`; grant `13 · Board`
- Produce and commit `public/brand/` PNG exports
- Build the four signatures; install manually to prove the HTML renders
- Build the Apps Script + domain-wide delegation; verify it reproduces the
  manual install exactly, then enable the daily trigger
- Fix the three title errors (§8.1)

**Acceptance:** a test email from each of the four accounts renders correctly in
Gmail web, Gmail iOS, and Outlook for Windows, in both light and dark mode, with
images blocked and unblocked. A mail sent to each of the nine group addresses
arrives for every member.

### Wave 2 — the People set (deadline: first hire's start date)

- `05 · People` in full: Your First Week, IT & Account Setup, Role Expectations,
  30/60/90, handbook skeleton
- `00 · Company` in full: What DragonCandy Is, How We Work, Who Owns What
- `02 · Engineering` pointer page
- Docs template applied throughout

**Acceptance:** a person with no context can go from signed offer to first
merged pull request using only `05 · People` and the links it contains.

### Wave 3 — outward-facing

- `03 · Strategy`: Strategy on a Page, Pricing & Revenue Model
- `04 · Sales`: restaurant one-pager, outreach templates
- The Slides template, and the pitch deck built on it (§5.5)
- `06 · Brand`: Brand Basics
- The six empty-but-structured templates (§5.2)

**Acceptance:** Joe can email an investor a deck and a one-pager without asking
anyone for a file.

## 10. Risks and open items

| # | Item | Handling |
|---|---|---|
| 1 | Alias→group migration can drop mail | Create, verify by test send, retire alias last. Never reorder. |
| 2 | `admin@` feeds live Stripe dispute alerts | Verified explicitly during migration, not assumed. |
| 3 | Domain-wide delegation is a powerful standing grant | Documented in `02 · Engineering`; key in script properties only. |
| 4 | No vector logo source may exist | Flagged in §7.2. Blocks print/large-format, not this build. |
| 5 | Handbook is legally incomplete | Shipped as a marked skeleton (§5.4). Needs counsel before the first hire signs. |
| 6 | Shared drives require Business Standard or above | **Verify the plan in the admin console before Wave 1.** If the org is on Business Starter, shared drives do not exist and §4 must fall back to a folder in `dame@`'s My Drive — a materially worse outcome, and worth an upgrade. |
| 7 | Apps Script quotas | Trivial at 4–8 users; not a constraint until the hundreds. |

## 11. Out of scope

- **The AIOS Google Workspace product integration.** `google-chat-donny`,
  `GOOGLE_CHAT_PROJECT_NUMBER`, `GOOGLE_ALLOWED_DOMAIN` and `/internal/workspace`
  belong to `2026-06-11-google-workspace-connections-design.md`. That work was
  blocked on "the DragonCandy Workspace org does not exist"; the org does exist
  and has since at least 2026-08-10, so **that blocker is stale and should be
  re-examined** — but as its own piece of work, not this one.
- Email migration, mail routing rules, or DMARC/SPF changes. Transactional mail
  still originates from `notify.dragoncandy.io` and is untouched here.
- Calendar, Meet, and Chat configuration.
- Any change to the product's own design system. The `dc-*` app tokens are not
  touched; this spec uses the `landing-*` set exclusively.
