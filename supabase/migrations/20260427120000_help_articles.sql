-- help_articles: DB-backed FAQ content
create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  body text not null,
  category text not null check (category in ('getting_started','campaigns','dragonshare','billing','account')),
  roles text[] not null default '{restaurant,creator,brand}',
  search_terms text[] default '{}',
  updated_at timestamptz not null default now()
);

create index idx_help_articles_category on public.help_articles (category);
create index idx_help_articles_slug on public.help_articles (slug);

alter table public.help_articles enable row level security;

create policy "Anyone can read help articles"
  on public.help_articles for select using (true);

create policy "Service role manages help articles"
  on public.help_articles for all using (auth.role() = 'service_role');

-- help_article_feedback
create table if not exists public.help_article_feedback (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.help_articles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  helpful boolean not null,
  created_at timestamptz not null default now()
);

alter table public.help_article_feedback enable row level security;

create policy "Users can insert feedback"
  on public.help_article_feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can read own feedback"
  on public.help_article_feedback for select
  using (auth.uid() = user_id);

-- Seed 18 articles
insert into public.help_articles (slug, title, body, category, roles, search_terms) values
-- Getting Started (4)
('signup-restaurant', 'How to sign up as a restaurant', 'Create your account at dragoncandy.io and select "Restaurant" as your role. You''ll be guided through adding your business name, location, and connecting your menu. Donny will help you create your first campaign in under 60 seconds.', 'getting_started', '{restaurant}', '{signup,register,restaurant,business,account}'),
('signup-creator', 'How to sign up as a creator', 'Head to dragoncandy.io and select "Creator" as your role. Add your social platforms, niche, and a portfolio link. Complete your profile to appear in brand searches and get matched to campaigns.', 'getting_started', '{creator}', '{signup,register,creator,account,profile}'),
('signup-brand', 'How to sign up as a brand', 'Visit dragoncandy.io and select "Brand" as your role. Add your brand name, product categories, and team members. You''ll get instant access to creator discovery, campaign tools, and DragonShare.', 'getting_started', '{brand}', '{signup,register,brand,account}'),
('complete-profile', 'Completing your profile', 'A complete profile gets you more visibility. Add a professional photo, write a clear bio, list your platforms and niches, and upload portfolio samples. The profile completion bar shows what''s left.', 'getting_started', '{restaurant,creator,brand}', '{profile,complete,setup,onboarding}'),

-- Campaigns (5)
('launch-campaign', 'How to launch a campaign', 'Tap the "+" button or use the Brief Generator. Describe what you need, set your budget range, choose a platform, and publish. Creators will see your campaign in their marketplace within minutes.', 'campaigns', '{restaurant,brand}', '{campaign,create,launch,publish,brief}'),
('apply-campaign', 'How to apply to a campaign (creator)', 'Browse campaigns in your marketplace. Tap any card to see the full brief. Hit "Apply with Donny" — Donny pre-fills your pitch based on your profile and the campaign requirements. One tap, done.', 'campaigns', '{creator}', '{apply,campaign,pitch,donny,one-tap}'),
('what-is-dragondash', 'What is DragonDash?', 'DragonDash is our express delivery tier. Campaigns marked "DragonDash" need content within 48 hours. They pay a premium rate. Perfect for creators who work fast and brands who need content urgently.', 'campaigns', '{restaurant,creator,brand}', '{dragondash,express,fast,delivery,48h}'),
('match-score', 'What is match score?', 'Match score (0-100) measures how well a creator fits a specific campaign. It''s calculated from platform overlap, niche alignment, engagement rate, location proximity, and past performance. Higher score = better fit.', 'campaigns', '{restaurant,creator,brand}', '{match,score,algorithm,fit,compatibility}'),
('approve-content', 'Approving content submissions', 'When a creator submits content, you''ll see it in your campaign''s collaboration tab. Review it, then tap Approve or Request Revision with specific feedback. Approved content triggers payment release.', 'campaigns', '{restaurant,brand}', '{approve,content,review,revision,submit}'),

-- DragonShare (4)
('dragonshare-creator', 'How DragonShare works (creator)', 'Step 1: Post about a brand you love on any platform — like you already do. Step 2: Paste the link in DragonShare. Donny identifies the brand and routes it. Step 3: If the brand boosts your post, you get 80% of the boost amount via Stripe. No negotiation needed.', 'dragonshare', '{creator}', '{dragonshare,boost,earn,organic,post,creator}'),
('dragonshare-brand', 'How DragonShare works (brand)', 'Step 1: Creators post about you organically. We catch those posts. Step 2: Verified posts land in your DragonShare inbox with Donny''s recommended boost amount. Step 3: Pick a tier ($25/$50/$100/$250). The creator gets 80% via Stripe. You get a happy creator and authentic content.', 'dragonshare', '{brand,restaurant}', '{dragonshare,boost,brand,inbox,tier}'),
('good-boost-amount', 'What''s a good boost amount?', 'It depends on reach. Donny recommends a tier based on the creator''s follower count, engagement rate, and post quality. $25 for micro-creators (under 5K followers), $50-100 for mid-tier, $250 for high-reach posts. You always choose the final amount.', 'dragonshare', '{brand,restaurant}', '{boost,amount,tier,how much,price}'),
('creator-payment-timing', 'When do creators get paid?', 'Creators receive boost payments within 2-3 business days of a brand approving the boost. Payments go directly to your connected Stripe account. You can track pending and completed payments in your earnings dashboard.', 'dragonshare', '{creator}', '{payment,when,timing,stripe,payout,earnings}'),

-- Billing (3)
('pricing-tiers', 'Pricing tiers explained', 'DragonCandy offers Free, Pro ($29/mo), and Enterprise ($99/mo) tiers. Free includes 1 active campaign and basic Donny tools. Pro adds unlimited campaigns, priority matching, and analytics. Enterprise adds team seats, API access, and dedicated support.', 'billing', '{restaurant,brand}', '{pricing,tiers,plans,cost,free,pro,enterprise}'),
('upgrade-downgrade', 'Upgrading and downgrading your plan', 'Go to Settings → Billing. Upgrades take effect immediately and you''re charged the prorated difference. Downgrades take effect at your next billing cycle. You won''t lose data, but some features will become read-only.', 'billing', '{restaurant,brand}', '{upgrade,downgrade,change plan,billing}'),
('refunds', 'Refunds and cancellations', 'You can cancel anytime from Settings → Billing. Your plan stays active until the end of the current billing period. Refunds are available within 14 days of a charge if you haven''t used premium features during that period. Contact support@dragoncandy.io.', 'billing', '{restaurant,brand}', '{refund,cancel,cancellation,money back}'),

-- Account (3)
('delete-account', 'Deleting your account', 'Go to Settings → Danger Zone → Delete Account. This removes your profile, campaigns, and messages after a 7-day grace period. Active collaborations must be completed or cancelled first. This action is irreversible after the grace period.', 'account', '{restaurant,creator,brand}', '{delete,account,remove,close}'),
('gdpr-erasure', 'GDPR data erasure', 'EU users can request full data erasure under GDPR Article 17. Go to Settings → Privacy → Request Erasure. We''ll delete all personal data within 30 days and send confirmation. Some anonymized analytics data may be retained.', 'account', '{restaurant,creator,brand}', '{gdpr,erasure,privacy,data,delete,eu}'),
('team-roles', 'Team roles explained', 'Owner: full control including billing and danger zone. Admin: manages campaigns, creators, and team members but cannot delete the org. Member: can view and collaborate but cannot change settings. Viewer: read-only access to dashboards and reports.', 'account', '{restaurant,brand}', '{team,roles,permissions,owner,admin,member}')
on conflict (slug) do nothing;
