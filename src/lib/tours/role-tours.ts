export interface TourStep {
  target: string;
  title: string;
  body: string;
  cta?: { label: string; action: string };
}

export const RESTAURANT_TOUR: TourStep[] = [
  {
    target: "[data-tour='org-switcher']",
    title: "Switch locations",
    body: "Switch between locations here when you have more than one.",
  },
  {
    target: "[data-tour='brief-generator']",
    title: "Generate a campaign brief",
    body: "Paste your URL. Get a free campaign brief in 60 seconds. Try it now.",
    cta: { label: "Try it", action: "focus" },
  },
  {
    target: "[data-tour='bottom-nav-add']",
    title: "Launch a campaign",
    body: "Tap '+' anytime to launch a new campaign with creators.",
  },
  {
    target: "[data-tour='donny-help']",
    title: "Ask Donny",
    body: "Stuck? Donny knows every page. Tap to ask.",
  },
];

export const CREATOR_TOUR: TourStep[] = [
  {
    target: "[data-tour='browse-campaigns']",
    title: "Ask Donny for work",
    body: "Tell Donny what you're looking for, or browse every open campaign.",
  },
  {
    target: "[data-tour='creator-attention']",
    title: "What needs you",
    body: "Invitations, content to start, and anything waiting on a reply — all here.",
  },
  {
    target: "[data-tour='creator-secondary']",
    title: "Your full dashboard",
    body: "Earnings, DragonShare and your stats live on the full dashboard.",
  },
  {
    target: "[data-tour='donny-help']",
    title: "Ask Donny",
    body: "Stuck on anything? Ask Donny.",
  },
];

export const BRAND_TOUR: TourStep[] = [
  {
    target: "[data-tour='free-trio']",
    title: "Free Donny tools",
    body: "Three free Donny tools. Use them as much as you want, forever.",
  },
  {
    target: "[data-tour='org-switcher']",
    title: "Manage products",
    body: "Manage multiple products from one account.",
  },
  {
    target: "[data-tour='dragonshare-inbox']",
    title: "DragonShare inbox",
    body: "When creators post about you, you'll see them here.",
  },
  {
    target: "[data-tour='donny-help']",
    title: "Ask Donny",
    body: "Stuck? Ask Donny anywhere in the app.",
  },
];

export function getTourForRole(role: string): TourStep[] {
  switch (role) {
    case "business_client":
      return RESTAURANT_TOUR;
    case "content_creator":
      return CREATOR_TOUR;
    case "brand":
      return BRAND_TOUR;
    default:
      return [];
  }
}
