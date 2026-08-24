-- Social login support: OAuth users must not be asked to verify an email that
-- will never be sent, and must not all silently become content creators.
--
-- Two objects. Neither drops nor renames anything.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. handle_new_user — mirror verification for OAUTH PROVIDERS ONLY
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `profiles.email_verified` defaults false and this trigger never set it, while
-- `AuthPage` gates every login on it. An OAuth user would therefore be told to
-- verify an email nothing ever sends: this app runs its OWN verification
-- (`send-verification-email` -> `email_verification_tokens` -> `verify-email`,
-- which is the only writer of `email_verified = true`), and that flow fires only
-- from the password signup path.
--
-- THE OBVIOUS FIX IS WRONG, AND MEASURABLY SO. Mirroring `email_confirmed_at`
-- would auto-verify every PASSWORD signup too, silently switching off the app's
-- own email gate for everyone, because Supabase's built-in confirmation is
-- disabled on this project. Measured on prod 2026-08-24: 45 of 45 users have
-- `email_confirmed_at` set, 44 of them within ONE SECOND of `created_at`
-- (minimum gap 6ms) — GoTrue stamps it during signup, not on a click. So
-- `email_confirmed_at IS NOT NULL` does not mean "this person proved they own
-- this address"; on this project it means almost nothing at all.
--
-- What DOES mean it is the provider. When Google or Apple hands us an account, a
-- third party has already verified the address and no verification mail is
-- coming, so the app's gate has nothing left to wait for.
--
-- Deliberately an ALLOWLIST rather than `<> 'email'`. A provider nobody planned
-- for — a future SAML tenant, a phone signup, a magic link — would otherwise
-- silently inherit "verified" from a match this file never considered. Adding a
-- provider here is a decision someone makes on purpose.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_role text;
  v_name text;
  v_account_type text;
  v_provider text;
  v_email_verified boolean;
BEGIN
  -- Internal-only account (AIOS stakeholder): create no consumer profile rows.
  IF NEW.raw_user_meta_data->>'account_scope' = 'internal' THEN
    RETURN NEW;
  END IF;

  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'content_creator');
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

  -- The identity provider that created this account. GoTrue sets it in the same
  -- INSERT, so it is readable here.
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  v_email_verified := v_provider IN ('google', 'apple', 'facebook');

  INSERT INTO public.profiles (id, email, role, full_name, email_verified)
  VALUES (NEW.id, NEW.email, v_role::user_role, v_name, v_email_verified)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        -- Never downgrade a verification that already happened. This branch
        -- exists for re-provisioning, and a `false` from a later insert must not
        -- erase a true someone earned by clicking a link.
        email_verified = public.profiles.email_verified OR EXCLUDED.email_verified;

  IF v_role IN ('business_client', 'brand') THEN
    v_account_type := CASE WHEN v_role = 'brand' THEN 'brand' ELSE 'restaurant' END;
    INSERT INTO public.business_profiles (user_id, business_name, account_type)
    VALUES (NEW.id, v_name, v_account_type)
    ON CONFLICT (user_id) DO UPDATE
      SET business_name = EXCLUDED.business_name,
          account_type = EXCLUDED.account_type;
  ELSIF v_role = 'content_creator' THEN
    INSERT INTO public.creator_profiles (user_id, creator_name)
    VALUES (NEW.id, v_name)
    ON CONFLICT (user_id) DO UPDATE
      SET creator_name = EXCLUDED.creator_name;
  END IF;

  -- Synthetic Weight Engine: auto-register bot accounts (email is the source of truth).
  IF NEW.email LIKE '%@synthetic.dragoncandy.test' THEN
    INSERT INTO public.synthetic_users (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. claim_initial_role — the role an OAuth user chose, applied once
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `signInWithOAuth` cannot carry user metadata, so the trigger above has nothing
-- to read and falls back to `content_creator` for EVERY social signup. On a
-- three-role marketplace that files every business and every brand as a creator.
-- The client cannot correct it afterwards either: `authenticated` holds INSERT on
-- `profiles.role` but NOT UPDATE (migration 20260824100000), by design.
--
-- So the correction is a definer RPC carrying its authorization in the body.
--
-- Identity comes from `auth.uid()` and there is NO id parameter, so there is
-- nothing to point at another account.
--
-- ONE SHOT, and the conditions state what "still initial" means rather than
-- trusting a timestamp: nothing completed, and no organization yet. Claiming
-- `business_client` or `brand` provisions an org through `trg_auto_create_org`,
-- so the org check is what makes a second claim impossible — deliberately,
-- because a second claim would leave org rows describing an account type the
-- user no longer has. Someone who picks wrong needs a human, which is
-- recoverable; a half-switched account is not.
--
-- This is NOT a privilege-escalation surface. Password signup already lets the
-- client choose `role` freely in `options.data`, because role here is a declared
-- ACCOUNT TYPE, not a permission — real authorization lives in `user_roles` and
-- `has_role()`, which this function never touches.
create or replace function public.claim_initial_role(p_role user_role)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_account_type text;
  v_created_at timestamptz;
  v_provider text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden: authentication required';
  END IF;

  -- "Nothing completed and no organization" is NOT sufficient on its own, and the
  -- gap is a real one: an account that signed up by password weeks ago and never
  -- finished onboarding matches both conditions. If that person later presses
  -- "Sign up with Google" with the same address, Supabase signs them INTO the
  -- existing account rather than creating a new one — and without the two checks
  -- below this function would happily convert their creator account to a business
  -- and provision an organization they never asked for.
  --
  -- Two independent conditions, because either alone is defeatable:
  --
  -- AGE. A claim runs on the OAuth redirect return, seconds after the account is
  -- created. Fifteen minutes is generous for a slow consent flow and excludes
  -- every account that existed before this sign-in.
  --
  -- PROVIDER. `raw_app_meta_data->>'provider'` records the identity that CREATED
  -- the account and does not change when another identity is later linked — so a
  -- password account that just linked Google still reads 'email' here and is
  -- refused, which is exactly the case age alone would let through if someone
  -- signed up and linked within the window.
  SELECT u.created_at, COALESCE(u.raw_app_meta_data->>'provider', 'email')
    INTO v_created_at, v_provider
    FROM auth.users u WHERE u.id = v_uid;

  IF v_provider NOT IN ('google', 'apple', 'facebook') THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_an_oauth_account');
  END IF;

  IF v_created_at IS NULL OR v_created_at < now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'account_not_new');
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    -- No profile row at all. handle_new_user should have made one; refusing is
    -- honest, and the caller treats every refusal as "keep the default".
    RETURN jsonb_build_object('claimed', false, 'reason', 'no_profile');
  END IF;

  IF EXISTS (SELECT 1 FROM public.creator_profiles WHERE user_id = v_uid AND is_completed)
     OR EXISTS (SELECT 1 FROM public.business_profiles WHERE user_id = v_uid AND is_completed)
  THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'onboarding_complete');
  END IF;

  IF EXISTS (SELECT 1 FROM public.org_members WHERE user_id = v_uid) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'organization_exists');
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = v_uid;

  v_name := COALESCE(NULLIF(btrim(v_name), ''), 'New account');

  IF p_role IN ('business_client', 'brand') THEN
    v_account_type := CASE WHEN p_role = 'brand' THEN 'brand' ELSE 'restaurant' END;
    INSERT INTO public.business_profiles (user_id, business_name, account_type)
    VALUES (v_uid, v_name, v_account_type)
    ON CONFLICT (user_id) DO UPDATE SET account_type = EXCLUDED.account_type;

    -- The creator row handle_new_user made for the default role stays (nothing is
    -- ever dropped here) but must not be publicly listed:
    -- `creator_profiles.profile_visibility` DEFAULTS TO 'public', so a business
    -- account would otherwise show up in Find Creators as an empty creator.
    UPDATE public.creator_profiles
       SET profile_visibility = 'private'
     WHERE user_id = v_uid AND is_completed IS NOT TRUE;
  ELSE
    INSERT INTO public.creator_profiles (user_id, creator_name)
    VALUES (v_uid, v_name)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('claimed', true, 'role', p_role);
END;
$$;

revoke execute on function public.claim_initial_role(user_role) from public, anon;
grant execute on function public.claim_initial_role(user_role) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sync_oauth_email_verification — the account the trigger never sees
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `handle_new_user` is an INSERT trigger, so it only ever runs for accounts OAuth
-- creates. It does not run for the other realistic path: someone signed up by
-- password, never clicked the verification link, and later signs in with Google
-- using the same address. Supabase links the provider identity to the EXISTING
-- `auth.users` row, no INSERT happens, `profiles.email_verified` stays false, and
-- `AuthPage` rejects a sign-in a provider just authenticated.
--
-- The mirror of the `claim_initial_role` gap, and found the same way: an existing
-- account is invisible to a trigger that only fires on creation.
--
-- The fact this trusts is `auth.identities`. A row there with an allowlisted
-- provider means that provider authenticated this address for this account — it
-- is written by GoTrue, is not client-writable, and a password-only account has
-- an `email` identity and nothing else. So this cannot be used by someone who has
-- never completed an OAuth flow, which is the whole property that matters.
--
-- One direction only: it can set `email_verified` true, never false. Nothing here
-- can un-verify an account.
create or replace function public.sync_oauth_email_verification()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_oauth boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden: authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.identities i
     WHERE i.user_id = v_uid
       AND i.provider IN ('google', 'apple', 'facebook')
  ) INTO v_has_oauth;

  IF NOT v_has_oauth THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
     SET email_verified = true
   WHERE id = v_uid AND email_verified IS DISTINCT FROM true;

  RETURN true;
END;
$$;

revoke execute on function public.sync_oauth_email_verification() from public, anon;
grant execute on function public.sync_oauth_email_verification() to authenticated;
