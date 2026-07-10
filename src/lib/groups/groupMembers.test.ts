import { describe, it, expect } from 'vitest';
import { partitionMembers, activeMemberIds, buildGroupInviteNotification } from './groupMembers';

type M = { creator_id: string; status: 'invited'|'active'|'declined'|'removed' };
const members: M[] = [
  { creator_id: 'a', status: 'active' },
  { creator_id: 'b', status: 'invited' },
  { creator_id: 'c', status: 'active' },
  { creator_id: 'd', status: 'removed' },
];

describe('groupMembers', () => {
  it('partitions by status', () => {
    const p = partitionMembers(members);
    expect(p.active.map(m => m.creator_id)).toEqual(['a', 'c']);
    expect(p.invited.map(m => m.creator_id)).toEqual(['b']);
    expect(p.removed.map(m => m.creator_id)).toEqual(['d']);
  });
  it('lists active ids only', () => {
    expect(activeMemberIds(members)).toEqual(['a', 'c']);
  });
  it('builds a create-notification body for a group invite', () => {
    const body = buildGroupInviteNotification({
      creatorId: 'x', groupName: 'My Crew', groupId: 'g1', actorId: 'owner1',
    });
    expect(body.recipientId).toBe('x');
    expect(body.type).toBe('group_invitation');
    expect(body.category).toBe('campaigns');
    expect(body.actionUrl).toContain('/dashboard/creator');
    expect(body.body).toContain('My Crew');
    expect(body.data).toEqual({ group_id: 'g1' });
  });
});
