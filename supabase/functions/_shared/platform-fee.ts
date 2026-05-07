import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PLATFORM_FEE_RATE = 0.05;

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

  if (!profile?.org_id) return 0.10;

  const { data: org } = await supabase
    .from("organizations")
    .select("take_rate")
    .eq("id", profile.org_id)
    .maybeSingle();

  return org?.take_rate ?? 0.10;
}
