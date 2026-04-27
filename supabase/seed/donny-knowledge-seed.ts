/**
 * Donny RAG Knowledge Base Seed Script
 *
 * Inserts 60-80 knowledge chunks into donny_knowledge WITHOUT embeddings.
 * Embeddings are filled by a separate backfill job (Task 3).
 *
 * Run with:
 *   npx tsx supabase/seed/donny-knowledge-seed.ts
 *
 * Requires env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnowledgeChunkMetadata {
  source_type: string;
  source_id?: string;
  category: string;
  roles: string[];
  page_paths: string[];
}

interface KnowledgeChunk {
  content: string;
  metadata: KnowledgeChunkMetadata;
  source_type: string;
}

// ---------------------------------------------------------------------------
// Chunk definitions
// ---------------------------------------------------------------------------

const chunks: KnowledgeChunk[] = [
  // -------------------------------------------------------------------------
  // GETTING STARTED — Restaurant / Business signup (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'help_article',
    content:
      'To sign up as a restaurant on DragonCandy, tap "Get Started" on the landing page and select "I\'m a Restaurant or Business". Enter your business email and create a password. You\'ll then provide your restaurant name, address, and a phone number for verification. After verifying your email you\'ll be taken through a short onboarding that lets you upload a logo, describe your cuisine or brand, and set your target creator niches (food, lifestyle, local, etc.). Your account is active immediately — you can post your first campaign within minutes.',
    metadata: {
      source_type: 'help_article',
      source_id: 'getting-started-restaurant-signup',
      category: 'getting_started',
      roles: ['business_client'],
      page_paths: ['/signup', '/onboarding', '/dashboard'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'To sign up as a content creator on DragonCandy, tap "Get Started" and select "I\'m a Creator". You\'ll enter your name, email, and create a password. During onboarding you\'ll connect your social accounts (Instagram, TikTok, YouTube), select your content niches, set your location, and add a short bio. Your match score with brands depends on the accuracy of your profile — complete every field for best results. Once your profile is at 100%, you appear in the creator marketplace and can apply to campaigns.',
    metadata: {
      source_type: 'help_article',
      source_id: 'getting-started-creator-signup',
      category: 'getting_started',
      roles: ['content_creator'],
      page_paths: ['/signup', '/onboarding', '/profile'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'To sign up as a brand on DragonCandy, choose "I\'m a Brand" at signup. You\'ll provide your brand name, website URL, industry, and the products or services you want to promote. Donny will scan your website to pre-populate a campaign brief template — this saves you from filling out lengthy forms. Brands can invite team members immediately after signup. The free tier allows one active campaign; upgrade to Starter, Growth, or Pro for multiple simultaneous campaigns.',
    metadata: {
      source_type: 'help_article',
      source_id: 'getting-started-brand-signup',
      category: 'getting_started',
      roles: ['brand'],
      page_paths: ['/signup', '/onboarding', '/dashboard'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'Completing your DragonCandy profile increases your visibility to brands and improves your match score. For creators: add a profile photo, connect all social accounts, write a bio of at least 100 characters, set your location, list your niches, and upload 3–5 portfolio samples. Profile completeness is displayed as a percentage on your dashboard — aim for 100%. Incomplete profiles are ranked lower in brand searches. Donny will prompt you with the next missing field each time you open the app.',
    metadata: {
      source_type: 'help_article',
      source_id: 'completing-your-profile',
      category: 'getting_started',
      roles: ['content_creator', 'business_client', 'brand'],
      page_paths: ['/profile', '/settings', '/onboarding'],
    },
  },

  // -------------------------------------------------------------------------
  // CAMPAIGNS — Brand side (5 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'help_article',
    content:
      'To launch a campaign on DragonCandy, tap the + button in the bottom navigation bar. Select "Create Campaign" and paste your website URL or describe your promotion. Donny generates a campaign brief in under 60 seconds — including headline, key message, target creator type, content deliverables, and suggested budget. Review and edit the brief, set your campaign dates, and tap "Publish". Your campaign is live immediately and eligible for creator applications. One campaign per week is free for all plans.',
    metadata: {
      source_type: 'help_article',
      source_id: 'how-to-launch-a-campaign',
      category: 'campaigns',
      roles: ['business_client', 'brand'],
      page_paths: ['/campaigns/new', '/campaigns', '/dashboard'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'The DragonCandy campaign workflow has five stages: (1) Brief — brand creates a campaign brief using Donny\'s AI generator; (2) Matching — Donny scores and ranks creators by match score; (3) Applications — creators apply with a one-tap pitch pre-filled by Donny; (4) Collaboration — brand selects a creator, a collaboration record is created, and messaging opens; (5) Delivery & Payment — creator delivers content via the file upload system, brand approves, and Stripe releases payment.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'campaign-workflow-overview',
      category: 'campaigns',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/campaigns', '/collaborations', '/dashboard'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'Approving content submissions: when a creator uploads a deliverable, you\'ll receive a notification. Go to the collaboration page, view the file, and choose "Approve" or "Request Revision". Approved content triggers Stripe payment to the creator automatically. You have up to two revision requests per collaboration before additional rounds require a new agreement. Donny will summarize the submission and flag anything that doesn\'t match your brief so you can review faster.',
    metadata: {
      source_type: 'help_article',
      source_id: 'approving-content-submissions',
      category: 'campaigns',
      roles: ['business_client', 'brand'],
      page_paths: ['/collaborations', '/campaigns'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'The DragonCandy campaign brief generator lets brands paste a URL or describe their campaign in plain language. Donny analyzes the brand\'s website, social profiles, and past campaign performance to generate: a campaign title, key message (1–2 sentences), target creator niches, required deliverables (e.g. 1 Reel + 3 Stories), suggested compensation range, usage rights, and deadline. The entire process takes under 60 seconds. Brands can edit any field before publishing.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'campaign-brief-generator',
      category: 'campaigns',
      roles: ['business_client', 'brand'],
      page_paths: ['/campaigns/new'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Content delivery tiers define how quickly a creator delivers after a collaboration is confirmed. Standard delivery is 5 business days — the default for most campaigns. Express delivery is 48 hours, ideal for time-sensitive promotions. DragonDash is same-day or next-day delivery for urgent needs. DragonDash is available on Growth and Pro plans only. Creators who opt into DragonDash earn a premium rate (typically 1.5–2x the base rate). Brands select the delivery tier when creating a campaign.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'content-delivery-tiers',
      category: 'campaigns',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/campaigns/new', '/campaigns', '/collaborations'],
    },
  },

  // -------------------------------------------------------------------------
  // CAMPAIGNS — Creator side (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'help_article',
    content:
      'To apply to a campaign as a creator, open the Campaigns tab (list icon in the bottom nav). Browse available campaigns — swipe right to show interest or tap to see full details. When you tap "Apply", Donny pre-fills a pitch based on your profile, past content, and the campaign brief. Review the pitch, edit if you like, and submit with one tap. The brand typically responds within 24–48 hours. You\'ll be notified when your application is accepted, declined, or countered.',
    metadata: {
      source_type: 'help_article',
      source_id: 'how-to-apply-to-a-campaign',
      category: 'campaigns',
      roles: ['content_creator'],
      page_paths: ['/campaigns', '/campaigns/[id]', '/applications'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'What is DragonDash? DragonDash is the express content delivery tier on DragonCandy. Creators who enroll earn 1.5–2x their normal rate in exchange for delivering content within 24 hours of collaboration confirmation. To opt in, go to Settings → Creator Preferences → DragonDash and toggle it on. You\'ll only be matched to DragonDash campaigns when you\'re available. Brands pay a platform premium for DragonDash slots, which is shared with the creator. DragonDash is exclusive to creators on Growth and Pro accounts.',
    metadata: {
      source_type: 'help_article',
      source_id: 'what-is-dragondash',
      category: 'campaigns',
      roles: ['content_creator', 'business_client', 'brand'],
      page_paths: ['/settings', '/campaigns', '/collaborations'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'What is match score? Match score is a 0–100 number that reflects how well a creator aligns with a specific campaign. Donny calculates it using five factors: platform overlap (do the creator\'s active platforms match the brand\'s target?), niche alignment (content category similarity), engagement rate (likes + comments ÷ followers, benchmarked by platform), location match (local vs. national campaigns), and collaboration history (past performance with similar brands). A score above 75 is considered a strong match. Brands see match scores on every application.',
    metadata: {
      source_type: 'help_article',
      source_id: 'what-is-match-score',
      category: 'campaigns',
      roles: ['content_creator', 'business_client', 'brand'],
      page_paths: ['/campaigns', '/applications', '/collaborations'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Campaign applications on DragonCandy support counter-offers. If a brand likes a creator but wants different terms (compensation, deliverables, timeline), they can send a counter-offer instead of declining. The creator sees the counter-offer in their notifications and can accept, decline, or counter again. This negotiation happens in-app before a collaboration is created. Donny will summarize the differences between the original application and the counter-offer to help both parties decide quickly.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'campaign-counter-offers',
      category: 'campaigns',
      roles: ['content_creator', 'business_client', 'brand'],
      page_paths: ['/applications', '/campaigns/[id]'],
    },
  },

  // -------------------------------------------------------------------------
  // DRAGONSHARE — Creator side (5 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'dragonshare',
    content:
      'DragonShare lets creators earn money from content they\'ve already posted. Here\'s how it works: (1) Post content that features or mentions a brand on Instagram, TikTok, or YouTube — you don\'t need a campaign to do this. (2) Copy the link to your post and paste it into the DragonShare tab in the DragonCandy app. (3) Donny analyzes the post, scores it, and shows it to relevant brands. (4) If a brand boosts your post, you receive 80% of the boost amount via Stripe. Payouts arrive in 2–3 business days.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-creator-how-it-works',
      category: 'dragonshare',
      roles: ['content_creator'],
      page_paths: ['/dragonshare', '/earnings'],
    },
  },
  {
    source_type: 'dragonshare',
    content:
      'DragonShare creator payouts: when a brand boosts your DragonShare post, you earn 80% of the boost amount. Boost tiers are $25, $50, $100, and $250. Your payout is transferred to your connected Stripe account within 2–3 business days of the brand\'s approval. You can track pending and completed payouts in the Earnings tab. There is no minimum payout threshold — even a $25 boost pays out $20 to you. DragonCandy keeps 20% as a platform fee.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-creator-payouts',
      category: 'dragonshare',
      roles: ['content_creator'],
      page_paths: ['/dragonshare', '/earnings', '/settings'],
    },
  },
  {
    source_type: 'dragonshare',
    content:
      'To submit a post to DragonShare: open the DragonShare tab (megaphone icon in the bottom nav). Tap "Submit Post". Paste the public URL of your Instagram, TikTok, or YouTube post. Donny fetches the post, shows you a preview, and displays an estimated reach score. Tap "Submit" to add it to the DragonShare inbox for brands. You can submit multiple posts per day. Posts remain active for 30 days. If no brand boosts within 30 days, the post expires and you can resubmit.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-submit-post',
      category: 'dragonshare',
      roles: ['content_creator'],
      page_paths: ['/dragonshare'],
    },
  },
  {
    source_type: 'dragonshare',
    content:
      'What is a good DragonShare boost amount? Donny recommends boost tiers based on a post\'s estimated reach and engagement. For posts with under 5,000 views, Donny suggests $25. For 5,000–25,000 views, $50. For 25,000–100,000 views, $100. For posts with 100,000+ views or above-average engagement, $250. Brands can always choose a higher tier if the content aligns strongly with their campaign. Donny\'s recommendation is advisory — the brand makes the final call.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-good-boost-amount',
      category: 'dragonshare',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/dragonshare'],
    },
  },
  {
    source_type: 'dragonshare',
    content:
      'When do creators get paid for DragonShare? After a brand selects a boost tier and confirms payment, DragonCandy processes the 80% creator payout within 1 business day. The payout arrives in the creator\'s connected Stripe account within 2–3 business days total. Creators must have a Stripe account connected in Settings → Payments to receive payouts. If no Stripe account is connected, payouts are held for up to 7 days before the boost expires and the brand is refunded.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-creator-payment-timing',
      category: 'dragonshare',
      roles: ['content_creator'],
      page_paths: ['/dragonshare', '/earnings', '/settings'],
    },
  },

  // -------------------------------------------------------------------------
  // DRAGONSHARE — Brand side (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'dragonshare',
    content:
      'DragonShare for brands: when creators post organic content mentioning your brand, DragonCandy automatically catches those posts and places them in your DragonShare inbox. You review each post with a Donny-generated score that rates reach, engagement, and brand alignment. If you like a post, choose a boost tier: $25, $50, $100, or $250. The creator receives 80% of that amount. You get the right to reshare and amplify the post. This turns organic mentions into paid, rights-cleared content.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-brand-how-it-works',
      category: 'dragonshare',
      roles: ['business_client', 'brand'],
      page_paths: ['/dragonshare', '/dashboard'],
    },
  },
  {
    source_type: 'dragonshare',
    content:
      'DragonShare inbox review: your DragonShare inbox shows all creator posts that mention your brand, sorted by Donny\'s score (highest first). Each card shows the creator\'s name, platform, follower count, estimated views, engagement rate, and a thumbnail. Tap a card to see the full post. You can Boost (choose a tier and pay), Skip (dismiss without paying), or Save for Later. Boosted posts are added to your Brand Media Library for future use. The inbox refreshes in real-time as new posts are detected.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-inbox-review',
      category: 'dragonshare',
      roles: ['business_client', 'brand'],
      page_paths: ['/dragonshare'],
    },
  },
  {
    source_type: 'dragonshare',
    content:
      'DragonShare boost tiers for brands: $25 — micro reach, ideal for local mentions or nano-influencers. $50 — small reach, good for emerging creators with strong engagement. $100 — mid-tier reach, recommended for creators with 10k–50k followers. $250 — high reach, for creators with 50k+ followers or viral posts. Donny highlights the recommended tier in green. You can always choose a different tier. Payment is charged to your saved payment method immediately upon boost selection.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-boost-tiers-brand',
      category: 'dragonshare',
      roles: ['business_client', 'brand'],
      page_paths: ['/dragonshare'],
    },
  },
  {
    source_type: 'dragonshare',
    content:
      'DragonShare rights and usage: when you boost a creator\'s post via DragonShare, you receive a non-exclusive license to reshare the original post on your own social channels and use it in digital advertising for 12 months. You do not receive rights to modify the content or use it in print. Rights are granted automatically upon payment — no separate contract is needed. If you need extended or exclusive rights, contact the creator directly via DragonCandy messaging to negotiate a custom agreement.',
    metadata: {
      source_type: 'dragonshare',
      source_id: 'dragonshare-usage-rights',
      category: 'dragonshare',
      roles: ['business_client', 'brand'],
      page_paths: ['/dragonshare'],
    },
  },

  // -------------------------------------------------------------------------
  // BILLING & PRICING (7 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'pricing',
    content:
      'DragonCandy pricing tiers: Free — 1 active campaign, 1 seat, basic features at no cost. Starter — multiple campaigns, up to 4 seats (1 included + 3 extra at $29/seat/mo), basic analytics. Growth — up to 20 seats (5 included + 15 extra at $39/seat/mo), DragonDash access, advanced analytics, multi-unit support. Pro — unlimited seats (15 included, extras at $49/seat/mo), API access, custom branding, priority support. Enterprise — 999 seats, dedicated support, custom pricing. All paid plans are billed monthly and can be cancelled anytime.',
    metadata: {
      source_type: 'pricing',
      source_id: 'pricing-tiers-overview',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/billing', '/pricing', '/upgrade'],
    },
  },
  {
    source_type: 'pricing',
    content:
      'Free plan details: the Free plan allows one active campaign at a time, one team seat (owner only), and access to the basic creator marketplace. DragonShare inbox is limited to 5 posts per month. Campaign brief generator is available once per week at no charge. Donny AI chat is available but limited to 20 messages per day. Upgrading to Starter or higher removes all these limits. Free plan users do not have access to DragonDash, advanced analytics, or multi-unit features.',
    metadata: {
      source_type: 'pricing',
      source_id: 'free-plan-details',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/billing', '/pricing'],
    },
  },
  {
    source_type: 'pricing',
    content:
      'Starter plan details: Starter gives you multiple simultaneous campaigns, up to 4 seats (1 owner + up to 3 additional at $29/seat/month), basic analytics, and unlimited DragonShare inbox access. The campaign brief generator is unlimited. Donny AI chat is unlimited. Starter does not include DragonDash, multi-unit management, or API access. Starter is best for single-location restaurants or small brands running 2–5 campaigns per month.',
    metadata: {
      source_type: 'pricing',
      source_id: 'starter-plan-details',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/billing', '/pricing'],
    },
  },
  {
    source_type: 'pricing',
    content:
      'Growth plan details: Growth includes DragonDash (same-day/next-day content delivery), up to 20 seats (5 included, extras at $39/seat/mo), advanced analytics with ROI tracking, and multi-unit account management (manage multiple restaurant locations or storefronts from one dashboard). Growth is the recommended plan for restaurant groups, franchise brands, and businesses running more than 5 simultaneous campaigns.',
    metadata: {
      source_type: 'pricing',
      source_id: 'growth-plan-details',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/billing', '/pricing'],
    },
  },
  {
    source_type: 'pricing',
    content:
      'Pro plan details: Pro is the top self-serve tier. It includes unlimited seats (15 included, extras at $49/seat/mo), API access for integration with your own systems, custom branding (white-label creator portal), priority support (response within 4 hours), and all Growth features. Pro is best for agencies managing multiple brand accounts or large enterprise brands with complex workflows.',
    metadata: {
      source_type: 'pricing',
      source_id: 'pro-plan-details',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/billing', '/pricing'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'Upgrading and downgrading your plan: go to Settings → Billing → Change Plan. Upgrades take effect immediately and are prorated for the remainder of your billing cycle. Downgrades take effect at the start of your next billing cycle — you retain your current plan\'s features until then. If you downgrade and exceed the lower plan\'s limits (e.g., more active campaigns than allowed), excess campaigns are paused (not deleted) until you reduce or upgrade again.',
    metadata: {
      source_type: 'help_article',
      source_id: 'upgrading-downgrading-plan',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/billing'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'Refunds and cancellations: DragonCandy offers a 14-day refund window on new plan subscriptions. If you cancel within 14 days of starting a paid plan, contact support for a full refund. After 14 days, cancellations stop future billing but do not refund the current period. DragonShare boost payments are non-refundable once a creator has been paid. Campaign payments held in escrow can be refunded if the collaboration is cancelled before content delivery begins.',
    metadata: {
      source_type: 'help_article',
      source_id: 'refunds-and-cancellations',
      category: 'billing',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/settings/billing', '/support'],
    },
  },

  // -------------------------------------------------------------------------
  // ACCOUNT MANAGEMENT (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'help_article',
    content:
      'Deleting your DragonCandy account: go to Settings → Account → Delete Account. You\'ll be asked to confirm by typing your email address. After confirmation, your account enters a 7-day grace period during which you can log back in to cancel the deletion. After 7 days, all your data is permanently removed. Active collaborations and pending payments must be resolved before deletion can proceed. Earnings already paid out to your Stripe account are not affected.',
    metadata: {
      source_type: 'help_article',
      source_id: 'deleting-your-account',
      category: 'account',
      roles: ['content_creator', 'business_client', 'brand'],
      page_paths: ['/settings/account'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'GDPR data erasure: if you are located in the EU or UK and want your personal data erased under GDPR Article 17, submit a Data Erasure Request from Settings → Privacy → Request Data Erasure. DragonCandy will process your request within 30 days. Data shared with third parties (e.g., Stripe for payment processing) is subject to those third parties\' own retention policies. You\'ll receive a confirmation email when erasure is complete. Note: financial transaction records may be retained for up to 7 years as required by law.',
    metadata: {
      source_type: 'help_article',
      source_id: 'gdpr-data-erasure',
      category: 'account',
      roles: ['content_creator', 'business_client', 'brand'],
      page_paths: ['/settings/privacy'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'Team roles on DragonCandy: Owner — full control, can delete account, manage billing, and manage all members. Admin — can create/edit/delete campaigns, manage creators, and invite Members and Viewers. Member — can create and manage their own campaigns, view collaborations, and message creators. Viewer — read-only access to campaigns, analytics, and collaborations; cannot make changes. Owners and Admins can change any member\'s role from Settings → Team. Only one Owner is allowed per account.',
    metadata: {
      source_type: 'help_article',
      source_id: 'team-roles-explained',
      category: 'account',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/team'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Org (multi-unit) management: Growth and Pro accounts can manage multiple business locations or brand units from a single dashboard. Go to Settings → Organization → Add Location. Each location can have its own campaigns, team members, and DragonShare inbox. The Owner and Admins at the org level can see all locations\' analytics in a combined view. Individual location managers are set as Admins for that location only and cannot see other locations\' data unless explicitly granted access.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'org-management-multi-unit',
      category: 'account',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/organization', '/dashboard'],
    },
  },

  // -------------------------------------------------------------------------
  // MESSAGING (3 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'feature_doc',
    content:
      'Messaging on DragonCandy is real-time chat between brands and creators. A conversation is automatically created when a collaboration is confirmed. Both parties can exchange text messages, share files, and send images. Messages are delivered via Supabase Realtime — no page refresh needed. Notifications are sent via push notification and email. You can also message creators or brands before a collaboration starts using the "Message" button on their profile.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'messaging-overview',
      category: 'messaging',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/messages', '/messages/[id]'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'File sharing in DragonCandy messages: you can attach files directly in any conversation. Tap the + icon next to the message input, then choose from camera, photo library, or file picker. Supported formats: images (JPG, PNG, GIF), video (MP4, MOV), PDF, and common document formats. Maximum file size is 500 MB per upload. Files are stored securely in Supabase Storage and are accessible only to conversation participants. Creators use file sharing to deliver final content assets to brands.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'messaging-file-sharing',
      category: 'messaging',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/messages', '/messages/[id]', '/collaborations'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Message reactions: you can react to any message with an emoji by long-pressing (mobile) or hovering and clicking the emoji icon (desktop). Reactions are visible to all conversation participants. Common reactions include thumbs up (quick approval), fire (great content), and checkmark (confirmed/done). Reactions are lightweight and do not trigger a push notification, so they\'re ideal for quick acknowledgements without cluttering the conversation.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'messaging-reactions',
      category: 'messaging',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/messages', '/messages/[id]'],
    },
  },

  // -------------------------------------------------------------------------
  // DONNY AI (6 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'feature_doc',
    content:
      'Donny is DragonCandy\'s built-in AI assistant. Access Donny via the chat bubble in the bottom nav on mobile or the Donny button in the header on desktop. Donny can: answer questions about the platform, help draft campaign briefs, recommend creators for your campaign, summarize collaboration activity, explain your analytics, and take actions like creating a campaign or sending a message on your behalf. Donny learns your preferences over time to give more relevant suggestions.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'donny-ai-overview',
      category: 'donny',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/donny', '/dashboard', '/campaigns'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Donny AI for brands: Donny can generate a complete campaign brief from a URL in under 60 seconds, recommend the top 5 creators for a campaign based on match score, summarize pending applications so you can approve or decline faster, alert you to DragonShare posts you haven\'t reviewed, and explain your campaign ROI in plain language. On Free plans, Donny chat is limited to 20 messages per day. Paid plans get unlimited Donny access.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'donny-ai-brands',
      category: 'donny',
      roles: ['business_client', 'brand'],
      page_paths: ['/donny', '/dashboard', '/campaigns'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Donny AI for creators: Donny pre-fills your campaign application pitch using your profile and the brand\'s brief, so you apply faster without writing from scratch. Donny also suggests which open campaigns match your profile most closely, reminds you when deadlines are approaching, and gives feedback on the content you\'re about to submit (e.g., "the brief asked for a morning lifestyle shoot — your video appears to be at night"). These nudges help you deliver on-brief the first time.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'donny-ai-creators',
      category: 'donny',
      roles: ['content_creator'],
      page_paths: ['/donny', '/campaigns', '/collaborations'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Donny nudges are proactive suggestions that appear in your notification feed and on relevant pages. For brands: "You have 3 unreviewed DragonShare posts — two are high match." For creators: "Your collaboration with Café Lune is due in 48 hours — start uploading now." Nudges are generated automatically by Donny based on your account activity and can be dismissed individually. You can configure which nudge types you receive in Settings → Notifications → Donny Alerts.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'donny-nudges',
      category: 'donny',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/notifications', '/settings/notifications', '/dashboard'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Donny quick actions: in addition to chat, Donny exposes quick action buttons on key pages. On the Campaign dashboard: "Generate Brief", "Find Creators", "Review Applications". On the Collaboration page: "Summarize Activity", "Request Revision", "Approve & Pay". In the DragonShare inbox: "Boost Top Post", "Skip All Low-Score Posts". Quick actions let you do common tasks with one tap instead of navigating through menus. They adapt based on the current state of your account.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'donny-quick-actions',
      category: 'donny',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/donny', '/campaigns', '/collaborations', '/dragonshare'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Donny is accessible across devices and platforms. On mobile: tap the Donny chat bubble in the bottom navigation bar. On desktop/web: click the "Ask Donny" button in the top right header. Donny is also available via the DragonCandy API for Pro and Enterprise accounts — you can embed Donny into your own tools, POS systems, or internal dashboards using the API key found in Settings → API. Donny\'s plugin and wearable extensions are on the product roadmap.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'donny-access-and-api',
      category: 'donny',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/donny', '/settings/api'],
    },
  },

  // -------------------------------------------------------------------------
  // TOUR — Restaurant onboarding (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'tour',
    content:
      'Restaurant onboarding tour, step 1: Switch locations. If you manage multiple restaurant locations, you can switch between them using the location picker in the top left of your dashboard. Each location has its own campaigns, creator relationships, and analytics. The active location is shown in the header. Use the + icon next to the location picker to add a new location (Growth/Pro required).',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-restaurant-switch-locations',
      category: 'tour',
      roles: ['business_client'],
      page_paths: ['/dashboard', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Restaurant onboarding tour, step 2: Generate a campaign brief. Tap the + button at the bottom center of the screen, then select "Create Campaign". Paste your menu URL, a promotion description, or just type what you\'re looking to promote. Donny will build a complete campaign brief — including content type, target creator niche, and suggested compensation — in under 60 seconds. This is free once per week on all plans.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-restaurant-generate-brief',
      category: 'tour',
      roles: ['business_client'],
      page_paths: ['/campaigns/new', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Restaurant onboarding tour, step 3: Launch a campaign. After reviewing your Donny-generated brief, tap "Publish Campaign". Your campaign is instantly visible to creators on the DragonCandy marketplace. You\'ll receive applications within minutes if your brief is competitive. Set a clear deadline and compensation to attract the best local creators. You can edit the campaign details at any time before a creator is selected.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-restaurant-launch-campaign',
      category: 'tour',
      roles: ['business_client'],
      page_paths: ['/campaigns/new', '/campaigns', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Restaurant onboarding tour, step 4: Ask Donny for help. Tap the Donny chat bubble anytime — in the bottom nav on mobile or top right on desktop. Ask questions like "Which creator should I pick?" or "How much should I pay for a TikTok Reel?" or "Why did my last campaign get few applications?" Donny has context about your account and will give personalized, specific answers — not generic advice.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-restaurant-ask-donny',
      category: 'tour',
      roles: ['business_client'],
      page_paths: ['/donny', '/dashboard', '/onboarding/tour'],
    },
  },

  // -------------------------------------------------------------------------
  // TOUR — Creator onboarding (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'tour',
    content:
      'Creator onboarding tour, step 1: Complete your profile. Your profile is your pitch to brands. Add a high-quality profile photo, connect your Instagram and TikTok accounts, write a bio (at least 100 characters), set your location, and list your content niches. Upload 3–5 portfolio samples — these are the first thing brands look at. A complete profile is required to appear in brand searches and to be matched to campaigns.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-creator-complete-profile',
      category: 'tour',
      roles: ['content_creator'],
      page_paths: ['/profile', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Creator onboarding tour, step 2: Browse campaigns and apply with one tap. Open the Campaigns tab in the bottom nav. Swipe through available campaigns — swipe right to show interest, left to skip. When you find one you like, tap "Apply". Donny pre-fills a personalized pitch using your profile. Review the pitch, make any edits, then submit. Brands typically respond within 24–48 hours.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-creator-browse-apply',
      category: 'tour',
      roles: ['content_creator'],
      page_paths: ['/campaigns', '/applications', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Creator onboarding tour, step 3: Earn from existing posts with DragonShare. Open the DragonShare tab (megaphone icon). Paste a link to any post you\'ve made that features a brand — even if you weren\'t hired by them. Donny scores your post and shows it to relevant brands. If a brand boosts your post, you earn 80% of the boost amount via Stripe in 2–3 business days. This is passive income from content you\'ve already created.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-creator-dragonshare',
      category: 'tour',
      roles: ['content_creator'],
      page_paths: ['/dragonshare', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Creator onboarding tour, step 4: Ask Donny anything. Donny is your personal assistant in DragonCandy. Ask "Which campaigns match me best?" or "How do I improve my match score?" or "When is my next deadline?" Donny reads your profile, active collaborations, and earnings history to give you specific guidance. Access Donny from the chat bubble in the bottom nav. Donny is free for creators with no daily limit.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-creator-ask-donny',
      category: 'tour',
      roles: ['content_creator'],
      page_paths: ['/donny', '/dashboard', '/onboarding/tour'],
    },
  },

  // -------------------------------------------------------------------------
  // TOUR — Brand onboarding (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'tour',
    content:
      'Brand onboarding tour, step 1: Free Donny tools. As a brand, you get access to Donny\'s AI tools to make creator marketing effortless. On the free plan, use the campaign brief generator once per week and get 20 Donny chat messages per day. Upgrade to any paid plan for unlimited access. Start by asking Donny to scan your website and suggest your first campaign.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-brand-free-donny',
      category: 'tour',
      roles: ['brand'],
      page_paths: ['/donny', '/dashboard', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Brand onboarding tour, step 2: Manage products. Add the products or services you want to promote in Settings → Products. Each product can have a name, description, image, and associated campaign templates. When Donny generates a campaign brief, it uses your product catalog to write accurate, specific content briefs. Keeping your product list up to date ensures Donny\'s recommendations stay relevant.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-brand-manage-products',
      category: 'tour',
      roles: ['brand'],
      page_paths: ['/settings/products', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Brand onboarding tour, step 3: DragonShare inbox. Your DragonShare inbox automatically collects organic posts from creators who mention your brand. Review each post and choose a boost tier ($25, $50, $100, $250) to pay the creator and receive resharing rights. Donny scores each post so you can prioritize the highest-value content. Check your inbox daily for new organic mentions — they arrive in real-time.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-brand-dragonshare-inbox',
      category: 'tour',
      roles: ['brand'],
      page_paths: ['/dragonshare', '/onboarding/tour'],
    },
  },
  {
    source_type: 'tour',
    content:
      'Brand onboarding tour, step 4: Ask Donny. Donny is available to answer any question about your campaigns, creators, or account. Examples: "Which of my campaigns has the best ROI?", "Recommend a creator for my new summer menu", "How do I reduce my cost per post?" Access Donny from the top right header or the floating chat button. Donny proactively sends you alerts about pending tasks and opportunities you might miss.',
    metadata: {
      source_type: 'tour',
      source_id: 'tour-brand-ask-donny',
      category: 'tour',
      roles: ['brand'],
      page_paths: ['/donny', '/dashboard', '/onboarding/tour'],
    },
  },

  // -------------------------------------------------------------------------
  // PAYMENTS & STRIPE (4 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'feature_doc',
    content:
      'Payments on DragonCandy are powered by Stripe. Brands pay into a campaign escrow when a collaboration is confirmed. The escrow is held by DragonCandy until the brand approves the creator\'s content. Upon approval, Stripe automatically releases the payment to the creator\'s connected Stripe account, minus DragonCandy\'s platform fee (20%). This escrow model protects both parties: brands don\'t pay until satisfied, and creators are guaranteed payment once content is approved.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'payments-stripe-escrow',
      category: 'billing',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/settings/payments', '/collaborations', '/earnings'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Connecting your Stripe account as a creator: go to Settings → Payments → Connect Stripe. You\'ll be redirected to Stripe to create or connect an existing Stripe Express account. This is required to receive campaign payments and DragonShare payouts. Stripe handles all identity verification (KYC) and tax documentation. DragonCandy never stores your bank account details directly. Once connected, payments are deposited automatically within 2–3 business days of approval.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'payments-creator-stripe-connect',
      category: 'billing',
      roles: ['content_creator'],
      page_paths: ['/settings/payments', '/earnings'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Adding a payment method as a brand: go to Settings → Billing → Payment Methods. Add a credit card or debit card — all major cards are supported. You can add multiple cards and set a default. Campaign payments are charged to your default payment method when you confirm a collaboration. DragonShare boost payments are charged immediately when you tap a boost tier. All transactions are secured by Stripe and encrypted in transit.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'payments-brand-payment-methods',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/settings/billing'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Collaboration payment disputes: if you believe a creator\'s delivered content does not match the campaign brief, do not approve it. Request a revision instead — you have up to 2 revision requests per collaboration. If after revisions the content is still unsatisfactory, open a dispute via Settings → Support → Payment Dispute. DragonCandy will review the original brief and the delivered content and mediate. Disputes are resolved within 5 business days. Escrow funds are held until resolution.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'payments-disputes',
      category: 'billing',
      roles: ['business_client', 'brand'],
      page_paths: ['/collaborations', '/settings/support'],
    },
  },

  // -------------------------------------------------------------------------
  // ANALYTICS (3 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'feature_doc',
    content:
      'Campaign analytics on DragonCandy: after a creator delivers and you approve their content, DragonCandy tracks the performance of that content automatically (where social APIs allow). Metrics include: estimated reach, impressions, engagement rate, click-throughs (if a link was used), and follower growth attributed to the campaign. Analytics are available in the Campaign detail page under the "Results" tab. On Growth and Pro plans, you can download a CSV export of all campaign data.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'analytics-campaign-performance',
      category: 'analytics',
      roles: ['business_client', 'brand'],
      page_paths: ['/campaigns/[id]/results', '/analytics'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Creator analytics: your creator dashboard shows your total earnings, number of completed collaborations, average match score across applications, and your acceptance rate (applications accepted ÷ submitted). High acceptance rates improve your visibility in brand searches. Donny will alert you if your acceptance rate drops and suggest ways to improve your profile or pitch quality.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'analytics-creator-dashboard',
      category: 'analytics',
      roles: ['content_creator'],
      page_paths: ['/dashboard', '/analytics'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'DragonShare analytics: the DragonShare analytics tab shows total boost revenue (creator) or total spend (brand), number of posts submitted or boosted, average Donny score of submitted posts, and which platforms generate the most engagement. Brands can see which creator niches deliver the best ROI from DragonShare vs. traditional campaigns. These insights help you decide where to focus your creator marketing budget.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'analytics-dragonshare',
      category: 'analytics',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/dragonshare', '/analytics'],
    },
  },

  // -------------------------------------------------------------------------
  // NOTIFICATIONS & PREFERENCES (2 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'feature_doc',
    content:
      'Notification preferences: DragonCandy sends push notifications, in-app alerts, and email notifications. You can control each channel individually in Settings → Notifications. Categories include: Campaign updates (new applications, approvals, declines), Collaboration events (new messages, file uploads, payment releases), DragonShare (new inbox posts, boost confirmations), Donny alerts (nudges, reminders), and Account (billing, security). By default all categories are enabled on all channels.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'notification-preferences',
      category: 'account',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/settings/notifications'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Push notifications: DragonCandy sends push notifications to your mobile device for time-sensitive events. To enable push notifications, allow notifications when prompted on first launch, or go to Settings → Notifications → Push Notifications and toggle them on. If you missed the initial prompt, you can re-enable push notifications in your device\'s system settings under DragonCandy. Push notifications are delivered instantly and do not require the app to be open.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'push-notifications-setup',
      category: 'account',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/settings/notifications'],
    },
  },

  // -------------------------------------------------------------------------
  // PROFILE & PORTFOLIO (3 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'feature_doc',
    content:
      'Creator portfolio: your portfolio is a curated collection of your best content visible to brands on your public profile. Add portfolio items from Profile → Portfolio → Add Item. You can upload images and videos, or paste a social media URL. Each item can have a caption, platform tag, and performance stats (views, likes) if you enter them manually. Brands use your portfolio to decide whether to invite you to campaigns or accept your application. Keep it updated with your most recent and best-performing work.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'creator-portfolio',
      category: 'account',
      roles: ['content_creator'],
      page_paths: ['/profile', '/portfolio'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Brand shortlists: brands can save creators to a shortlist for future campaigns. Tap the bookmark icon on any creator\'s profile to add them to your shortlist. Access your shortlist from Dashboard → Saved Creators. Shortlists help you build a roster of go-to creators for repeat campaigns without re-searching each time. You can create multiple named shortlists (e.g., "Food Creators", "Local Influencers") to organize by niche or campaign type.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'brand-shortlists',
      category: 'campaigns',
      roles: ['business_client', 'brand'],
      page_paths: ['/dashboard', '/creators'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Social account connection: creators must connect at least one social account to be visible in the marketplace. Go to Profile → Social Accounts → Connect. Supported platforms: Instagram, TikTok, YouTube. Connecting your account grants DragonCandy read-only access to your public profile data (follower count, engagement, bio). We never post on your behalf or access private messages. Connection uses OAuth — your password is never shared with DragonCandy. Disconnecting removes your account from marketplace search.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'social-account-connection',
      category: 'account',
      roles: ['content_creator'],
      page_paths: ['/profile', '/settings/social'],
    },
  },

  // -------------------------------------------------------------------------
  // HELP & SUPPORT (3 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'help_article',
    content:
      'Getting support on DragonCandy: tap the ? icon in the header or go to dragoncandy.io/help to access the Help Center. The Help Center has articles organized by category: Getting Started, Campaigns, DragonShare, Billing, and Account. Use the search bar to find answers quickly. If you can\'t find what you need, tap "Ask Donny" for an AI-powered answer. For issues Donny can\'t resolve, use the "Contact Support" button at the bottom of any help article to open a ticket.',
    metadata: {
      source_type: 'help_article',
      source_id: 'getting-support',
      category: 'account',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/help', '/support'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'Help Center article feedback: at the bottom of every Help Center article, you can rate whether the article was helpful (thumbs up / thumbs down) and leave a written comment. This feedback is reviewed by the DragonCandy team weekly to improve documentation. If you mark an article as unhelpful, Donny will offer to answer your question directly via AI chat. Your feedback helps make DragonCandy easier for everyone.',
    metadata: {
      source_type: 'help_article',
      source_id: 'help-article-feedback',
      category: 'account',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/help', '/help/[slug]'],
    },
  },
  {
    source_type: 'help_article',
    content:
      'Support response times: Free plan — support via Help Center and Donny AI only (no human ticket support). Starter — email support, response within 2 business days. Growth — email support, response within 1 business day. Pro — priority email and chat support, response within 4 hours. Enterprise — dedicated account manager and 24/7 phone support. For urgent billing or payment issues on any plan, use the "Urgent Payment Issue" link in Settings → Billing for escalated handling.',
    metadata: {
      source_type: 'help_article',
      source_id: 'support-response-times',
      category: 'billing',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/help', '/support', '/settings/billing'],
    },
  },

  // -------------------------------------------------------------------------
  // CAMPAIGN INVITATIONS & SPONSORSHIPS (2 chunks)
  // -------------------------------------------------------------------------
  {
    source_type: 'feature_doc',
    content:
      'Campaign invitations: brands can invite specific creators to apply to a campaign without waiting for the creator to discover it. From the creator\'s profile, tap "Invite to Campaign" and select the campaign. The creator receives a push notification and a personal message from Donny explaining the opportunity. Invited creators see a special "Invited" badge on the campaign card. Invitations do not guarantee acceptance — the creator still applies formally and the brand reviews.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'campaign-invitations',
      category: 'campaigns',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/campaigns', '/creators', '/applications'],
    },
  },
  {
    source_type: 'feature_doc',
    content:
      'Campaign sponsorships: for long-term brand partnerships, brands and creators can set up a sponsorship arrangement. A sponsorship is a recurring collaboration agreement — e.g., one TikTok per week for 3 months at a fixed monthly rate. Sponsorships are created from an active collaboration: go to Collaboration → More Options → Convert to Sponsorship. Both parties agree to terms, and monthly payments are handled automatically via Stripe. Sponsorships can be paused or terminated with 14 days\' notice.',
    metadata: {
      source_type: 'feature_doc',
      source_id: 'campaign-sponsorships',
      category: 'campaigns',
      roles: ['business_client', 'brand', 'content_creator'],
      page_paths: ['/collaborations', '/sponsorships'],
    },
  },
];

// ---------------------------------------------------------------------------
// Insertion
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  console.log(`Seeding ${chunks.length} knowledge chunks into donny_knowledge...`);

  const rows = chunks.map(({ content, metadata, source_type }) => ({
    content,
    metadata,
    source_type,
    // embedding intentionally omitted — filled by backfill job (Task 3)
  }));

  // Insert in batches of 20 to avoid payload size limits
  const BATCH_SIZE = 20;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('donny_knowledge').insert(batch);

    if (error) {
      console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    console.log(`  Inserted ${inserted}/${rows.length}`);
  }

  console.log(`\nDone. ${inserted} chunks seeded successfully.`);

  // Print breakdown by category
  const byCat: Record<string, number> = {};
  for (const c of chunks) {
    const cat = c.metadata.category;
    byCat[cat] = (byCat[cat] ?? 0) + 1;
  }
  console.log('\nBreakdown by category:');
  for (const [cat, count] of Object.entries(byCat).sort()) {
    console.log(`  ${cat.padEnd(20)} ${count}`);
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
