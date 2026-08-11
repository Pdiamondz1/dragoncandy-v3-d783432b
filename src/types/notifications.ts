export type NotificationCategory = 'campaigns' | 'messages' | 'transactions' | 'content' | 'account' | 'dragonshare' | 'promotions';

export type NotificationType =
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'campaign_invitation'
  | 'invitation_declined'
  | 'campaign_published'
  | 'campaign_cancelled'
  | 'new_campaign_for_creators'
  | 'new_campaign_for_brands'
  | 'group_campaign_posted'
  | 'group_invitation'
  | 'group_invite_accepted'
  | 'group_membership_removed'
  | 'content_submitted'
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
  | 'completion_request'
  | 'sponsorship_completed'
  | 'sponsorship_completion_request'
  | 'approval_pending'
  | 'content_started'
  | 'content_liked'
  | 'content_approved'
  | 'file_uploaded'
  | 'dragonshare_submission'
  | 'dragonshare_boost'
  | 'dragonshare_boost_receipt'
  | 'dragonshare_declined'
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
  | 'account_purge_warning'
  | 'dragon_points_award';

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
  icon: string | null;
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
  dragonshare: ChannelPreferences;
  promotions: ChannelPreferences;
}

export const DEFAULT_PREFERENCES_MATRIX: PreferencesMatrix = {
  campaigns:    { in_app: true,  email: true,  sms: false },
  messages:     { in_app: true,  email: false, sms: false },
  transactions: { in_app: true,  email: true,  sms: false },
  content:      { in_app: true,  email: false, sms: false },
  account:      { in_app: true,  email: true,  sms: false },
  dragonshare:  { in_app: true,  email: true,  sms: false },
  promotions:   { in_app: true,  email: false, sms: false },
};

export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: string; description: string }> = {
  campaigns:    { label: 'Campaigns',    icon: '📋', description: 'Applications, invitations, status changes' },
  messages:     { label: 'Messages',     icon: '💬', description: 'Direct messages and replies' },
  transactions: { label: 'Transactions', icon: '💰', description: 'Payments, sponsorships, counter-offers' },
  content:      { label: 'Content',      icon: '❤️', description: 'Likes, file uploads, social posting' },
  account:      { label: 'Account',      icon: '🏢', description: 'Team members, locations, settings, account' },
  dragonshare:  { label: 'DragonShare',  icon: '📣', description: 'Submissions, boosts, and payouts' },
  promotions:   { label: 'Promotions',   icon: '🎁', description: 'Customer submissions, codes, redemptions' },
};

export const NOTIFICATION_TYPE_TO_EMAIL_TYPE: Partial<Record<NotificationType, string>> = {
  application_received: 'new_application',
  application_accepted: 'application_status',
  application_rejected: 'application_status',
  // campaign_invitation intentionally omitted: send-campaign-invitation owns the
  // invitation email (business name + working link + Donny). create-notification
  // only fires the in-app bell for it — no duplicate email. Keep in sync with
  // supabase/functions/create-notification/index.ts.
  invitation_declined: 'campaign_invitation_declined',
  campaign_published: 'campaign_published',
  campaign_cancelled: 'campaign_cancelled',
  // The publish broadcast: when a PUBLIC campaign goes live, every completed creator and
  // (if open_for_sponsorship) every brand hears about it. Emitted only by
  // send-campaign-publish-notifications, which proves campaign ownership before fanning out.
  //
  // These are new NOTIFICATION types over pre-existing EMAIL templates of the same name. The
  // templates have shipped for months; what never existed was the bell. The broadcast called
  // send-notification-email directly, so across 24 published campaigns prod holds ZERO
  // in-app rows for a campaign going live, and every send ignored `preferences_matrix` and
  // `is_synthetic` — both of which live only in create-notification. Keep in sync with
  // supabase/functions/create-notification/index.ts.
  new_campaign_for_creators: 'new_campaign_for_creators',
  new_campaign_for_brands: 'new_campaign_for_brands',
  // Crew-specific (Crews v1 fires this bell-only to active crew members when a
  // crew campaign is posted). Mapping it adds email for CREW campaigns only —
  // no shared/standard type is remapped. Keep in sync with
  // supabase/functions/create-notification/index.ts.
  group_campaign_posted: 'new_crew_campaign',
  // Crew-specific: the invite itself. Bell-only until now, which meant a creator
  // who wasn't in the app when they were invited had no way to learn about it.
  // `group_invite_accepted` and `group_membership_removed` stay deliberately
  // unmapped — the owner is in-app for the former, and the latter doesn't warrant
  // an email. Keep in sync with supabase/functions/create-notification/index.ts.
  group_invitation: 'crew_invitation',
  // Crew-specific (Crews Phase 2): the ONE lifecycle gap — when a crew creator submits
  // content for review, no owner notification fired before. Emitted only by the crew
  // recordCrewActivity wrapper (not used by any other flow), so mapping it adds email for
  // CREW content submissions only. The payload pins category `campaigns` (email on by
  // default, opt-out-able) so the owner actually gets this high-signal email — category
  // `content` would default it off. Keep in sync with create-notification/index.ts.
  content_submitted: 'crew_content_submitted',
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
  dragonshare_submission: 'dragonshare_submission',
  dragonshare_boost: 'dragonshare_boost',
  dragonshare_boost_receipt: 'dragonshare_boost_receipt',
  dragonshare_declined: 'dragonshare_declined',
};
