import type { PushNotification } from '@/types/notifications';

export function getNotificationRoute(notification: PushNotification): string | null {
  if (notification.action_url) return notification.action_url;

  const data = notification.data as Record<string, unknown> | null;

  switch (notification.type) {
    case 'sponsorship_proposal':
      return data?.campaign_id
        ? `/dashboard/business/campaigns/${data.campaign_id}`
        : '/dashboard/business/campaigns';

    case 'sponsorship_accepted':
    case 'sponsorship_rejected':
      return '/dashboard/brand/sponsorships';

    case 'application_received':
      return data?.campaign_id
        ? `/dashboard/business/campaigns/${data.campaign_id}`
        : null;

    case 'application_accepted':
    case 'application_rejected':
      return '/dashboard/creator/my-campaigns?tab=applied';

    case 'content_liked':
      return '/dashboard/creator/dragon-feed';

    case 'campaign_invitation':
      return data?.campaign_id
        ? `/dashboard/creator/campaigns/${data.campaign_id}?invited=true`
        : null;

    case 'message_received':
      if (data?.conversation_id) return `/dashboard/messages/${data.conversation_id}`;
      if (data?.campaign_id) return `/messages/${data.campaign_id}`;
      return null;

    case 'counter_offer_received':
    case 'counter_offer_responded':
      if (!data?.campaign_id) return null;
      return data.sender_role === 'business'
        ? `/dashboard/creator/my-campaigns/${data.campaign_id}`
        : `/dashboard/business/campaigns/${data.campaign_id}`;

    case 'dragonshare_submission':
    case 'dragonshare_boost_receipt':
      return data?.post_id
        ? `/dashboard/business/dragonshare?highlight=${data.post_id}`
        : '/dashboard/business/dragonshare';

    case 'dragonshare_boost':
    case 'dragonshare_declined':
      return data?.post_id
        ? `/dashboard/creator/dragonshare?highlight=${data.post_id}`
        : '/dashboard/creator/dragonshare';

    case 'cgc_submission_received':
    case 'cgc_code_redeemed':
    case 'cgc_promotion_expired':
    case 'cgc_max_redemptions_reached':
      return data?.promotion_id
        ? `/dashboard/business/promotions/${data.promotion_id}`
        : '/dashboard/business/promotions';

    // Awards sent before /rewards existed carry no action_url; this fallback
    // fixes them retroactively (action_url still wins when present).
    case 'dragon_points_award':
      return '/rewards';

    default:
      return null;
  }
}
