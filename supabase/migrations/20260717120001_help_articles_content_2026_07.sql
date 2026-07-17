-- Help Articles content refresh (2026-07) + new articles.
-- Established pattern: UPDATE existing rows by slug (dollar-quoted bodies), then INSERT new rows.

-- ── Donny AI: what-is-donny ───────────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Donny is DragonCandy's built-in AI assistant. It lives in the chat panel on every screen (the "Ask Donny" launcher) and helps you get things done with far less typing — generating campaigns, finding creators, answering how-to questions, and pointing you to the right screen.</p>

<h3>What Donny can do</h3>
<ul>
  <li><strong>Build campaigns for you</strong> — describe what you want (or paste a website/menu link) and Donny drafts a full campaign brief you can edit and launch.</li>
  <li><strong>Find creators</strong> — ask "find creators near me" and Donny returns a ranked list of creator cards with distance, plus buttons to view a portfolio or invite them.</li>
  <li><strong>Answer how-to questions</strong> — ask how any feature works and Donny pulls the matching help articles.</li>
  <li><strong>Look things up on the web</strong> — Donny can search the web and read a page when a question needs current, outside information.</li>
  <li><strong>Suggest next steps</strong> — Donny offers quick actions that take you straight to the right screen.</li>
</ul>

<h3>Tips</h3>
<ul>
  <li>Be specific — "Draft a weekend brunch Reel campaign for creators near me" beats "help with a campaign."</li>
  <li>Donny is a co-pilot, not an autopilot — you review and confirm before anything goes live.</li>
  <li>The more campaigns you run, the better Donny's suggestions get.</li>
</ul>
$body$,
  search_terms = ARRAY['donny','ai','assistant','chat','what is donny','help','find creators','campaign','web search']
WHERE slug = 'what-is-donny';

-- ── Donny AI: donny-help-briefs ───────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Donny is available throughout the app to answer questions and take actions for you. Open the chat from the "Ask Donny" launcher on any dashboard or campaign screen.</p>

<ol>
  <li>Open Donny from the "Ask Donny" launcher (a side panel on desktop, a slide-up chat on mobile).</li>
  <li>Type your question or request — for example "How do crews work?", "Find creators near me", or "Draft a taco Tuesday campaign."</li>
  <li>Donny replies with an answer, a ready-to-edit draft, creator cards, or a quick action button that jumps you to the right screen.</li>
  <li>Review Donny's suggestion and confirm — nothing is published without you.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Ask Donny to explain any feature — "What is a match score?" or "How do I get paid?" — and it pulls the matching help articles.</li>
  <li>The clearer your request, the better the result. Include the platform, goal, and audience where relevant.</li>
  <li>Donny is included with your plan — how much you can use scales with your plan tier.</li>
</ul>
$body$,
  search_terms = ARRAY['donny','ask donny','chat','help','brief','questions','assistant','quick actions']
WHERE slug = 'donny-help-briefs';

-- ── Donny AI: donny-campaign-suggestions ──────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Stuck on what to run next? Ask Donny for campaign ideas. Donny drafts complete campaign concepts — title, angle, budget guidance, and the platforms and creator types that fit — grounded in your business profile.</p>

<ol>
  <li>Open Donny and ask for ideas — e.g. "Give me 3 campaign ideas for this month" or "Draft a campaign to promote our new brunch menu."</li>
  <li>Donny returns ready-to-edit campaign concepts, including a bolder "wildcard" idea to push your thinking.</li>
  <li>Pick one, tweak any field, and launch — or ask Donny to regenerate for fresh options.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Paste a link to your website or menu and Donny will tailor the ideas to what you actually sell.</li>
  <li>Tell Donny the occasion (a holiday, a game day, a slow weeknight) for more targeted concepts.</li>
  <li>You can always edit a generated brief before it goes live — treat it as a strong first draft.</li>
</ul>
$body$,
  search_terms = ARRAY['donny','campaign ideas','suggestions','generate','brief','wildcard','inspiration']
WHERE slug = 'donny-campaign-suggestions';

-- ── Donny AI: donny-match-scores ──────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>A match score rates how well a creator fits a specific campaign, so you can spot the strongest candidates fast. Higher means a better fit. It is a guide, not a gate — you always make the final call.</p>

<h3>What the score weighs</h3>
<ul>
  <li><strong>Location</strong> — how close the creator is to your business (nearest creators score higher, but distance never rules anyone out entirely).</li>
  <li><strong>Niche & content fit</strong> — how well the creator's skills and content match your campaign.</li>
  <li><strong>Track record</strong> — ratings and past campaign performance on DragonCandy.</li>
  <li><strong>Profile completeness</strong> — creators with complete, linked profiles score higher.</li>
</ul>

<h3>Tips</h3>
<ul>
  <li><strong>Creators:</strong> completing your profile, linking your socials, and earning good ratings all raise your scores.</li>
  <li><strong>Businesses:</strong> use "Find creators near me" or ask Donny to surface your best-fit creators first.</li>
  <li>Scores refresh as profiles, ratings, and locations change.</li>
</ul>
$body$,
  search_terms = ARRAY['match score','matching','fit','creator','algorithm','location','ranking']
WHERE slug = 'donny-match-scores';

-- ── Campaigns: launch-campaign ────────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Launching a campaign is how you connect with creators who will promote your business. The fastest path is to let Donny draft it for you, then review and publish.</p>

<ol>
  <li>Open Donny and describe your campaign (or paste your website/menu link) — Donny drafts the title, brief, budget guidance, and recommended platforms.</li>
  <li>Prefer to build it yourself? Start a new campaign from your dashboard and fill in the brief, budget, and deliverables.</li>
  <li>Review the details — a clear single deliverable (e.g. "one 60-second Reel") attracts more applicants than a vague brief.</li>
  <li>Set your dates and any location or audience requirements.</li>
  <li>Publish — your campaign goes live to the creator marketplace within minutes.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Set your budget before launch — you can raise it later, but lowering it after applications arrive is disruptive.</li>
  <li>Want it private? Post to a <strong>crew</strong> instead so only your invited creators see it (see "Creator crews & private campaigns").</li>
  <li>Need content fast? Use the DragonDash option for rush delivery.</li>
</ul>
$body$,
  search_terms = ARRAY['launch','campaign','create','publish','brief','donny','budget','deliverable']
WHERE slug = 'launch-campaign';

-- ── Campaigns: apply-campaign ─────────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>As a creator, applying to campaigns is how you earn on DragonCandy. Each campaign shows a match score against your profile so you can spot the best fits quickly.</p>

<ol>
  <li>Open the <strong>Campaigns</strong> marketplace and browse available campaigns — your match score appears on each card.</li>
  <li>Tap a card to read the full brief, budget, and deliverables.</li>
  <li>Tap <strong>Apply</strong> and add a short note on why you're a great fit.</li>
  <li>You'll get a notification when the business responds.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Focus on campaigns where your match score is high — acceptance rates are much better.</li>
  <li>A short personal note lifts your odds, even on lower-scoring campaigns.</li>
  <li>If a business adds you to a <strong>crew</strong>, its crew campaigns are free to apply to with a single tap — no payment step (see "Joining a crew").</li>
</ul>
$body$,
  search_terms = ARRAY['apply','campaign','creator','pitch','match score','crew','marketplace']
WHERE slug = 'apply-campaign';

-- Stamp every refreshed row so the help center shows a genuine refresh date
-- (not the stale 2026-05-12 insert date). If any UPDATE above used a wrong slug it
-- silently matches 0 rows — the Task 7 Step 3 slug + content checks catch that.
UPDATE help_articles SET updated_at = now()
WHERE slug IN (
  'what-is-donny','donny-help-briefs','donny-campaign-suggestions',
  'donny-match-scores','launch-campaign','apply-campaign'
);

-- ── New articles (2026-07) ────────────────────────────────────────────────
INSERT INTO public.help_articles (slug, title, body, category, roles, search_terms) VALUES

('creator-crews', 'Creator crews & private campaigns', $body$
<p>A <strong>crew</strong> is your private roster of creators. Post a campaign to a crew and only its members can see it — and they can apply with one tap and no payment. It's the easy way to run repeat, ambassador-style collaborations with creators you trust.</p>

<ol>
  <li>Open <strong>Crews</strong> from your dashboard menu and create a crew (give it a name like "Regulars" or "Summer ambassadors").</li>
  <li>Invite creators to the crew. Each creator gets an invite and joins once they accept — membership is opt-in on both sides.</li>
  <li>Create a campaign and scope it to your crew. Crew campaigns are <strong>free</strong>, so members can apply with a single tap.</li>
  <li>Only active crew members see the campaign — it's never shown in the public marketplace or emailed to other creators.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Crews are for organic, ambassador-style collaborations. Your paid marketplace campaigns work exactly as before.</li>
  <li>Build a crew from creators who've already done great work for you, so re-collaborating is one tap away.</li>
  <li>You can remove a member or invite more at any time from the crew's page.</li>
</ul>
$body$, 'campaigns', ARRAY['restaurant']::text[], ARRAY['crew','crews','creator group','private campaign','ambassador','roster','invite creators']),

('creator-crews-creator', 'Joining a crew & applying', $body$
<p>When a business you've worked with adds you to their <strong>crew</strong>, you get early, exclusive access to their private campaigns — and applying is free and instant.</p>

<ol>
  <li>You'll receive an invitation to join a business's crew. Accept it to become a member.</li>
  <li>The business's crew campaigns appear for you in the campaign marketplace's Crews area.</li>
  <li>Because crew campaigns are free, you apply with a single tap — there's no payment step.</li>
  <li>From there it works like any collaboration — create the content and submit it for review. Crew campaigns are free, ambassador-style collaborations, so there's no payout for crew work; your regular paid campaigns still pay out the usual way.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Being in a crew is a sign a business likes your work — it's a great source of repeat collaborations.</li>
  <li>You choose whether to join — accepting an invite is always your call, and you can decline.</li>
  <li>You'll be notified when a crew you're in posts something new.</li>
</ul>
$body$, 'campaigns', ARRAY['creator']::text[], ARRAY['crew','crews','join crew','invite','private campaign','one tap','apply']),

('dragon-feed', 'Discovering creators with Dragon Feed', $body$
<p><strong>Dragon Feed</strong> is a scrollable wall of creators' portfolio content — a fast way to discover creators and see the kind of work they make. Open it from <strong>Dragon Feed</strong> in your dashboard menu.</p>

<ol>
  <li>Scroll the feed to browse creator content. On phones it's a single-column, full-screen feed; on desktop it's a grid.</li>
  <li>Tap any post to open it full-screen, where you can like it or message the creator.</li>
  <li>Tap a creator's name or avatar to open their full profile and portfolio.</li>
  <li>Use the search box to find creators by name, or by location — type a ZIP or city and pick a distance (10, 25, 50, 100 miles, or Any) to see creators near a place.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Searching by name works everywhere — you'll find a creator no matter where they're based.</li>
  <li>Add a location to narrow the results to creators near you or near a market you care about.</li>
  <li>Found someone great? Open their profile to invite them to a campaign.</li>
</ul>
$body$, 'dragonshare', ARRAY['restaurant','creator']::text[], ARRAY['dragon feed','feed','discover','browse creators','search','zip','radius','portfolio']),

('find-creators-near-me', 'Finding creators near you', $body$
<p>On the Browse Creators page you can filter creators by location and distance, so you can find people who can actually visit your business.</p>

<ol>
  <li>Open <strong>Browse Creators</strong>. By default it shows creators near your saved business location.</li>
  <li>Use the location control to search another area — type a city or ZIP.</li>
  <li>Pick a radius: 10, 25, 50, 100 miles, or "Any" to drop the distance filter.</li>
  <li>Sort by "Nearest first" to put the closest creators at the top — each card shows how many miles away they are.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>If your near-me search looks empty, widen the radius (or choose "Any") to see more creators.</li>
  <li>Make sure your business location is set in your profile so the default "near me" search is accurate.</li>
  <li>You can also just ask Donny — "find creators near me" — for a ranked list with distances.</li>
</ul>
$body$, 'campaigns', ARRAY['restaurant']::text[], ARRAY['find creators','near me','location','radius','distance','browse creators','nearby']),

('dragon-rewards', 'DC Points & Creator Standing', $body$
<p>DragonCandy rewards active members with <strong>DC Points</strong>. As you use the platform, you earn points and climb a standing ladder — a simple signal of how active and trusted you are.</p>

<h3>How you earn points</h3>
<ul>
  <li>Sharing content and getting it boosted through DragonShare.</li>
  <li>Completing campaigns and collaborations.</li>
  <li>Keeping a complete, up-to-date profile.</li>
  <li>Earning strong ratings on your work.</li>
</ul>

<h3>Your standing</h3>
<p>Your points and activity move you up a five-step ladder: <strong>Rising → Established → Pro → Elite → Icon</strong>. Your current standing shows on your dashboard, and your tier badge appears on your public profile so businesses and creators can see it at a glance.</p>

<h3>Tips</h3>
<ul>
  <li>Standing reflects real activity — completing work and keeping a strong profile is the way up.</li>
  <li>Your points balance is private to you; only your tier badge is shown publicly.</li>
  <li>Keep your profile complete and your ratings high to climb faster.</li>
</ul>
$body$, 'rewards', ARRAY['restaurant','creator']::text[], ARRAY['dc points','points','rewards','creator standing','tier','badge','rising','icon','reputation'])
ON CONFLICT (slug) DO NOTHING;
