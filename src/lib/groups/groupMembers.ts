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
}) {
  return {
    recipientId: args.creatorId,
    type: 'group_invitation',
    category: 'campaigns' as const,
    title: 'Crew invitation',
    body: `You've been invited to join the crew "${args.groupName}"`,
    actionUrl: `/dashboard/creator/campaigns?crews=1`,
    actorId: args.actorId,
    icon: 'invitation',
    data: { group_id: args.groupId },
    emailData: { groupName: args.groupName },
  };
}
