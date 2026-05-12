-- ============================================================
-- Help Articles Content Refresh
-- Updates all 18 existing articles with rich body + search_terms
-- Inserts 8 new articles for donny_ai and messaging categories
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- GETTING STARTED
-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>Creating your DragonCandy restaurant account takes under two minutes and unlocks your entire creator marketplace. Once signed up, you can launch campaigns, browse creators, and let Donny AI handle the matching.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-landing-page.png" class="rounded-xl shadow-md my-4 max-w-full" alt="DragonCandy landing page showing restaurant sign-up option" />

<ol>
  <li>Go to <strong>dragoncandy.io</strong> and tap <strong>Get Started</strong>.</li>
  <li>Choose <strong>Restaurant / Business</strong> as your role.</li>
  <li>Enter your email address and create a password, then tap <strong>Create Account</strong>.</li>
  <li>Check your email for a verification link and click it to activate your account.</li>
  <li>Complete your restaurant profile — name, location, and cuisine type — so creators can find you.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Use your business email so team members can be added later under the same account.</li>
  <li>Adding a profile photo and logo immediately makes your campaigns more appealing to creators.</li>
  <li>You can start building a campaign draft before your profile is fully complete.</li>
</ul>
$body$,
  search_terms = ARRAY['sign up', 'register', 'restaurant account', 'create account', 'onboarding', 'new account', 'getting started']
WHERE slug = 'signup-restaurant';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>Joining DragonCandy as a creator gives you access to paid campaigns from restaurants and brands in your area. Sign up in minutes and start building your portfolio.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-landing-page.png" class="rounded-xl shadow-md my-4 max-w-full" alt="DragonCandy landing page showing creator sign-up option" />

<ol>
  <li>Go to <strong>dragoncandy.io</strong> and tap <strong>Get Started</strong>.</li>
  <li>Choose <strong>Content Creator</strong> as your role.</li>
  <li>Enter your email and create a password, then tap <strong>Create Account</strong>.</li>
  <li>Verify your email by clicking the link we send you.</li>
  <li>Fill in your creator profile — niches, platforms, and a bio — so brands can match with you.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Add at least three portfolio samples to your profile to get higher match scores from Donny AI.</li>
  <li>Link your social accounts (Instagram, TikTok, YouTube) to unlock platform-specific campaigns.</li>
  <li>Complete every mission on your First Run checklist to unlock your first campaign eligibility.</li>
</ul>
$body$,
  search_terms = ARRAY['sign up', 'register', 'creator account', 'create account', 'onboarding', 'content creator', 'join dragoncandy']
WHERE slug = 'signup-creator';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>Brand accounts on DragonCandy give you the ability to sponsor campaigns, boost creator posts through DragonShare, and access Donny AI analytics across multiple restaurant partners. Setup takes less than three minutes.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-landing-page.png" class="rounded-xl shadow-md my-4 max-w-full" alt="DragonCandy landing page showing brand sign-up option" />

<ol>
  <li>Go to <strong>dragoncandy.io</strong> and tap <strong>Get Started</strong>.</li>
  <li>Choose <strong>Brand / Sponsor</strong> as your role.</li>
  <li>Enter your business email and create a password, then tap <strong>Create Account</strong>.</li>
  <li>Verify your email via the link we send you.</li>
  <li>Complete your brand profile — company name, industry, and target demographics.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Add your brand logo and a brief description to attract the right creators from day one.</li>
  <li>Link your Stripe account during setup to enable campaign funding without delays.</li>
  <li>Invite a team member right away so approvals can happen faster.</li>
</ul>
$body$,
  search_terms = ARRAY['sign up', 'brand account', 'sponsor', 'register', 'create account', 'onboarding', 'brand portal']
WHERE slug = 'signup-brand';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>A complete profile helps Donny AI match you with the right campaigns and creators. It also builds trust — both restaurants and creators check profiles before agreeing to work together.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-creator-profile.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Creator profile completion screen showing bio, links, and portfolio sections" />

<ol>
  <li>Open your <strong>Profile</strong> from the bottom navigation.</li>
  <li>Tap <strong>Edit Profile</strong> and fill in every required field — name, photo, bio, and location.</li>
  <li>Add your social platform links so DragonCandy can surface platform-specific campaigns.</li>
  <li>Upload at least one portfolio sample or brand logo.</li>
  <li>Save your changes — Donny AI will immediately begin factoring your updated profile into matches.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Profiles with photos receive significantly more inbound interest than those without.</li>
  <li>Keep your bio under 150 words — short and punchy wins on mobile.</li>
  <li>Revisit your profile after each completed campaign to add new work samples.</li>
</ul>
$body$,
  search_terms = ARRAY['profile', 'complete profile', 'edit profile', 'bio', 'portfolio', 'setup', 'profile photo']
WHERE slug = 'complete-profile';

-- ────────────────────────────────────────────────────────────
-- CAMPAIGNS
-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>Launching a campaign on DragonCandy is how you connect with content creators who will promote your restaurant or brand. Donny AI pre-fills many fields for you based on your profile — you just review and publish.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-restaurant-campaign-create.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Campaign creation form showing title, budget, and deliverables fields" />

<ol>
  <li>Tap the <strong>+</strong> button in the bottom navigation bar.</li>
  <li>Choose <strong>New Campaign</strong> and select a campaign type (e.g. Reel, Story, Blog Post).</li>
  <li>Review Donny's pre-filled campaign brief — edit the title, budget, and deliverables as needed.</li>
  <li>Set your campaign dates and any location or audience requirements.</li>
  <li>Tap <strong>Launch Campaign</strong> — your listing is live immediately.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Campaigns with a clear deliverable (e.g. "one 60-second Reel") attract more applicants than vague briefs.</li>
  <li>Set your budget before launch — you can always increase it, but lowering it after applications arrive is disruptive.</li>
  <li>Use the <strong>DragonDash</strong> option if you need content delivered in under 48 hours.</li>
</ul>
$body$,
  search_terms = ARRAY['launch campaign', 'create campaign', 'new campaign', 'campaign brief', 'post campaign', 'campaign setup', 'deliverables']
WHERE slug = 'launch-campaign';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>As a creator, applying to campaigns is how you earn on DragonCandy. Donny AI scores each campaign against your profile so you can quickly identify the best fits.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-creator-marketplace.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Creator marketplace showing campaign cards with match scores" />

<ol>
  <li>Open the <strong>Campaigns</strong> tab from the bottom navigation.</li>
  <li>Swipe through available campaigns — your Donny match score appears on each card.</li>
  <li>Tap a campaign card to read the full brief, budget, and deliverable requirements.</li>
  <li>Tap <strong>Apply Now</strong> and optionally add a note to the brand about why you're a great fit.</li>
  <li>Wait for the brand to review your application — you'll get a notification when they respond.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Focus on campaigns where your match score is 70% or above — acceptance rates are significantly higher.</li>
  <li>A personal note with your application increases your approval odds even for lower match scores.</li>
  <li>Check the <strong>My Campaigns</strong> tab to track the status of all your active applications.</li>
</ul>
$body$,
  search_terms = ARRAY['apply campaign', 'campaign application', 'apply now', 'match score', 'creator campaigns', 'browse campaigns', 'campaign marketplace']
WHERE slug = 'apply-campaign';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>Once a creator submits their content, you review and approve it before payment is released. DragonCandy keeps a clear submission history so nothing gets lost.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-restaurant-campaign-detail.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Campaign detail page showing content submission awaiting review" />

<ol>
  <li>Open the <strong>Campaigns</strong> section from your dashboard.</li>
  <li>Select the campaign with a pending submission — it will be marked <strong>Review Needed</strong>.</li>
  <li>Download or preview the submitted content files.</li>
  <li>Tap <strong>Approve</strong> to release payment, or <strong>Request Revision</strong> with written feedback.</li>
  <li>Once approved, payment is automatically released to the creator via Stripe.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Give specific revision feedback — "Needs more close-ups of the dish" beats "not quite right."</li>
  <li>Creators can submit up to two revisions under the standard campaign terms.</li>
  <li>Approving content quickly builds your reputation as a brand creators want to work with again.</li>
</ul>
$body$,
  search_terms = ARRAY['approve content', 'content review', 'submission review', 'revision request', 'approve submission', 'content approval', 'payment release']
WHERE slug = 'approve-content';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>DragonDash is DragonCandy's express delivery tier — rush campaigns that connect you with a pre-vetted creator and deliver finished content within 48 hours, guaranteed.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-restaurant-campaign-create.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Campaign creation form with DragonDash rush option highlighted" />

<ol>
  <li>Start a new campaign and select the <strong>DragonDash</strong> option.</li>
  <li>Set your brief — Donny AI pre-fills based on your past campaigns to save time.</li>
  <li>Confirm the rush surcharge (typically $25–$50 on top of the creator fee).</li>
  <li>DragonCandy immediately alerts qualified creators — first to accept gets the job.</li>
  <li>Receive finished content within 48 hours, or your rush surcharge is refunded.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>DragonDash works best for time-sensitive moments: new menu launches, weekend specials, last-minute promos.</li>
  <li>Creators who complete DragonDash campaigns earn a "DragonDash Certified" badge on their profile.</li>
  <li>For non-urgent campaigns, standard campaigns give you more time to vet applicants and negotiate.</li>
</ul>
$body$,
  search_terms = ARRAY['dragondash', 'rush campaign', 'express delivery', '48 hours', 'fast content', 'rush surcharge', 'urgent campaign']
WHERE slug = 'what-is-dragondash';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>The match score is Donny AI's assessment of how well a creator fits a specific campaign, expressed as a percentage from 0–100. Higher scores mean more relevant content history, audience alignment, and platform fit.</p>

<ol>
  <li>Donny evaluates your profile data — platforms, niche, past campaign performance, and audience demographics.</li>
  <li>Each campaign brief is analyzed for required platforms, tone, deliverables, and budget range.</li>
  <li>Donny compares the two and generates a match score visible to both the creator and the brand.</li>
  <li>Scores update automatically when you update your profile or complete new campaigns.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Completing your profile fully is the single biggest lever to improve your match scores.</li>
  <li>Brands can filter their creator search by minimum match score to quickly find top applicants.</li>
  <li>Match scores are advisory — brands can still select any creator they like regardless of score.</li>
</ul>
$body$,
  search_terms = ARRAY['match score', 'donny score', 'creator match', 'compatibility', 'ai matching', 'campaign fit', 'score explained']
WHERE slug = 'match-score';

-- ────────────────────────────────────────────────────────────
-- DRAGONSHARE
-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>DragonShare lets you earn money by posting about restaurants and brands you genuinely love — no campaign application required. If a brand boosts your post, you get paid when it performs.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-creator-dragonshare.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Creator DragonShare screen showing posts eligible for brand boost" />

<ol>
  <li>Go to the <strong>DragonShare</strong> tab in your navigation.</li>
  <li>Tap <strong>New Post</strong> and tag the restaurant or brand you're featuring.</li>
  <li>Add your content (photo, video, or link) and a caption, then publish.</li>
  <li>The brand receives a notification and can choose to <strong>Boost</strong> your post with a set dollar amount.</li>
  <li>Once boosted, you earn your share of the boost amount when the post hits agreed engagement targets.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Authentic posts about places you actually visited perform far better than scripted ones.</li>
  <li>Tag the brand clearly in your caption and in any linked social post to improve boost discovery.</li>
  <li>DragonShare earnings stack on top of any campaign fees — it's bonus income for content you'd post anyway.</li>
</ul>
$body$,
  search_terms = ARRAY['dragonshare', 'creator post', 'boost', 'earn money', 'organic post', 'brand tag', 'creator earnings']
WHERE slug = 'dragonshare-creator';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>DragonShare lets your brand reward creators who post about you organically — turning real fans into paid advocates without a formal campaign. You control the boost amount and approve every post before money moves.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-dragonshare.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Brand DragonShare dashboard showing pending creator posts available to boost" />

<ol>
  <li>Open your dashboard and go to <strong>DragonShare</strong>.</li>
  <li>Review incoming posts from creators who have tagged your brand.</li>
  <li>Preview the content, check the creator's profile and match score, then decide whether to boost.</li>
  <li>Set a boost amount and tap <strong>Boost This Post</strong> — funds are held in escrow until engagement targets are met.</li>
  <li>Once targets are met, payment is released automatically to the creator.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Start with a small boost ($10–$25) to test the format before committing larger amounts.</li>
  <li>Boosting quickly (within 24 hours of a post) tends to amplify organic momentum while the post is still fresh.</li>
  <li>You can decline a boost without any charge — only approved boosts result in payment.</li>
</ul>
$body$,
  search_terms = ARRAY['dragonshare', 'boost post', 'brand boost', 'organic content', 'creator payment', 'social boost', 'brand dashboard']
WHERE slug = 'dragonshare-brand';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>A good boost amount balances reach potential against your content budget. DragonCandy gives you real-time engagement benchmarks to help you decide before you commit.</p>

<ol>
  <li>Look at the creator's average engagement rate shown on their DragonShare post card.</li>
  <li>Compare it to the platform benchmark for their niche (shown in the boost dialog).</li>
  <li>As a rule of thumb: $10–$25 for micro-influencers (under 10k followers), $50–$150 for mid-tier (10k–100k).</li>
  <li>Consider the content type — video Reels typically drive more measurable engagement than static posts.</li>
  <li>Set a target engagement metric (likes, saves, plays) and DragonCandy will auto-release payment when it's hit.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Don't over-index on follower count alone — engagement rate is a better predictor of ROI.</li>
  <li>You can split a larger budget across several micro-influencer boosts rather than one big boost.</li>
  <li>Donny AI will suggest a recommended boost range based on your past campaign data as you build history.</li>
</ul>
$body$,
  search_terms = ARRAY['boost amount', 'how much to boost', 'dragonshare budget', 'boost pricing', 'engagement rate', 'influencer budget', 'boost strategy']
WHERE slug = 'good-boost-amount';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>Creator payments on DragonCandy are processed through Stripe and released automatically once content is approved — no chasing invoices, no waiting on manual transfers.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-creator-dashboard.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Creator dashboard showing earnings summary and payment status" />

<ol>
  <li>When a brand approves your content submission, a Stripe transfer is triggered automatically.</li>
  <li>Standard campaigns: funds arrive in your Stripe-linked bank account within <strong>2–5 business days</strong>.</li>
  <li>DragonDash campaigns: payment is prioritized and typically processes within <strong>1–2 business days</strong>.</li>
  <li>DragonShare boosts: payment releases once the agreed engagement target is met and verified.</li>
  <li>Track all earnings and payment statuses in your <strong>Earnings</strong> section on the creator dashboard.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Make sure your Stripe payout account is set up and verified before your first campaign ends.</li>
  <li>Payment timing can vary slightly by bank — Stripe's standard transfer window is 2–5 business days.</li>
  <li>If a payment shows "Pending" for more than 7 days, contact support — it's almost always a Stripe verification issue.</li>
</ul>
$body$,
  search_terms = ARRAY['creator payment', 'when paid', 'payment timing', 'stripe payout', 'earnings', 'payment schedule', 'payout']
WHERE slug = 'creator-payment-timing';

-- ────────────────────────────────────────────────────────────
-- BILLING
-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>DragonCandy's pricing is built around a take-rate model — the higher your subscription tier, the lower the percentage fee on each campaign. Choose the tier that matches your campaign volume.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-restaurant-billing.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Billing page showing subscription tiers and take-rate percentages" />

<ol>
  <li><strong>Free</strong> — No monthly fee. 10% take-rate on every campaign.</li>
  <li><strong>Starter ($149/mo)</strong> — 7% take-rate. Best for restaurants running 1–3 campaigns per month.</li>
  <li><strong>Growth ($499/mo)</strong> — 5% take-rate. Best for brands running consistent weekly campaigns.</li>
  <li><strong>Pro ($999/mo)</strong> — 3% take-rate. Best for high-volume operators and agencies.</li>
  <li><strong>Enterprise</strong> — Custom take-rate (as low as 2%). Contact sales for volume pricing.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Run the math: if your monthly campaign spend exceeds $5,000, Starter pays for itself in take-rate savings alone.</li>
  <li>Donny AI credits and DragonDash rush surcharges are billed separately — they apply across all tiers.</li>
  <li>Annual billing saves 2 months compared to monthly pricing.</li>
</ul>
$body$,
  search_terms = ARRAY['pricing', 'subscription', 'take rate', 'tiers', 'billing plans', 'starter growth pro', 'platform fee']
WHERE slug = 'pricing-tiers';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>You can upgrade or downgrade your DragonCandy plan at any time from your billing settings. Changes take effect at the start of your next billing cycle.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-restaurant-billing.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Billing settings page showing plan change options" />

<ol>
  <li>Go to <strong>Settings → Billing</strong> from your dashboard.</li>
  <li>Tap <strong>Change Plan</strong> next to your current subscription.</li>
  <li>Select the new tier you want — a summary of changes and prorated costs is shown.</li>
  <li>Confirm the change — your new take-rate applies immediately to any new campaigns.</li>
  <li>Your next invoice will reflect the new plan price.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Upgrading mid-cycle: you pay a prorated amount for the remainder of the current cycle.</li>
  <li>Downgrading mid-cycle: no charge — the lower rate takes effect at the next renewal date.</li>
  <li>You can cancel your subscription entirely from the same page; the Free tier remains available permanently.</li>
</ul>
$body$,
  search_terms = ARRAY['upgrade plan', 'downgrade plan', 'change subscription', 'billing change', 'plan switch', 'cancel subscription', 'prorate']
WHERE slug = 'upgrade-downgrade';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>DragonCandy's refund policy is designed to be fair to both brands and creators. Most refund requests are resolved within 3 business days.</p>

<ol>
  <li><strong>Campaign cancelled before any creator accepted</strong> — Full refund, no questions asked.</li>
  <li><strong>Campaign cancelled after creator acceptance, before submission</strong> — 50% refund; creator keeps 50% as a kill fee.</li>
  <li><strong>Content submitted but not approved</strong> — Open a dispute; DragonCandy mediates within 48 hours.</li>
  <li><strong>DragonDash rush surcharge</strong> — Fully refunded if content is not delivered within 48 hours.</li>
  <li>To request a refund, go to <strong>Settings → Billing → Refund Request</strong>.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Subscription fees are non-refundable mid-cycle — plan changes take effect at renewal.</li>
  <li>If a creator's submitted content is clearly off-brief, document the discrepancy in the dispute form for faster resolution.</li>
  <li>Most payment disputes are avoidable with a clear brief upfront — Donny AI's brief templates help.</li>
</ul>
$body$,
  search_terms = ARRAY['refund', 'cancellation', 'cancel campaign', 'dispute', 'money back', 'billing refund', 'campaign refund']
WHERE slug = 'refunds';

-- ────────────────────────────────────────────────────────────
-- ACCOUNT
-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>DragonCandy supports multiple team members on a single restaurant or brand account. Each role has specific permissions so the right people can approve content, manage billing, and launch campaigns.</p>

<ol>
  <li><strong>Owner</strong> — Full access: billing, team management, campaign control, and account deletion.</li>
  <li><strong>Admin</strong> — Can create and manage campaigns, approve content, and manage team members (except billing).</li>
  <li><strong>Campaign Manager</strong> — Can create and manage campaigns and review submissions. No billing or team access.</li>
  <li><strong>Viewer</strong> — Read-only access: can view campaigns, analytics, and submissions but cannot make changes.</li>
  <li>Invite a team member at <strong>Settings → Team → Invite Member</strong> and assign their role at invite time.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Only the Owner can delete the account or change the subscription — protect Owner access carefully.</li>
  <li>Campaign Managers are ideal for social media coordinators who run day-to-day campaign operations.</li>
  <li>You can change a member's role at any time from the Team settings page.</li>
</ul>
$body$,
  search_terms = ARRAY['team roles', 'permissions', 'admin', 'team member', 'invite team', 'owner role', 'campaign manager']
WHERE slug = 'team-roles';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>You can delete your DragonCandy account at any time. Before deletion, any active campaigns must be closed and any pending payments must be settled.</p>

<ol>
  <li>Go to <strong>Settings → Account → Danger Zone</strong>.</li>
  <li>Tap <strong>Delete My Account</strong> — you'll be shown a summary of active campaigns and pending payments.</li>
  <li>Resolve any open items (cancel active campaigns, wait for pending payments to settle).</li>
  <li>Confirm account deletion by entering your email address in the confirmation prompt.</li>
  <li>Your account and all associated data will be scheduled for deletion within 30 days, per GDPR requirements.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Deletion is permanent — download any content or analytics you want to keep before proceeding.</li>
  <li>If you just want a break, you can deactivate your account instead of deleting it — all data is preserved.</li>
  <li>For GDPR erasure requests (full data removal), see the separate GDPR article.</li>
</ul>
$body$,
  search_terms = ARRAY['delete account', 'close account', 'remove account', 'account deletion', 'cancel account', 'deactivate', 'danger zone']
WHERE slug = 'delete-account';

-- ────────────────────────────────────────────────────────────

UPDATE help_articles SET
  body = $body$
<p>Under GDPR and similar privacy regulations, you have the right to request complete erasure of your personal data from DragonCandy. Erasure requests are processed within 30 days.</p>

<ol>
  <li>Go to <strong>Settings → Account → Privacy → Request Data Erasure</strong>.</li>
  <li>Submit your erasure request — you'll receive an email confirmation within 24 hours.</li>
  <li>Our team reviews the request to ensure no active contracts or unsettled payments block erasure.</li>
  <li>Once cleared, all personal data — profile, messages, campaign history — is permanently deleted.</li>
  <li>You'll receive a final confirmation email when erasure is complete (within 30 days of the request).</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Anonymized, non-identifiable analytics data may be retained for platform improvement — this is not personal data under GDPR.</li>
  <li>If you have active subscriptions, cancel them before submitting an erasure request to avoid unexpected charges.</li>
  <li>For questions about your data rights, email <strong>privacy@dragoncandy.io</strong> directly.</li>
</ul>
$body$,
  search_terms = ARRAY['GDPR', 'data erasure', 'right to erasure', 'privacy', 'data deletion', 'personal data', 'CCPA']
WHERE slug = 'gdpr-erasure';

-- ============================================================
-- NEW ARTICLES: donny_ai category
-- ============================================================

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'what-is-donny',
  'What is Donny AI?',
  $body$
<p>Donny AI is DragonCandy's built-in intelligence layer — it handles creator matching, campaign brief generation, match scoring, and in-app guidance so you spend less time on setup and more time on results.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-restaurant-dashboard.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Restaurant dashboard with Donny AI suggestions panel visible" />

<ol>
  <li>Donny reads your profile, past campaigns, and platform context to understand your goals.</li>
  <li>When you create a campaign, Donny pre-fills the brief based on your history — fewer keystrokes, better briefs.</li>
  <li>Donny scores every creator against your campaign brief and surfaces the highest matches first.</li>
  <li>Throughout the app, Donny surfaces contextual tips and next actions based on where you are in a workflow.</li>
  <li>As you complete more campaigns, Donny's recommendations improve — it learns from your outcomes.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>The more campaigns you complete, the smarter Donny gets — data quality compounds over time.</li>
  <li>You can always override Donny's suggestions — it's a co-pilot, not an autopilot.</li>
  <li>Donny credit usage is shown in your billing dashboard; each tier includes a monthly allowance.</li>
</ul>
$body$,
  'donny_ai',
  ARRAY['restaurant', 'creator', 'brand'],
  ARRAY['donny', 'donny ai', 'ai assistant', 'artificial intelligence', 'smart matching', 'ai recommendations', 'campaign ai']
);

-- ────────────────────────────────────────────────────────────

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'donny-match-scores',
  'How Donny calculates match scores',
  $body$
<p>Donny AI generates a match score (0–100%) for every creator-campaign pairing using a multi-factor model trained on DragonCandy's campaign completion data.</p>

<ol>
  <li><strong>Platform fit (30%)</strong> — Does the creator actively post on the platform the campaign requires?</li>
  <li><strong>Niche alignment (25%)</strong> — Does the creator's content niche match the brand's industry and tone?</li>
  <li><strong>Audience demographics (20%)</strong> — Does the creator's audience geography and age match the brand's target?</li>
  <li><strong>Past performance (15%)</strong> — How have this creator's past DragonCandy campaigns performed?</li>
  <li><strong>Profile completeness (10%)</strong> — Is the creator's profile fully filled in with verifiable social links?</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Creators can directly improve their scores by completing their profile and linking social accounts.</li>
  <li>Brands can adjust match weighting for specific campaigns (e.g. prioritize demographics over niche).</li>
  <li>Match scores are recalculated every time a creator updates their profile or completes a new campaign.</li>
</ul>
$body$,
  'donny_ai',
  ARRAY['restaurant', 'creator', 'brand'],
  ARRAY['match score', 'how match score works', 'donny algorithm', 'score calculation', 'creator ranking', 'ai scoring', 'matching algorithm']
);

-- ────────────────────────────────────────────────────────────

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'donny-campaign-suggestions',
  'Donny campaign suggestions',
  $body$
<p>Donny AI proactively suggests campaign ideas based on your business profile, past performance, and seasonal context — so you always have a starting point when inspiration runs dry.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-restaurant-dashboard.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Dashboard showing Donny AI campaign suggestion cards for the week" />

<ol>
  <li>Open your dashboard — Donny's suggested campaigns appear in the <strong>Donny Recommends</strong> section.</li>
  <li>Tap a suggestion to preview the pre-filled brief, budget range, and recommended creator types.</li>
  <li>Edit any fields you want to adjust, then tap <strong>Launch</strong> to go live immediately.</li>
  <li>Donny learns from which suggestions you launch and which you skip — it gets more accurate over time.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Suggestions are refreshed weekly — check back Monday mornings for new ideas based on upcoming calendar events.</li>
  <li>Seasonal and local event hooks (holidays, sports seasons, neighborhood events) are factored in automatically.</li>
  <li>You can dismiss a suggestion with one tap — dismissed suggestions feed back into Donny's preference model.</li>
</ul>
$body$,
  'donny_ai',
  ARRAY['restaurant', 'brand'],
  ARRAY['campaign suggestions', 'donny recommends', 'ai suggestions', 'campaign ideas', 'auto campaign', 'smart campaigns', 'donny dashboard']
);

-- ────────────────────────────────────────────────────────────

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'donny-help-briefs',
  'Getting help from Donny',
  $body$
<p>Donny AI is available throughout the app to answer questions, suggest next steps, and generate content briefs on demand. Think of it as a knowledgeable teammate available 24/7.</p>

<ol>
  <li>Look for the <strong>Ask Donny</strong> button on any campaign or dashboard screen.</li>
  <li>Type your question or request — e.g. "Help me write a brief for a lunch special Reel" or "Which creators fit my new campaign?"</li>
  <li>Donny responds with a suggested action, pre-filled form, or direct answer within seconds.</li>
  <li>You can accept Donny's suggestion with one tap or edit before confirming.</li>
  <li>Donny interactions are logged in your session — scroll back to review earlier suggestions in the same session.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Be specific in your request — "Write a 3-step brief for a weekend brunch Instagram Reel" gets better results than "help with campaign."</li>
  <li>Donny can explain any DragonCandy feature — try "What does match score mean?" for instant context.</li>
  <li>Each Donny interaction counts against your monthly credit allowance — shown in Settings → Billing.</li>
</ul>
$body$,
  'donny_ai',
  ARRAY['restaurant', 'creator', 'brand'],
  ARRAY['donny help', 'ask donny', 'ai help', 'campaign brief help', 'donny chat', 'donny assistant', 'ai support']
);

-- ============================================================
-- NEW ARTICLES: messaging category
-- ============================================================

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'messaging-basics',
  'How messaging works',
  $body$
<p>DragonCandy's built-in messaging lets brands and creators communicate directly within a campaign — no email threads, no third-party apps, everything in one place.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-messaging.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Messaging screen showing a conversation thread between a restaurant and creator" />

<ol>
  <li>Open any active campaign or collaboration and tap <strong>Message</strong>.</li>
  <li>A dedicated conversation thread is created for that campaign — all messages are tied to that campaign's context.</li>
  <li>Type your message in the input bar and tap the send arrow to deliver it instantly.</li>
  <li>Both parties receive push notifications for new messages.</li>
  <li>All messages are stored and accessible for the lifetime of the campaign — nothing is auto-deleted.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Use messaging to clarify brief details before a creator starts shooting — catching misalignments early saves revision cycles.</li>
  <li>You can also access your full message inbox from the <strong>Messages</strong> icon in the bottom navigation.</li>
  <li>Campaigns with active message threads show a blue indicator on the campaign card so you never miss a reply.</li>
</ul>
$body$,
  'messaging',
  ARRAY['restaurant', 'creator', 'brand'],
  ARRAY['messaging', 'chat', 'direct message', 'campaign chat', 'inbox', 'conversation', 'message creator']
);

-- ────────────────────────────────────────────────────────────

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'sharing-files-in-chat',
  'Sharing files in conversations',
  $body$
<p>You can share images, videos, and documents directly inside a DragonCandy conversation — no need to use external file transfer tools for campaign assets.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-creator-messaging.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Creator messaging screen showing file attachment option in chat input bar" />

<ol>
  <li>Open a conversation and tap the <strong>+</strong> button on the left side of the message input bar.</li>
  <li>Choose <strong>Photo/Video</strong> to attach media, or <strong>File</strong> to attach a document (PDF, ZIP, etc.).</li>
  <li>Select the file from your device — it uploads automatically and appears in the thread as a preview.</li>
  <li>The recipient can tap the preview to download or view the file in full screen.</li>
  <li>All shared files are also accessible in the campaign's <strong>Files</strong> tab for easy retrieval later.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Max file size is 500 MB per attachment — compress large video files before sharing to avoid delays.</li>
  <li>For official content submissions (deliverables), use the campaign's dedicated <strong>Submit Content</strong> button rather than chat — this triggers the formal review and payment flow.</li>
  <li>Shared files are retained for 12 months after the campaign closes.</li>
</ul>
$body$,
  'messaging',
  ARRAY['restaurant', 'creator', 'brand'],
  ARRAY['file sharing', 'attach file', 'send photo', 'share video', 'file upload chat', 'messaging files', 'content sharing']
);

-- ────────────────────────────────────────────────────────────

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'messaging-presence',
  'Online status and presence',
  $body$
<p>DragonCandy shows real-time online presence indicators so you know when the person you're messaging is currently active — no more guessing if your message was seen.</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-messaging.png" class="rounded-xl shadow-md my-4 max-w-full" alt="Messaging screen showing green online indicator next to a creator's name" />

<ol>
  <li>Open any conversation — a <strong>green dot</strong> next to the user's name means they're currently online.</li>
  <li>A <strong>gray dot</strong> with a timestamp shows when they were last active (e.g. "Last seen 2h ago").</li>
  <li>Presence updates automatically as users open or close the app — no manual status setting needed.</li>
  <li>Your own presence is visible to everyone you have an active conversation with.</li>
  <li>To hide your presence, go to <strong>Settings → Privacy → Show Online Status</strong> and toggle it off.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Sending a message when someone is shown as online typically gets a faster reply — use it to time important asks.</li>
  <li>Presence is only shared with users you have an active campaign or conversation with, not the entire platform.</li>
  <li>Hiding your status is useful when you want to review messages without triggering immediate reply expectations.</li>
</ul>
$body$,
  'messaging',
  ARRAY['restaurant', 'creator', 'brand'],
  ARRAY['online status', 'presence', 'active now', 'last seen', 'green dot', 'messaging status', 'privacy presence']
);

-- ────────────────────────────────────────────────────────────

INSERT INTO help_articles (id, slug, title, body, category, roles, search_terms) VALUES (
  gen_random_uuid(),
  'messaging-notifications',
  'Message notifications',
  $body$
<p>DragonCandy sends push and in-app notifications for every new message so you never miss an important update from a brand or creator during an active campaign.</p>

<ol>
  <li>By default, push notifications are enabled for all new messages — allow notifications when prompted on first launch.</li>
  <li>Notifications appear on your device lock screen and as in-app banners when the app is open.</li>
  <li>Tap a notification to jump directly to the conversation thread.</li>
  <li>To adjust notification settings, go to <strong>Settings → Notifications → Messages</strong>.</li>
  <li>You can mute individual conversations from within the chat by tapping the <strong>mute</strong> option in the conversation header.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Keep message notifications on during active campaigns — missed messages are the top cause of campaign delays.</li>
  <li>Muting works conversation-by-conversation, so you can silence low-priority threads without turning off all alerts.</li>
  <li>Email notification digests are also available as a backup — enable them in <strong>Settings → Notifications → Email Digests</strong>.</li>
</ul>
$body$,
  'messaging',
  ARRAY['restaurant', 'creator', 'brand'],
  ARRAY['notifications', 'message alerts', 'push notifications', 'mute conversation', 'notification settings', 'message notification', 'alert']
);
