import { supabase } from '@/integrations/supabase/client';

/**
 * The single correct way to fire a `create-notification` call from the client.
 *
 * WHY THIS EXISTS: `supabase.functions.invoke` **resolves** with `{ data, error }`
 * on a non-2xx — it does not reject. So the intuitive
 * `invoke(...).catch(console.error)` is dead code for every 4xx/5xx: the failure
 * lands on `error`, nothing is thrown, and the site logs silence. That shape was
 * independently written at four call sites before this helper existed.
 *
 * Never throws — a notification is always best-effort relative to the write that
 * triggered it, and must never fail the mutation that already committed.
 *
 * Takes `object` rather than `Record<string, unknown>` so callers can pass a
 * typed payload built by a helper — a TS `interface` has no implicit index
 * signature and is not assignable to `Record<string, unknown>`.
 *
 * @returns true when the notification was accepted, false on any failure.
 */
export async function dispatchNotification(body: object): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('create-notification', { body });
    if (error) {
      console.error('create-notification failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    // Only reached on a network-level rejection.
    console.error('create-notification threw:', err);
    return false;
  }
}

/**
 * Fan out several notifications concurrently. `Promise.all` is safe here because
 * `dispatchNotification` never rejects.
 */
export async function dispatchNotifications(
  bodies: object[],
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.all(bodies.map((body) => dispatchNotification(body)));
  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent };
}
