# Design System

> Screenshots of all screens are in the `/designs` folder. Always reference them when building or modifying UI.

## Color Palette (Tailwind `dc-*` tokens)

Use the `dc-*` Tailwind tokens defined in `tailwind.config.ts` — never hardcode hex values in components.

| Token | Tailwind class | Hex | Usage |
|-|-|-|-|
| Teal (Primary) | `dc-teal` | `#4DD9C0` | Primary buttons, borders, headings, icons |
| Teal Dark | `dc-teal-dark` | `#00E5CC` | Hover/accent teal |
| Teal Button | `dc-teal-btn` / `dc-teal-btn-hover` | `#0F766E` / `#115E59` | Dark teal button fills |
| Pink (Secondary) | `dc-pink` | `#F9A8D4` | Inbound bubbles, CTA accents |
| Pink Accent | `dc-pink-accent` | `#EC4899` | Secondary button text, links, star ratings |
| Pink Accent Button | `dc-pink-accent-btn` / hover | `#DB2777` / `#BE185D` | Pink button fills |
| Pink Background | `dc-pink-bg` | `#F9C8E0` | Browse Creators, business dashboard header |
| Gray Background | `dc-gray` | `#A8A8A0` | Main app background (most screens) |
| Dark | `dc-dark` | `#1A1A2A` | Dark backgrounds |
| Card | `dc-card` | `#FFFFFF` | Card backgrounds |
| Text | `dc-text` | `#111111` | Headings, bold labels, card titles |
| Text Muted | `dc-text-muted` | `#555555` | Body copy, subtitles, placeholder text |
| Yellow | `dc-yellow` | `#FACC15` | CTA accent strips on campaign cards |

## Typography

| Element | Style |
|-|-|
| Page titles / H1 | ALL CAPS, bold, large — teal (`#4DD9C0`) on dark bg, dark on light bg |
| Section headings / H2 | Title case or ALL CAPS, bold, dark or teal |
| Card titles | Bold, sentence case, dark (`#111111`) |
| Body text | Regular weight, sentence case, gray (`#555555`) |
| Button labels | Bold or semi-bold, sentence case (e.g. "Get Started", "Apply Now") |
| Subtext / captions | Small, light gray, sentence case |
| Stats / numbers | Extra bold, large, black — used for Projects Completed, Reels, etc. |

## Buttons

| Type | Style |
|-|-|
| Primary CTA | Full-width pill shape, teal fill (`#4DD9C0`), white bold text |
| Secondary CTA | Full-width pill shape, white/light fill, pink text (`#EC4899`) with dark border |
| Ghost / Outline | Pill shape, transparent fill, dark border, pink or teal text |
| Action (small) | Pill shape, pink or teal fill, white text — used in cards (e.g. "View Portfolio") |
| Send button | Dark circle with arrow icon (messaging) |
| Add button | Dark circle with `+` icon (bottom nav center) |

## Cards

* White background, large rounded corners (`rounded-2xl` or `rounded-3xl`)
* Subtle shadow or teal border (`border border-teal-300`)
* Consistent internal padding
* Creator cards: thumbnail image (left, rounded) + name + description + action button
* Campaign cards: full-bleed image with dark overlay + text + company avatar at bottom
* Quick action cards: teal border, bold title, short description, centered text

## Navigation

* **Top nav:** Logo (top-left) + hamburger menu (top-right), minimal — no labels
* **Bottom nav:** 7 icons — Home, Favorites, Play/Video, **+ (teal, prominent center)**, Campaigns/List, Megaphone/Promote, Profile
* Active center `+` button: teal circle, larger than other icons, elevated
* Inactive icons: gray (`#888888`)

## Messaging UI

* Background: medium gray (`#A8A8A0`)
* Inbound bubbles: pink (`#F9A8D4`), left-aligned, with sender avatar
* Outbound bubbles: teal (`#4DD9C0`), right-aligned, with user avatar
* Bubble shape: large pill / fully rounded ends
* Top bar: white/light bg, creator name in teal, "Recently Active" subtitle, phone icon (pink circle)
* Input bar: white pill input + dark `+` button (left) + dark send arrow (right)

## Profile & Portfolio Pages

* Hero: full-bleed background image (photo or colored wall)
* Profile card: white pill/rounded card overlaid at bottom of hero — avatar (left, circular with teal border) + name + rating + location
* Stats row: 3 columns separated by pink vertical dividers — large bold number + label
* Reviews: 3-column horizontal scroll, plain text quotes + bold business name attribution
* CTA button: full-width teal pill at bottom

## Page-Specific Backgrounds

| Page | Background |
|-|-|
| Landing / Marketing | White (`#FFFFFF`) |
| Login | Medium gray (`#A8A8A0`) |
| Business Dashboard | Light pink (`#F9C8E0`) header, white body |
| Browse Creators | Light pink (`#F9C8E0`) full page |
| Creator Portfolio | Medium gray (`#A8A8A0`) |
| Available Campaigns | Medium gray (`#A8A8A0`) |
| Messaging | Medium gray (`#A8A8A0`) |
| Creator/Business Profile | Gray with hero image |

## Design Rules

* **Always use Tailwind utility classes** — never hardcode hex colors in inline styles
* **Mobile-first** — all screens designed for mobile (375–430px width)
* **Pill-shaped buttons everywhere** — use `rounded-full` for all buttons
* **Teal borders on interactive cards** — use `border border-teal-300` or `border-2 border-teal-400`
* **Never change the color system** without explicit instruction — teal + pink is the core brand identity
* **Avatar images** always use `rounded-full` with a teal ring (`ring-2 ring-teal-400`)
* **Full-width buttons on mobile** — `w-full` for all primary CTAs
* **Consistent spacing** — use `p-4` or `p-6` for card padding, `gap-4` between elements
* **Never use gray backgrounds/banners/badges** — use brand-adjacent colors (teal, pink, warm neutrals)
* **Opacity variants are permitted** — e.g., `bg-dc-teal/12`, `bg-dc-pink/50` for layering and hover states
