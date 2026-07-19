import { describe, it, expect } from 'vitest';
import { evaluateCampaignAccess, evaluateApplyAccess, type AccessCampaign } from './campaign-access';

const baseCampaign: AccessCampaign = {
  id: 'camp-1',
  user_id: 'owner-1',
  org_id: 'org-1',
  group_id: null,
  status: 'published',
};

const crewCampaign: AccessCampaign = {
  ...baseCampaign,
  group_id: 'group-1',
};

describe('evaluateCampaignAccess', () => {
  it('owner allowed', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'owner-1',
        orgIds: null,
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: true, reason: 'owner' });
  });

  it('org match allowed', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'someone-else',
        orgIds: ['org-1'],
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: true, reason: 'org' });
  });

  it('org match allowed when the caller belongs to multiple active orgs', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'someone-else',
        orgIds: ['org-9', 'org-1', 'org-2'],
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: true, reason: 'org' });
  });

  it('org NOT matching (caller belongs to other orgs, none matching) denied', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'someone-else',
        orgIds: ['org-9', 'org-2'],
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });
  });

  it('empty orgIds denied (fails closed, not open)', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'someone-else',
        orgIds: [],
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });
  });

  it('undefined/null orgIds denied on an org-scoped campaign (a merely-invited or suspended member must not leak in)', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'someone-else',
        orgIds: undefined,
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });

    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'someone-else',
        orgIds: null,
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });
  });

  it('participant allowed on a non-crew campaign', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'creator-1',
        orgIds: null,
        isCollaborator: true,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: true, reason: 'participant' });
  });

  it('participant DENIED on a crew campaign when not an active member', () => {
    expect(
      evaluateCampaignAccess({
        campaign: crewCampaign,
        userId: 'creator-1',
        orgIds: null,
        isCollaborator: true,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: false, reason: 'crew_non_member' });
  });

  it('participant allowed on a crew campaign when an active member', () => {
    expect(
      evaluateCampaignAccess({
        campaign: crewCampaign,
        userId: 'creator-1',
        orgIds: null,
        isCollaborator: true,
        hasApplication: false,
        isActiveGroupMember: true,
      }),
    ).toEqual({ allowed: true, reason: 'participant' });
  });

  it('owner allowed on a crew campaign even without active membership', () => {
    expect(
      evaluateCampaignAccess({
        campaign: crewCampaign,
        userId: 'owner-1',
        orgIds: null,
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: true, reason: 'owner' });
  });

  it('org match on a crew campaign still requires active group membership', () => {
    expect(
      evaluateCampaignAccess({
        campaign: crewCampaign,
        userId: 'someone-else',
        orgIds: ['org-1'],
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: true, reason: 'org' });
  });

  it('non-member denied', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: 'stranger-1',
        orgIds: null,
        isCollaborator: false,
        hasApplication: false,
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });
  });

  it('null/empty userId denied', () => {
    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: '' as unknown as string,
        orgIds: null,
        isCollaborator: true,
        hasApplication: false,
        isActiveGroupMember: true,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });

    expect(
      evaluateCampaignAccess({
        campaign: baseCampaign,
        userId: undefined as unknown as string,
        orgIds: null,
        isCollaborator: true,
        hasApplication: false,
        isActiveGroupMember: true,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });
  });

  it('null campaign denied', () => {
    expect(
      evaluateCampaignAccess({
        campaign: null as unknown as AccessCampaign,
        userId: 'owner-1',
        orgIds: ['org-1'],
        isCollaborator: true,
        hasApplication: false,
        isActiveGroupMember: true,
      }),
    ).toEqual({ allowed: false, reason: 'not_authorized' });
  });
});

describe('evaluateApplyAccess', () => {
  it('apply allowed on published non-crew', () => {
    expect(
      evaluateApplyAccess({ campaign: baseCampaign, isActiveGroupMember: false }),
    ).toEqual({ allowed: true, reason: 'ok' });
  });

  it('apply denied when unpublished', () => {
    expect(
      evaluateApplyAccess({
        campaign: { ...baseCampaign, status: 'draft' },
        isActiveGroupMember: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_published' });
  });

  it('apply denied on a crew campaign for a non-member', () => {
    expect(
      evaluateApplyAccess({ campaign: crewCampaign, isActiveGroupMember: false }),
    ).toEqual({ allowed: false, reason: 'crew_non_member' });
  });

  it('apply allowed on a crew campaign for an active member', () => {
    expect(
      evaluateApplyAccess({ campaign: crewCampaign, isActiveGroupMember: true }),
    ).toEqual({ allowed: true, reason: 'ok' });
  });

  it('apply denied on a null campaign (fail closed)', () => {
    expect(
      evaluateApplyAccess({
        campaign: null as unknown as AccessCampaign,
        isActiveGroupMember: true,
      }),
    ).toEqual({ allowed: false, reason: 'not_published' });
  });
});
