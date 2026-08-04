import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Free-tier default from the take-rate ladder: Free 10% / Starter 7% / Growth 5% / Pro 3% / Enterprise 2%
export const PLATFORM_FEE_RATE = 0.10;

// Creator-storefront package fee. FLAT and decoupled from the business-subscription take-rate ladder:
// the creator absorbs it (list price = gross, creator nets price × (1 − rate)), so the buyer pays exactly
// the listed price regardless of who they are. Package payouts pass this to calculatePlatformFee directly
// and NEVER call getOrgTakeRate. Keep in sync with create_package_order's v_fee_rate (20260804120300).
export const PACKAGE_FEE_RATE = 0.10;

export function calculatePlatformFee(amountDollars: number, rate?: number): {
  feeCents: number;
  netPayoutDollars: number;
  feeDollars: number;
} {
  const effectiveRate = rate ?? PLATFORM_FEE_RATE;
  const feeDollars = amountDollars * effectiveRate;
  return {
    feeCents: Math.round(feeDollars * 100),
    netPayoutDollars: amountDollars - feeDollars,
    feeDollars,
  };
}

export async function getOrgTakeRate(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.org_id) return PLATFORM_FEE_RATE;

  const { data: org } = await supabase
    .from("organizations")
    .select("take_rate")
    .eq("id", profile.org_id)
    .maybeSingle();

  return org?.take_rate ?? PLATFORM_FEE_RATE;
}
