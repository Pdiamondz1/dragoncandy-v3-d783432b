import { supabase } from '@/integrations/supabase/client';

/**
 * Fire the creator's in-app bell for a newly-created campaign invitation.
 *
 * `send-campaign-invitation` owns the rich email and the Donny DM, but NOT the bell —
 * that is a separate `create-notification` call, and `create-notification` deliberately
 * sends no email for `campaign_invitation` so the two don't duplicate.
 *
 * This exists because the single-invite path fired it and the bulk path did not, so the
 * same action produced two different outcomes depending on which button you pressed.
 * One function, both callers.
 *
 * Fire-and-forget by design: an invitation that exists but whose bell failed is a far
 * better outcome than surfacing a notification error over a successful invite. Failures
 * are logged, never thrown.
 */
export async function notifyInvitedCreator(params: {
  campaignId: string;
  creatorId: string;
  actorId: string;
  campaignTitle?: string;
}): Promise<void> {
  const { campaignId, creatorId, actorId } = params;

  try {
    let campaignTitle = params.campaignTitle;
    if (!campaignTitle) {
      const { data } = await supabase
        .from('campaigns')
        .select('title')
        .eq('id', campaignId)
        .maybeSingle();
      campaignTitle = data?.title ?? 'a campaign';
    }

    await supabase.functions.invoke('create-notification', {
      body: {
        recipientId: creatorId,
        type: 'campaign_invitation',
        category: 'campaigns',
        title: 'Campaign Invitation',
        body: `You've been invited to "${campaignTitle}"`,
        actionUrl: `/dashboard/creator/campaigns/${campaignId}?invited=true`,
        actorId,
        icon: 'invitation',
        data: { campaign_id: campaignId },
        emailData: { campaignTitle, campaignId },
      },
    });
  } catch (err) {
    console.error('Failed to send invitation notification:', err);
  }
}
