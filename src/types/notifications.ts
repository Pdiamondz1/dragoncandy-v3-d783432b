export type NotificationCategory = 'campaigns' | 'messages' | 'transactions' | 'content' | 'account';

export type NotificationType =
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'campaign_invitation'
  | 'invitation_declined'
  | 'campaign_published'
  | 'revision_requested'
  | 'cgc_submission_received'
  | 'cgc_code_redeemed'
  | 'cgc_promotion_expired'
  | 'cgc_max_redemptions_reached'
  | 'message_received'
  | 'sponsorship_proposal'
  | 'sponsorship_accepted'
  | 'sponsorship_rejected'
  | 'counter_offer_received'
  | 'counter_offer_responded'
  | 'payment_received'
  | 'project_completed'
  | 'content_liked'
  | 'content_approved'
  | 'file_uploaded'
  | 'dragonshare_boost'
  | 'social_post_published'
  | 'social_post_failed'
  | 'social_draft_ready'
  | 'triple_post_completed'
  | 'member_joined'
  | 'member_removed'
  | 'member_role_changed'
  | 'unit_created'
  | 'unit_deleted'
  | 'profile_updated'
  | 'social_account_connected'
  | 'social_account_disconnected'
  | 'account_deletion_requested'
  | 'account_restored'
  | 'account_purge_warning';

export interface PushNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType | 'legacy';
  category: NotificationCategory | 'legacy';
  action_url: string | null;
  actor_id: string | null;
  actor_name: string | null;
  icon: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ChannelPreferences {
  in_app: boolean;
  email: boolean;
  sms: boolean;
}

export interface PreferencesMatrix {
  campaigns: ChannelPreferences;
  messages: ChannelPreferences;
  transactions: ChannelPreferences;
  content: ChannelPreferences;
  account: ChannelPreferences;
}

export const DEFAULT_PREFERENCES_MATRIX: PreferencesMatrix = {
  campaigns:    { in_app: true,  email: true,  sms: false },
  messages:     { in_app: true,  email: false, sms: false },
  transactions: { in_app: true,  email: true,  sms: false },
  content:      { in_app: true,  email: false, sms: false },
  account:      { in_app: true,  email: true,  sms: false },
};

export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: string; description: string }> = {
  campaigns:    { label: 'Campaigns',    icon: '📋', description: 'Applications, invitations, status changes' },
  messages:     { label: 'Messages',     icon: '💬', description: 'Direct messages and replies' },
  transactions: { label: 'Transactions', icon: '💰', description: 'Payments, sponsorships, counter-offers' },
  content:      { label: 'Content',      icon: '❤️', description: 'Likes, DragonShare, file uploads, social posting' },
  account:      { label: 'Account',      icon: '🏢', description: 'Team members, locations, settings, account' },
};

export const NOTIFICATION_TYPE_TO_EMAIL_TYPE: Record<string, string> = {
  application_received: 'new_application',
  application_accepted: 'application_status',
  application_rejected: 'application_status',
  campaign_invitation: 'campaign_invitation',
  invitation_declined: 'campaign_invitation_declined',
  campaign_published: 'campaign_published',
  revision_requested: 'revision_requested',
  message_received: 'new_message',
  sponsorship_proposal: 'sponsorship_proposal',
  sponsorship_accepted: 'sponsorship_status',
  sponsorship_rejected: 'sponsorship_status',
  counter_offer_received: 'counter_offer',
  counter_offer_responded: 'counter_offer_response',
  payment_received: 'payment_received',
  project_completed: 'project_completion',
  content_liked: 'content_liked',
  content_approved: 'content_approved',
  file_uploaded: 'file_uploaded_by_creator',
};
