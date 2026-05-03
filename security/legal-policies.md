# DragonCandy — Legal & Policy Starter Documents

> ⚠️ **CRITICAL DISCLAIMER:** I am not a lawyer. These are starter templates derived from common marketplace patterns and verified against current 2026 regulatory requirements. They are NOT a substitute for review by a qualified attorney before publication. **Budget $1,500–3,500 for an attorney review.** This is the single highest-ROI legal spend you'll make at launch.

---

## What's in here

1. **Privacy Policy** — CCPA-shaped, US-only
2. **Terms of Service** — marketplace-specific, three-role
3. **Creator Agreement** — content rights, FTC compliance
4. **Acceptable Use Policy** — what gets users banned
5. **DMCA Policy** — required for safe harbor
6. **Cookie Notice** — minimal, US-only

---

## Recommendations Before You Use Any Of This

1. **Hire a startup-marketplace attorney for a 2-hour review.** Cost: $500–1,200. Ask them specifically about: payment platform liability, creator/restaurant indemnification, marketplace terms structure, and CCPA-readiness language.
2. **Use Termly, Iubenda, or Termageddon** for $20–40/month if you want a generated policy backed by a vendor's legal team. These are not a substitute for an attorney but they're better than DIY templates and they auto-update with regulatory changes.
3. **Have your insurance broker review your liability stance** before publishing. You'll want professional liability and cyber liability insurance regardless ($500–2,000/year for a startup of your size).

---

## Document 1: Privacy Policy (template)

**File path on site:** `/privacy`
**Updated:** [DATE]
**Effective:** [DATE]

### Plain-English Summary (top of page)

> We collect the information you give us when you sign up and use DragonCandy — like your name, email, business or creator profile details, location, and payment info that you give to Stripe (not us). We use this to run the marketplace, match you with creators or restaurants, process payments, and send you notifications. We don't sell your data. You can ask to see, correct, or delete your data anytime by emailing privacy@dragoncandy.io.

### What we collect

- **Account info:** Name, email, password (hashed), role (Restaurant / Brand / Creator)
- **Profile info:** Business name, location, social media handles, profile photo, content specialties (creators)
- **Campaign data:** Briefs, deliverables, ratings, messages between users
- **Payment info:** Handled by Stripe Connect — we receive only metadata (amount, status, your Stripe Connected Account ID), never your card details
- **Usage data:** Pages visited, features used, IP address, device type, browser
- **Communications:** Emails, in-app messages, support requests

### How we use it

To operate the marketplace: matching, payments, notifications, support, fraud prevention, legal compliance, and product improvement.

### Who we share it with

- **Stripe** — payment processing (their privacy policy applies)
- **Supabase** — database hosting (their privacy policy applies)
- **Anthropic** — AI features (Donny AI). We send your campaign briefs and creator profiles for matching. Anthropic does not train on your data per their API terms.
- **Resend (or Postmark)** — transactional email
- **Other users on the marketplace** — your profile, campaigns, ratings, and messages are visible to relevant counterparties

### What we don't do

- We don't sell your personal information
- We don't share your data with advertisers
- We don't track you across other websites

### Your rights

You can:
- Request a copy of your data (email privacy@dragoncandy.io)
- Correct inaccurate data (in your account settings)
- Delete your account (account settings → delete account; payment audit trail retained 7 years per IRS requirement)
- Opt out of marketing emails (link in every email; transactional emails can't be opted out of)

### California residents

While DragonCandy is currently below CCPA's covered-business thresholds, we honor CCPA-style rights regardless. California residents can:
- Know what personal information we collect
- Request deletion (subject to legal retention requirements)
- Opt out of "sale" or "sharing" (we don't do either, but the option is here)
- Receive non-discriminatory service if you exercise these rights

Contact: privacy@dragoncandy.io

### Children

DragonCandy is not for users under 18. We don't knowingly collect data from children. If you believe a child has provided us data, email privacy@dragoncandy.io.

### Security

We use industry-standard security: TLS encryption in transit, encryption at rest, role-based access controls, and regular security reviews. No system is perfectly secure, but we work to minimize risk.

### Changes

We'll notify you of material changes via email and post the updated policy at /privacy with a new effective date.

### Contact

privacy@dragoncandy.io
[Mailing address]

---

## Document 2: Terms of Service (template)

**File path:** `/terms`

### Acceptance

By creating an account or using DragonCandy, you agree to these Terms. If you don't agree, don't use the service.

### Three roles, three sets of obligations

DragonCandy is a marketplace. Three roles operate here:
- **Restaurants/Businesses:** Hire creators for content
- **Brands/Sponsors:** Run multi-location creator campaigns
- **Content Creators:** Provide content services to Restaurants and Brands

Each role has separate obligations spelled out in role-specific addenda below.

### Eligibility

You must be 18+, have legal capacity to contract, and be located in the United States. You must not be barred from using digital services under applicable law.

### Account responsibility

You're responsible for your account, including any activity under it. Don't share credentials. If your account is compromised, email security@dragoncandy.io immediately.

### What DragonCandy is and isn't

- DragonCandy is a marketplace platform. We facilitate connections; we don't employ creators, own restaurants, or guarantee the quality of any content delivered.
- Creators are independent contractors of the businesses or brands that hire them, NOT employees of DragonCandy.
- We don't guarantee any particular outcome from creator content (engagement, sales, traffic, etc.).

### Payments

- Payments flow through Stripe Connect. By using DragonCandy, you also agree to Stripe's Connected Account Agreement.
- DragonCandy charges a marketplace take rate (currently 15-20% of campaign value), shown to you before each transaction.
- Subscription fees are charged in advance, monthly or annually as selected.
- Refunds: see the refund policy section below.

### Refunds and disputes

- **Restaurants/Brands:** If a deliverable is rejected for cause within the revision limit, the payment is refunded.
- **Creators:** Approved deliverables are non-refundable.
- **Disputes:** If parties cannot resolve a dispute, DragonCandy may make a final determination based on platform records. We are not arbitrators of taste.
- **Chargebacks:** Initiating a chargeback for a paid-for, approved deliverable is grounds for account termination.

### Intellectual property

- **Your content:** You own what you create. You grant DragonCandy a license to display, store, and process it solely to operate the marketplace.
- **DragonCandy's content:** The platform itself (code, design, brand) is owned by DragonCandy and protected by IP law.
- **Creator deliverables:** Usage rights are governed by the per-campaign agreement, surfaced to creators before they accept gigs. Default rights expire 12 months after delivery unless otherwise specified.

### Conduct (linked to AUP)

You agree to follow the Acceptable Use Policy. Violation results in account suspension or termination.

### Termination

- You may close your account anytime via Settings.
- We may suspend or terminate accounts for AUP violations, payment failures, fraud, or legal compliance.
- On termination, your data is retained per the Privacy Policy retention schedule.

### Disclaimers and limits

DragonCandy is provided "AS IS" without warranties of any kind. To the maximum extent permitted by law, our liability for any claim is limited to fees you paid us in the prior 12 months.

[**ATTORNEY MUST DRAFT THIS SECTION** — disclaimers, limitations, indemnification, and dispute resolution clauses are state-specific and require professional review.]

### Governing law and dispute resolution

These Terms are governed by [STATE — likely New Jersey since Dame is in Jersey City] law. Disputes are resolved in [STATE] courts, with both parties waiving jury trial. Class action waiver applies.

[**Mandatory arbitration clause requires attorney drafting.** This is increasingly contested in courts and the right framing matters.]

### Changes

We'll notify you of material changes via email. Continued use after notice constitutes acceptance.

### Contact

legal@dragoncandy.io

---

## Document 3: Creator Agreement Addendum

> Becomes part of the Terms when a user signs up as a Creator. Surfaced during signup with explicit checkbox.

### Independent contractor

You are an independent contractor for the Restaurants and Brands that hire you through DragonCandy, NOT an employee of DragonCandy or those businesses. You are responsible for your own taxes, insurance, and business operations.

### Content rights

You represent that you own all rights in the content you submit, OR have licenses sufficient to grant the rights granted here.

You grant the hiring Restaurant/Brand a license to use the content per the per-campaign usage rights specified before you accept the gig.

You retain ownership of your content unless explicitly assigned in a campaign brief.

### FTC disclosure compliance (REQUIRED)

You agree to comply with FTC Endorsement Guides (16 CFR Part 255). Specifically:
- Every paid post must disclose the material connection (e.g., #ad, #sponsored, "paid partnership with [restaurant]")
- Disclosure must be in the post itself, not just your bio
- TikTok creators must use the Branded Content Toggle
- Instagram creators must use the Paid Partnership tag
- You may not make claims you haven't personally verified
- DragonCandy provides automated disclosure tagging — you must use it

Failure to comply may result in:
- Withholding of payment for non-compliant deliverables
- Account suspension
- Liability to you for FTC enforcement actions resulting from non-disclosure

### Authentic experience required

You must have actually used the product, eaten at the restaurant, or experienced what you're endorsing before posting. No exceptions.

### Exclusivity

If a campaign specifies exclusivity, you may not promote competing brands during the exclusivity window.

### Payment

You will be paid via your connected Stripe account upon deliverable approval. Payouts follow Stripe's standard schedule (typically 2 business days).

### Off-platform circumvention

For 12 months after being matched with a Restaurant or Brand through DragonCandy, you agree to transact future work with that party through DragonCandy. Direct off-platform dealings discovered during this window may result in account termination and forfeiture of pending payments.

### Tax reporting

Creators earning $600+ in a year will receive a 1099-K from Stripe (not DragonCandy).

---

## Document 4: Acceptable Use Policy

> Linked from the Terms.

### What you must NOT do

- Submit fake reviews or paid-positive-only content
- Misrepresent your identity, follower count, or engagement metrics
- Engage in harassment, hate speech, or threats toward other users
- Post content that infringes third-party IP
- Use the platform to coordinate or facilitate illegal activity
- Attempt to circumvent platform fees or off-platform deal-making (creators)
- Use bots, scrapers, or automation to interact with the platform (other than DragonCandy's own approved integrations)
- Reverse engineer, decompile, or attempt to extract source code
- Probe the platform for security vulnerabilities without responsible disclosure (email security@dragoncandy.io for our disclosure policy)

### Consequences

First violation: warning + content removed. Repeat or severe violations: account suspension or termination. Illegal activity: reported to law enforcement.

### Reporting violations

Email abuse@dragoncandy.io with details. We respond to all reports within 5 business days.

---

## Document 5: DMCA Policy

> Required to maintain DMCA Safe Harbor protection under 17 U.S.C. § 512.

### Designated agent

DragonCandy has designated the following agent to receive DMCA notifications:

- Name: [Dame's name or company representative]
- Email: dmca@dragoncandy.io
- Address: [Physical address — required]
- Phone: [Phone number — required]

(This must be registered with the U.S. Copyright Office at https://dmca.copyright.gov — $6 fee, renews every 3 years.)

### How to submit a takedown notice

Send a written notice to dmca@dragoncandy.io including:
1. Your physical or electronic signature
2. Identification of the copyrighted work claimed to be infringed
3. Identification of the material claimed to be infringing, with URL or sufficient detail to locate it
4. Your contact information
5. A statement that you have a good faith belief the use is not authorized
6. A statement, under penalty of perjury, that the information is accurate and you are authorized to act on behalf of the rights holder

### Counter-notification

If your content was removed and you believe it was in error, you may submit a counter-notification with:
1. Your signature
2. Identification of the removed content and its previous location
3. A statement under penalty of perjury that you have a good faith belief the removal was a mistake or misidentification
4. Your contact information
5. A statement that you consent to jurisdiction in [STATE] federal court

### Repeat infringer policy

DragonCandy terminates accounts of users who are determined to be repeat infringers, in our sole discretion.

---

## Document 6: Cookie Notice (minimal, US-only)

We use cookies and similar technologies for:
- **Essential:** Authentication, session management, security (cannot be disabled)
- **Functional:** Remembering preferences, language settings
- **Analytics:** Understanding usage patterns (anonymized)

We do NOT use cookies for advertising or third-party tracking.

You can manage cookie preferences in your browser settings or via our [Cookie Settings link, if implemented].

---

## Document 7: Email Footer (CAN-SPAM compliance)

Every marketing email MUST include:
- The name and physical postal address of the sender
- A clear and conspicuous unsubscribe link
- An accurate "From" line and subject

Template footer:
```
DragonCandy
[Physical address — REQUIRED]

You received this email because you have an account at DragonCandy.io.
[Unsubscribe from marketing emails] | [Privacy Policy]
```

Transactional emails (campaign notifications, payment receipts, security alerts) are exempt from the unsubscribe requirement, but should still include the physical address.

---

## Implementation checklist

- [ ] Hire attorney for review (budget $1,500–3,500)
- [ ] Register DMCA agent ($6 at dmca.copyright.gov)
- [ ] Get a physical address you're willing to publish (use a registered agent service if you don't want home address — $50–150/year)
- [ ] Create email aliases: privacy@, legal@, dmca@, abuse@, security@
- [ ] Set up routing for these to a monitored inbox
- [ ] Buy professional liability + cyber liability insurance (~$500–2,000/year)
- [ ] Add policy links to footer of every page
- [ ] Add accept-terms checkbox to signup flow with timestamp logging
- [ ] Add separate creator agreement checkbox to creator signup
- [ ] Set calendar reminder for annual policy review
