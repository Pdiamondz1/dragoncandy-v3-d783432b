-- Seed the DRAGON_REWARDS_ENABLED feature flag, OFF.
-- Gates the consumer Dragon Rewards display (DragonPointsCard on dashboards +
-- DragonTierBadge on public profiles) until the founder launches. The engine/ledger/
-- awarding keep running — only the *display* is gated. feature_flags has a public (anon)
-- SELECT policy, so this gate is anon-safe for the public-profile tier badges (unlike
-- dre_config.go_live_at, which is authenticated-read and gates only the notification bell).
-- Idempotent (WHERE NOT EXISTS — no assumption about a unique constraint on name).

insert into public.feature_flags (name, description, is_enabled)
select
  'DRAGON_REWARDS_ENABLED',
  'Gates the consumer Dragon Rewards display (DragonPointsCard + DragonTierBadge). OFF until founder launch; flip is_enabled=true at go-live (set dre_config.go_live_at for the bell separately).',
  false
where not exists (
  select 1 from public.feature_flags where name = 'DRAGON_REWARDS_ENABLED'
);
