export interface ResolvedOrg {
  id: string;
  name: string;
  logo_url: string | null;
  org_type: string;
}

export function mergeResolvedOrgs<T extends { target_org_id: string }>(
  posts: T[],
  orgs: ResolvedOrg[],
): (T & { target_org?: ResolvedOrg })[] & { distinctOrgIds: string[] } {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const merged = posts.map((p) => ({ ...p, target_org: byId.get(p.target_org_id) }));
  const distinctOrgIds = [...new Set(posts.map((p) => p.target_org_id))];
  return Object.assign(merged, { distinctOrgIds });
}
