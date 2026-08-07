import { describe, it, expect } from 'vitest';
import {
  partitionMembers,
  activeMemberIds,
  buildGroupInviteNotification,
  buildGroupRemovalNotification,
} from './groupMembers';

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
  it('carries the business name into the invite bell and email payload', () => {
    const body = buildGroupInviteNotification({
      creatorId: 'x', groupName: 'My Crew', groupId: 'g1', actorId: 'owner1',
      businessName: "Tony's Pizza",
    });
    expect(body.body).toContain("Tony's Pizza");
    expect(body.emailData).toEqual({ groupName: 'My Crew', businessName: "Tony's Pizza" });
  });
  it('falls back to a generic business name when none is available', () => {
    const body = buildGroupInviteNotification({
      creatorId: 'x', groupName: 'My Crew', groupId: 'g1', actorId: 'owner1',
    });
    expect(body.body).toContain('A business');
    expect(body.emailData.businessName).toBe('A business');
  });
  it('builds a bell-only removal notification', () => {
    const body = buildGroupRemovalNotification({
      creatorId: 'x', groupName: 'My Crew', groupId: 'g1', actorId: 'owner1',
      businessName: "Tony's Pizza",
    });
    expect(body.type).toBe('group_membership_removed');
    expect(body.body).toContain('My Crew');
    expect(body.body).toContain("Tony's Pizza");
    // Deliberately unmapped in NOTIFICATION_TYPE_TO_EMAIL_TYPE — no email leg.
    expect(body).not.toHaveProperty('emailData');
  });
});
