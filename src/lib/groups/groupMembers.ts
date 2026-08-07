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
