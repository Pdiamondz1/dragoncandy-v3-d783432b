import type { LandingClipKey } from "./landingClips";

export type HeroRole = "business" | "creator" | "brand";

export interface HeroContent {
  /** Pill label. */
  label: string;
  /** ~4-word headline; `accent` renders in the script font. */
  headline: string;
  accent: string;
  sub: string;
  primaryCta: string;
  /** Passed to /auth?mode=signup&role=… (own-property-guarded downstream). */
  signupRole: HeroRole;
  clipKey: LandingClipKey;
}

export const HERO_CONTENT: Record<HeroRole, HeroContent> = {
  business: {
    label: "Business",
    headline: "Real content for your socials,",
    accent: "on demand.",
    sub: "Vetted local creators make authentic content for your business — Donny handles the campaign, and it's ready in hours, not weeks.",
    primaryCta: "Get started free",
    signupRole: "business",
    clipKey: "hero.business",
  },
  creator: {
    label: "Creator",
    headline: "Create content for local businesses,",
    accent: "get paid fast.",
    sub: "Real gigs matched to your style by Donny — create from your phone, build a portfolio that pays.",
    primaryCta: "Join as a creator",
    signupRole: "creator",
    clipKey: "hero.creator",
  },
  brand: {
    label: "Brand",
    headline: "Campaigns that scale",
    accent: "themselves.",
    sub: "Multi-location reach, a vetted creator network, and real-time ROI.",
    primaryCta: "Launch campaigns",
    signupRole: "brand",
    clipKey: "hero.brand",
  },
};

export function visibleRoles(brandEnabled: boolean): HeroRole[] {
  return brandEnabled ? ["business", "creator", "brand"] : ["business", "creator"];
}

/**
 * Guarded ?role= parse. Own-property check only (rejects ?role=constructor and other
 * inherited names — mirrors AuthPage). A gated/unknown/null role falls back to business,
 * so a hidden role is never reachable from the hero.
 */
export function parseRoleParam(raw: string | null, brandEnabled: boolean): HeroRole {
  if (!raw || !Object.prototype.hasOwnProperty.call(HERO_CONTENT, raw)) return "business";
  const role = raw as HeroRole;
  return visibleRoles(brandEnabled).includes(role) ? role : "business";
}
