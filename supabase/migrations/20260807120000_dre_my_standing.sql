-- Caller-scoped standing for the DC Points page and Donny's rewards agent.
-- Wraps the service-role-only dre_user_aggregates so the page, Donny, and the
-- award engine can never disagree about a user's tier. Takes no arguments:
-- identity comes from auth.uid(), so there is no parameter to point elsewhere.
create or replace function public.dre_my_standing()
returns table (
  role text,
  balance int,
  tier text,
  campaigns_completed int,
  avg_rating numeric,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden: authentication required';
  end if;

  return query
    select a.role,
           a.balance,
           coalesce(b.tier, 'egg'),
           a.campaigns_completed,
           a.avg_rating,
           a.last_activity_at
    from public.dre_user_aggregates(array[auth.uid()]) a
    left join public.dragon_point_balances b on b.user_id = auth.uid();
end;
$$;

-- Supabase grants EXECUTE to anon/authenticated via ALTER DEFAULT PRIVILEGES,
-- so `revoke from public` alone does NOT lock this down. anon must go explicitly.
revoke all on function public.dre_my_standing() from public, anon;
grant execute on function public.dre_my_standing() to authenticated;
