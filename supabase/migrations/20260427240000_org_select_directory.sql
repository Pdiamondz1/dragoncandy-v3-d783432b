-- Allow any authenticated user to see non-deleted organizations.
-- Required for DragonShare: creators search for brands/restaurants to tag in posts.
create policy "org_select_directory"
  on organizations for select
  to authenticated
  using (deleted_at is null);
