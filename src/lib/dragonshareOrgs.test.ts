import { describe, it, expect } from 'vitest';
import { mergeResolvedOrgs, type ResolvedOrg } from './dragonshareOrgs';

const orgs: ResolvedOrg[] = [
  { id: 'o1', name: 'Harbormill', logo_url: 'l1', org_type: 'restaurant' },
];

describe('mergeResolvedOrgs', () => {
  it('attaches the resolved org to each post by target_org_id', () => {
    const posts = [{ id: 'p1', target_org_id: 'o1' }, { id: 'p2', target_org_id: 'o2' }];
    const result = mergeResolvedOrgs(posts, orgs);
    expect(result[0].target_org).toEqual(orgs[0]);
    expect(result[1].target_org).toBeUndefined();
  });

  it('returns distinct org ids needing resolution', () => {
    const { distinctOrgIds } = mergeResolvedOrgs(
      [{ id: 'p1', target_org_id: 'o1' }, { id: 'p2', target_org_id: 'o1' }],
      [],
    );
    expect(distinctOrgIds).toEqual(['o1']);
  });
});
