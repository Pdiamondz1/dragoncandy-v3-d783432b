/**
 * Pure notification map for crew activity events.
 *
 * The `record_crew_activity` RPC returns *facts* about a crew lifecycle event; this
 * module maps those facts to the `create-notification` payloads that should fire —
 * but ONLY the genuinely-new ones.
 *
 * De-dup rule (Task 0 verified): the standard lifecycle already bells (and, where
 * high-signal, emails) most recipients, and `create-notification` ALWAYS inserts a
 * bell and only *conditionally* emails (there is no email-only mode). So firing a
 * payload for an already-belled recipient would DOUBLE-BELL. Therefore this map
 * returns a payload only for the ONE genuine gap:
 *
 *   content_submitted → notify the campaign OWNER (nobody is notified today when a
 *   crew creator submits content for review).
 *
 * Every other event returns [] (the crew_activity row is still written by the caller;
 * the standard path handles the notification). Crew campaigns are FREE — there is no
 * `paid` event.
 *
 * Pure: no I/O, no side effects.
 */

export type CrewEventType =
  | 'campaign_posted'
  | 'application_received'
  | 'hired'
  | 'content_submitted'
  | 'content_approved'
  | 'revision_requested'
  | 'completed';

/** The facts returned by the `record_crew_activity` RPC. */
export interface CrewActivityFacts {
  id: string;
  group_id: string;
  owner_id: string;
  participant_id: string | null;
  event_type: CrewEventType;
  campaign_id: string;
  campaign_title: string | null;
  creator_name: string | null;
}

/** Body shape accepted by the `create-notification` edge function. */
export interface NotificationPayload {
  recipientId: string;
  type: string;
  category: string;
  title: string;
  body: string;
  actionUrl: string;
  actorId?: string;
  icon?: string;
  data?: Record<string, unknown>;
  /** Extra fields merged into the email template payload (create-notification). */
  emailData?: Record<string, unknown>;
}

/**
 * Map crew activity facts to the genuinely-new `create-notification` payloads.
 * Returns [] for every event whose recipient the standard lifecycle already bells.
 */
export function crewActivityNotifications(facts: CrewActivityFacts): NotificationPayload[] {
  switch (facts.event_type) {
    case 'content_submitted':
      // The one real gap: no owner notification fires today on Submit-for-Review.
      // Category `campaigns` (not `content`) so the high-signal owner email actually
      // sends by default — `content` defaults email off. Sibling pipeline events
      // (application_received / hired) live in `campaigns` too. Opt-out-able via the
      // owner's campaigns-email preference. `crew_content_submitted` template.
      return [
        {
          recipientId: facts.owner_id,
          type: 'content_submitted',
          category: 'campaigns',
          title: 'New content submitted',
          body: `${facts.creator_name ?? 'A creator'} submitted content for "${
            facts.campaign_title ?? 'a campaign'
          }"`,
          actionUrl: `/dashboard/business/campaigns/${facts.campaign_id}`,
          icon: 'content',
          data: { campaign_id: facts.campaign_id },
          emailData: {
            creatorName: facts.creator_name ?? 'A creator',
            campaignTitle: facts.campaign_title ?? 'your campaign',
          },
        },
      ];

    // Row only — the standard lifecycle already bells (+ emails where high-signal)
    // these recipients; firing again would double-bell.
    case 'campaign_posted': // v1 group_campaign_posted bell already sent
    case 'application_received': // owner already belled+emailed (new_application)
    case 'hired': // creator already belled+emailed (application_accepted)
    case 'content_approved': // creator already belled
    case 'revision_requested': // creator already belled
    case 'completed': // owner + creator already belled+emailed (project_completed)
      return [];

    default:
      return [];
  }
}
