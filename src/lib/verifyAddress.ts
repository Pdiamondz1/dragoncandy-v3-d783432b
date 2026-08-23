import { supabase } from '@/integrations/supabase/client';

/**
 * Best-effort call to the `verify-address` edge function after a location/profile save
 * has already written the plain address fields (city/country/postal_code, or an
 * org_unit's address string) through the normal client path.
 *
 * THE SAVE MUST COMPLETE FIRST. These helpers send no address of their own: the edge
 * function reads the stored row, geocodes what it read, and conditions its write on
 * those same stored values (see supabase/functions/verify-address/storedAddress.ts).
 * Calling before the save lands would verify the OLD address. Every caller today
 * awaits its write and only then fires this — useCreatorProfileSubmit.ts,
 * OnboardingWizard.tsx, useCreateOrgUnit and useUpdateOrgUnit.
 *
 * The `city`/`country`/`address` arguments below are a LOCAL SKIP HEURISTIC ONLY — they
 * are never sent and never decide what gets geocoded. They exist so a save with nothing
 * to verify does not pay for a pointless round trip. Changing one of them cannot change
 * what the server verifies; only changing what is STORED can.
 *
 * Deliberately fire-and-forget from the caller's point of view: address verification is
 * a courtesy signal for the account completeness engine, not a condition of the save
 * succeeding. A geocode failure (rate limit, transient network error, an address Google
 * cannot resolve) must never surface as "your save failed" — it already saved. Errors
 * are logged, never thrown, mirroring the non-fatal pending-balance flush pattern in
 * stripe-webhook's account.updated handler.
 *
 * `address_verified_at` is written server-side only (see
 * supabase/functions/verify-address/index.ts) — this function's job is only to ask the
 * server to attempt it, never to write the stamp itself.
 */

export async function requestCreatorAddressVerification(input: {
  city: string | null | undefined;
  country: string | null | undefined;
}): Promise<void> {
  // Skip heuristic only — see the header. Not sent, and not what the server matches on.
  if (!input.city?.trim() || !input.country?.trim()) return;

  try {
    const { error } = await supabase.functions.invoke('verify-address', {
      body: { role: 'creator' },
    });
    if (error) console.error('requestCreatorAddressVerification: verify-address failed', error);
  } catch (error) {
    console.error('requestCreatorAddressVerification: verify-address threw', error);
  }
}

export async function requestBusinessAddressVerification(input: {
  orgUnitId: string;
  address: string | null | undefined;
}): Promise<void> {
  // `orgUnitId` IS sent — it names which row to act on, and the server re-checks that the
  // caller is an active owner/admin of that unit's org. `address` is the skip heuristic.
  if (!input.address?.trim()) return;

  try {
    const { error } = await supabase.functions.invoke('verify-address', {
      body: { role: 'business', orgUnitId: input.orgUnitId },
    });
    if (error) console.error('requestBusinessAddressVerification: verify-address failed', error);
  } catch (error) {
    console.error('requestBusinessAddressVerification: verify-address threw', error);
  }
}
