import { describe, it, expect } from "vitest";
import { authorizeCampaignHook, type HookAuthzInput } from "./authz";

const OWNER = "11111111-1111-1111-1111-111111111111";
const TEAMMATE = "22222222-2222-2222-2222-222222222222";
const APPLICANT = "33333333-3333-3333-3333-333333333333";
const BRAND = "44444444-4444-4444-4444-444444444444";
const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const input = (over: Partial<HookAuthzInput>): HookAuthzInput => ({
  campaign: { user_id: OWNER, org_id: ORG },
  callerId: OWNER,
  callerOrgIds: [],
  isActiveSponsorBrand: false,
  ...over,
});

describe("authorizeCampaignHook — allowed parties", () => {
  it("allows the campaign owner", () => {
    expect(authorizeCampaignHook(input({}))).toEqual({ ok: true, basis: "owner" });
  });

  it("allows an active member of the owning org", () => {
    expect(authorizeCampaignHook(input({ callerId: TEAMMATE, callerOrgIds: [ORG] })))
      .toEqual({ ok: true, basis: "org" });
  });

  it("allows an active sponsoring brand", () => {
    expect(authorizeCampaignHook(input({ callerId: BRAND, isActiveSponsorBrand: true })))
      .toEqual({ ok: true, basis: "sponsor" });
  });
});

describe("authorizeCampaignHook — the read-gate arms that must NOT carry over", () => {
  // The defect this module exists to fix: evaluateCampaignAccess answers a READ question and
  // allows an applicant on a published campaign. This performs WRITES, so that arm is gone.
  it("denies a mere applicant, even on a published campaign", () => {
    expect(authorizeCampaignHook(input({ callerId: APPLICANT })))
      .toEqual({ ok: false, status: 403 });
  });

  it("denies a collaborating creator — creators do not stage the business's social posts", () => {
    expect(authorizeCampaignHook(input({ callerId: APPLICANT, callerOrgIds: [] })))
      .toEqual({ ok: false, status: 403 });
  });
});

describe("authorizeCampaignHook — denials", () => {
  it("denies an unauthenticated caller with 401", () => {
    expect(authorizeCampaignHook(input({ callerId: null })))
      .toEqual({ ok: false, status: 401 });
  });

  it("denies a member of a different org", () => {
    expect(authorizeCampaignHook(input({ callerId: TEAMMATE, callerOrgIds: [OTHER_ORG] })))
      .toEqual({ ok: false, status: 403 });
  });

  it("denies an inactive/invited member (resolves to an empty org list)", () => {
    expect(authorizeCampaignHook(input({ callerId: TEAMMATE, callerOrgIds: [] })))
      .toEqual({ ok: false, status: 403 });
  });

  it("reports a missing campaign as 403, not 404 — no existence oracle", () => {
    expect(authorizeCampaignHook(input({ campaign: null, callerId: TEAMMATE })))
      .toEqual({ ok: false, status: 403 });
  });

  it("checks identity BEFORE the campaign, so anon gets 401 even on a missing campaign", () => {
    expect(authorizeCampaignHook(input({ campaign: null, callerId: null })))
      .toEqual({ ok: false, status: 401 });
  });

  it("does not treat a null org_id as a match for a caller with no orgs", () => {
    expect(
      authorizeCampaignHook(
        input({ campaign: { user_id: OWNER, org_id: null }, callerId: TEAMMATE, callerOrgIds: [] }),
      ),
    ).toEqual({ ok: false, status: 403 });
  });

  it("does not treat a null owner as a match for a null caller basis", () => {
    expect(
      authorizeCampaignHook(
        input({ campaign: { user_id: null, org_id: ORG }, callerId: TEAMMATE, callerOrgIds: [] }),
      ),
    ).toEqual({ ok: false, status: 403 });
  });
});
