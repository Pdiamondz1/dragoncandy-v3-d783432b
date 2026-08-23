import { supabase } from '@/integrations/supabase/client';

/**
 * Best-effort call to the `verify-address` edge function after a location/profile save
 * has already written the plain address fields (city/country/postal_code, or an
 * org_unit's address string) through the normal client path.
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
  postalCode: string | null | undefined;
}): Promise<void> {
  const city = input.city?.trim();
  const country = input.country?.trim();
  if (!city || !country) return;

  try {
    const { error } = await supabase.functions.invoke('verify-address', {
      body: { role: 'creator', city, country, postalCode: input.postalCode?.trim() || undefined },
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
  const address = input.address?.trim();
  if (!address) return;

  try {
    const { error } = await supabase.functions.invoke('verify-address', {
      body: { role: 'business', orgUnitId: input.orgUnitId, address },
    });
    if (error) console.error('requestBusinessAddressVerification: verify-address failed', error);
  } catch (error) {
    console.error('requestBusinessAddressVerification: verify-address threw', error);
  }
}
