-- Rewrite the DC Points help article with the real catalog and thresholds.
-- Donny's guidance_agent full-text searches this table, so this also improves
-- his answers. Earn-only: nothing here promises a perk or redemption.
update public.help_articles
set title = 'DC Points & Creator Standing',
    body = $body$
<p>You earn <strong>DC Points</strong> for real activity on DragonCandy. Your balance and full history are on your <a href="/rewards">DC Points page</a>, which also lists every way to earn.</p>

<h3>How creators earn</h3>
<ul>
  <li>Complete your creator profile — 250</li>
  <li>Link your first social account — 150</li>
  <li>Apply to your first campaign — 200</li>
  <li>Submit a DragonShare post — 75 each time</li>
  <li>First DragonShare post bonus — 225</li>
  <li>Complete your first campaign — 1,000</li>
  <li>Receive your first boost payout — 400</li>
  <li>Earn a 5-star review — 250 each time</li>
  <li>Campaign milestones — 1,000 at 3, 3,000 at 10, 5,000 at 25, 10,000 at 50</li>
</ul>

<h3>How businesses earn</h3>
<ul>
  <li>Complete your business profile — 200</li>
  <li>Link your first social account — 200</li>
  <li>Create your first campaign — 500</li>
  <li>Launch a campaign — 150 each time</li>
  <li>Complete your first campaign — 1,000</li>
  <li>Boost a creator post — 300 each time</li>
  <li>First boost bonus — 50</li>
  <li>Rate a creator — 100 each time</li>
  <li>Give a 5-star rating — 100 each time</li>
  <li>Campaign milestones — 1,500 at 5, 3,000 at 10, 5,000 at 25, 10,000 at 50</li>
</ul>

<h3>Standing</h3>
<p>Standing goes <strong>Rising → Established → Pro → Elite → Icon</strong>. A tier needs <em>both</em> a points total and real activity — points alone never move you up.</p>
<ul>
  <li><strong>Established</strong> — 500 points and 3 completed campaigns</li>
  <li><strong>Pro</strong> — 2,500 points and 10 completed campaigns (creators also need a 4.5 average rating)</li>
  <li><strong>Elite</strong> — 10,000 points and 50 completed campaigns (creators also need a 4.8 average rating)</li>
  <li><strong>Icon</strong> — 50,000 points</li>
</ul>

<h3>What standing does</h3>
<p>Your standing badge is shown publicly on your profile so businesses and creators can see how active you are. Your points balance is private to you. DC Points do not convert to money, credit, or discounts.</p>
$body$,
    search_terms = ARRAY['dc points','points','rewards','creator standing','tier','badge','rising','established','pro','elite','icon','how to earn points']::text[],
    updated_at = now()
where slug = 'dragon-rewards';
