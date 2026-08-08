/**
 * Thin, best-effort wrapper around the `record_crew_activity` RPC.
 *
 * Crew campaigns are private + FREE. Every crew lifecycle event writes ONE
 * `crew_activity` row via this RPC; the RPC also returns *facts* about the event,
 * which the pure `crewActivityNotifications` map turns into the genuinely-new
 * `create-notification` payloads (today: only `content_submitted → owner`).
 *
 * The RPC no-ops (returns null) for non-crew campaigns, so a call at a shared
 * lifecycle site is inert on the paid/public path. This wrapper NEVER throws into
 * the caller and never blocks the UI — call it fire-and-forget with `void`.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  crewActivityNotifications,
  type CrewActivityFacts,
  type CrewEventType,
} from '@/lib/crews/crewActivityNotifications';
import { dispatchNotifications } from '@/lib/notifications/dispatch';

export async function recordCrewActivity(
  campaignId: string,
  eventType: CrewEventType,
  collaborationId?: string,
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('record_crew_activity', {
      p_campaign_id: campaignId,
      p_event_type: eventType,
      p_collaboration_id: collaborationId ?? undefined,
    });
    // Non-crew campaign (RPC returned null) or an error → best-effort no-op.
    if (error || !data) return;

    const facts = data as unknown as CrewActivityFacts;
    // dispatchNotifications reads the error off the result — invoke resolves
    // rather than rejects on a non-2xx, so the old `.catch()` here was dead
    // code for every 4xx/5xx and a failed owner notification logged nothing.
    await dispatchNotifications(crewActivityNotifications(facts));
  } catch (e) {
    // Never disrupt the lifecycle action that triggered this.
    console.error('recordCrewActivity failed:', e);
  }
}
