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
    headline: "Your business, always",
    accent: "filming.",
    sub: "Vetted local creators, AI-built campaigns, real content in hours — not weeks.",
    primaryCta: "Get started free",
    signupRole: "business",
    clipKey: "hero.business",
  },
  creator: {
    label: "Creator",
    headline: "Get paid to make content you",
    accent: "love.",
    sub: "Local gigs matched to your style. Build a portfolio that pays — with fast payouts.",
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
