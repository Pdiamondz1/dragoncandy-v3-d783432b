import { describe, it, expect } from "vitest";
import {
  isKnownRoute,
  roleSlug,
  createCampaignRoute,
  campaignsListRoute,
  campaignDetailRoute,
  browseCreatorsRoute,
  dragonshareRoute,
} from "./routes.ts";

describe("isKnownRoute", () => {
  it("accepts real static routes", () => {
    for (const r of [
      "/dashboard/business/campaigns",
      "/dashboard/business/creators",
      "/dashboard/business/dragonshare",
      "/dashboard/brand/creators",
      "/dashboard/creator/my-campaigns",
      "/dashboard/creator/earnings",
      "/",
    ]) {
      expect(isKnownRoute(r), r).toBe(true);
    }
  });

  it("accepts real dynamic routes (any id/slug segment)", () => {
    expect(isKnownRoute("/dashboard/business/campaigns/6ca0844b-955b-42f6-a056-b9cfbb4f1b5d")).toBe(true);
    expect(isKnownRoute("/dashboard/creator/campaigns/abc-123")).toBe(true);
    expect(isKnownRoute("/creator/uncle-rocco")).toBe(true);
    expect(isKnownRoute("/dashboard/business/campaigns/xyz/edit")).toBe(true);
  });

  it("ignores a trailing query string or hash", () => {
    expect(isKnownRoute("/dashboard/business/campaigns/create?brief=Taco%20Tuesday")).toBe(true);
    expect(isKnownRoute("/dashboard/business/campaigns/xyz#applications-section")).toBe(true);
  });

  it("rejects the LLM-invented routes that caused the 404", () => {
    for (const r of [
      "/dashboard/business/invite",
      "/dashboard/business/creators/invite",
      "/invite/creators",
      "/dashboard/brand/campaigns", // list route exists for NO role
      "/dragonshare", // old dragonshare-agent route — not a real path
      "/dashboard/business/campaigns/undefined/",
    ]) {
      // note: /undefined is a valid :id segment, so exclude that specific case
      if (r.includes("undefined/")) continue;
      expect(isKnownRoute(r), r).toBe(false);
    }
  });

  it("rejects absolute URLs, protocol-relative, and junk", () => {
    expect(isKnownRoute("https://evil.com/dashboard/business/campaigns")).toBe(false);
    expect(isKnownRoute("//evil.com")).toBe(false);
    expect(isKnownRoute("")).toBe(false);
    expect(isKnownRoute(undefined)).toBe(false);
    expect(isKnownRoute(null)).toBe(false);
    expect(isKnownRoute("dashboard/business/campaigns")).toBe(false);
  });

  it("does not allow extra path segments past a known route", () => {
    expect(isKnownRoute("/dashboard/business/campaigns/xyz/extra/segment")).toBe(false);
    expect(isKnownRoute("/dashboard/business/creators/anything")).toBe(false);
  });
});

describe("role-aware route builders", () => {
  it("maps roles to the correct dashboard slug", () => {
    expect(roleSlug("business_client")).toBe("business");
    expect(roleSlug("brand")).toBe("brand");
    expect(roleSlug("content_creator")).toBe("creator");
    expect(roleSlug(undefined)).toBe("business");
  });

  it("builds real, role-correct routes (never the nonexistent brand list)", () => {
    expect(createCampaignRoute("business_client")).toBe("/dashboard/business/campaigns/create");
    expect(createCampaignRoute("brand")).toBe("/dashboard/brand/campaigns/create");

    expect(campaignsListRoute("business_client")).toBe("/dashboard/business/campaigns");
    expect(campaignsListRoute("content_creator")).toBe("/dashboard/creator/my-campaigns");
    // brand has no standalone list route — must not emit /dashboard/brand/campaigns
    expect(campaignsListRoute("brand")).toBe("/dashboard/brand");
    expect(isKnownRoute(campaignsListRoute("brand"))).toBe(true);

    expect(campaignDetailRoute("business_client", "c1")).toBe("/dashboard/business/campaigns/c1");
    expect(campaignDetailRoute("brand", "c1")).toBe("/dashboard/brand/campaigns/c1");
    expect(campaignDetailRoute("content_creator", "c1")).toBe("/dashboard/creator/campaigns/c1");

    expect(browseCreatorsRoute("business_client")).toBe("/dashboard/business/creators");
    expect(browseCreatorsRoute("brand")).toBe("/dashboard/brand/creators");

    expect(dragonshareRoute("business_client")).toBe("/dashboard/business/dragonshare");
    expect(dragonshareRoute("content_creator")).toBe("/dashboard/creator/dragonshare");
  });

  it("every builder output is itself a known route", () => {
    for (const role of ["business_client", "brand", "content_creator"]) {
      expect(isKnownRoute(createCampaignRoute(role)), role).toBe(true);
      expect(isKnownRoute(campaignsListRoute(role)), role).toBe(true);
      expect(isKnownRoute(campaignDetailRoute(role, "id123")), role).toBe(true);
      expect(isKnownRoute(browseCreatorsRoute(role)), role).toBe(true);
      expect(isKnownRoute(dragonshareRoute(role)), role).toBe(true);
    }
  });
});
