import { supabase } from '@/integrations/supabase/client';

/**
 * Securely resolves a user's email + name for notification purposes via a
 * SECURITY DEFINER RPC that verifies the caller has an active relationship
 * (messaging, application, collaboration, sponsorship, org membership) with
 * the target. Direct SELECT on profiles.email is no longer permitted.
 */
export async function fetchRecipientEmail(
  userId: string,
): Promise<{ email: string | null; full_name: string | null } | null> {
  try {
    const { data, error } = await supabase.rpc('get_recipient_email', {
      p_user_id: userId,
    });
    if (error) {
      console.warn('fetchRecipientEmail failed:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { email: row.email ?? null, full_name: row.full_name ?? null };
  } catch (err) {
    console.warn('fetchRecipientEmail threw:', err);
    return null;
  }
}

/**
 * Securely loads financial columns for an org_unit (stripe_account_id,
 * stripe_onboarding_complete, pending_balance). Only org owners/admins are
 * authorized; for other members or on error this returns null.
 */
export async function fetchOrgUnitFinancials(
  unitId: string,
): Promise<{
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  pending_balance: number | null;
} | null> {
  try {
    const { data, error } = await supabase.rpc('get_org_unit_financials', {
      p_unit_id: unitId,
    });
    if (error) {
      // Forbidden / not-owner is expected for non-admin members
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      stripe_account_id: row.stripe_account_id ?? null,
      stripe_onboarding_complete: row.stripe_onboarding_complete ?? null,
      pending_balance: row.pending_balance ?? null,
    };
  } catch {
    return null;
  }
}
