import type { CampaignInvitation } from '@/hooks/useCampaignInvitations';

/**
 * One source of truth for how an invitation is worded and shown to a business
 * owner — shared by the AI-match cards and the All Creators list.
 *
 * Why this copy exists: a published campaign is ALREADY visible to every
 * creator (`usePublicCampaigns` filters only on `status='published'` and
 * `group_id IS NULL`) and was emailed to every onboarded creator at publish
 * time. So the invite is a direct nudge, not an assignment — it confers no
 * priority in the application queue. Owners read the bare word "Invite" as
 * "make this creator do the work", which is why the label names the ask.
 */

/** Names the ask, so the button can't be read as an assignment. */
export const INVITE_LABEL = 'Invite to apply';

/**
 * `send-campaign-invitation` runs campaign lookup → creator lookup → upsert →
 * email → Donny conversation → Donny message serially, so the click takes a
 * few seconds. The button must say so immediately or it reads as broken.
 */
export const INVITE_PENDING_LABEL = 'Sending…';

export const INVITE_EXPLAINER = {
  key: 'campaign_invite',
  title: 'What happens when I invite?',
  body:
    'It sends them a direct heads-up — email, in-app alert, and a message from Donny — ' +
    'about a campaign they can already see. They choose whether to apply. If they do, ' +
    "their application lands with your others and you pick who to hire. Inviting doesn't " +
    'commit you to anything.',
} as const;

export interface InvitationOutcome {
  label: string;
  tone: 'teal' | 'amber' | 'neutral';
  /** The creator applied — the owner's next move is the applications list. */
  actionable: boolean;
}

/**
 * Map an invitation's real status to what the owner sees.
 *
 * Before this, any invited creator rendered a permanent disabled "Invited ✓"
 * with a green check, so someone who DECLINED looked identical to someone who
 * accepted. The status was already being fetched and simply never read.
 *
 * Returns null when there is no invitation, i.e. the invite button should show.
 */
export function describeInvitation(
  status: CampaignInvitation['status'] | undefined,
): InvitationOutcome | null {
  switch (status) {
    case 'pending':
      return { label: 'Invited · waiting', tone: 'amber', actionable: false };
    // A counter-offer is an application with different terms — either way they responded.
    case 'accepted':
    case 'counter_offered':
      return { label: 'Applied — review them', tone: 'teal', actionable: true };
    case 'declined':
      return { label: 'Declined', tone: 'neutral', actionable: false };
    default:
      return null;
  }
}
