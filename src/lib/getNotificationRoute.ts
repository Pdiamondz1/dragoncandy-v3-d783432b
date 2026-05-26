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

    default:
      return null;
  }
}
