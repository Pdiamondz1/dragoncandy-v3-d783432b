export type GroupMemberStatus = 'invited' | 'active' | 'declined' | 'removed';
export interface GroupMemberLike { creator_id: string; status: GroupMemberStatus; }

export function partitionMembers<T extends GroupMemberLike>(members: T[]) {
  return {
    active:   members.filter(m => m.status === 'active'),
    invited:  members.filter(m => m.status === 'invited'),
    declined: members.filter(m => m.status === 'declined'),
    removed:  members.filter(m => m.status === 'removed'),
  };
}

export function activeMemberIds(members: GroupMemberLike[]): string[] {
  return members.filter(m => m.status === 'active').map(m => m.creator_id);
}

/**
 * NOTE (2026-08-10): `title`, `body` and `actionUrl` below are now DISCARDED by
 * `create-notification`, which composes them server-side for `group_invitation` and
 * `group_membership_removed` — see CREW_COLD_CONTACT_TYPES in that function. These two
 * types are cold contact by design and fire at a non-active membership status, so they
 * are authorized against the membership row rather than `can_notify_user`; letting the
 * caller choose the words would have re-opened the hole that change closed.
 *
 * They are kept (rather than deleted) deliberately: `recipientId`/`type`/`category`/
 * `data.group_id` are still load-bearing, and retaining the copy means the client keeps
 * working unchanged if the edge function is ever rolled back. If you edit the wording
 * here, edit it in `create-notification` too — that is now the source of truth.
 */
export function buildGroupInviteNotification(args: {
  creatorId: string; groupName: string; groupId: string; actorId: string;
  /** Owner's business name. Drives both the bell body and the email subject. */
  businessName?: string | null;
}) {
  const business = args.businessName ?? 'A business';
  return {
    recipientId: args.creatorId,
    type: 'group_invitation',
    category: 'campaigns' as const,
    title: 'Crew invitation',
    body: `${business} invited you to their crew "${args.groupName}"`,
    actionUrl: `/dashboard/creator/campaigns?crews=1`,
    actorId: args.actorId,
    icon: 'invitation',
    data: { group_id: args.groupId },
    emailData: { groupName: args.groupName, businessName: business },
  };
}

/**
 * Sent only when an ACTIVE member is removed — rescinding a still-pending
 * invite must not tell someone they were removed from a crew they never
 * joined. Bell-only by design: `group_membership_removed` is deliberately
 * absent from NOTIFICATION_TYPE_TO_EMAIL_TYPE.
 */
export function buildGroupRemovalNotification(args: {
  creatorId: string; groupName: string; groupId: string; actorId: string;
  businessName?: string | null;
}) {
  const business = args.businessName ?? 'a business';
  return {
    recipientId: args.creatorId,
    type: 'group_membership_removed',
    category: 'campaigns' as const,
    title: 'Crew update',
    body: `You're no longer in ${business}'s crew "${args.groupName}"`,
    actionUrl: `/dashboard/creator/campaigns?crews=1`,
    actorId: args.actorId,
    icon: 'invitation',
    data: { group_id: args.groupId },
  };
}
