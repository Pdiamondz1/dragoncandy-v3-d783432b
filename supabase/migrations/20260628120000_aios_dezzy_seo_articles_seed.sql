-- Seed the report-only "Dezzy — Weekly SEO Article" Founder Playbook (Domain 6, SEO/organic-discovery slice).
-- The one Domain-6 amplification lever feasible pre-DRE: drafts one publish-ready SEO article per run
-- targeting a high-intent search term for $0 organic acquisition. Idempotent on slug. Report-only
-- (allowed_proposals = []): Dezzy drafts, the founder reviews + publishes to the blog.
-- Pure seed — grounded entirely in existing read tools (get_internal_doc + get_platform_stats); no new
-- tool, no edit to aios-playbook-run, no new table/UI. The rest of Domain 6 (DRE-milestone celebration,
-- case studies, referral thank-yous, boost-performing-content) stays GATED until the DRE award engine is
-- live + the ledger/engagement tables populate.

insert into public.aios_playbooks (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals)
values
  (
    'dezzy-seo-articles',
    'Dezzy — Weekly SEO Article',
    'Draft ONE publish-ready SEO article for dragoncandy.io/blog targeting a high-intent search term for organic acquisition. FIRST pick this week''s target: call get_platform_stats (creator vs restaurant counts → which side of the marketplace to grow) and get_internal_doc (call with no path to list, then read PROJECT_CONTEXT for positioning, North Star, GTM phase, target metros, and the origin story). Choose a keyword for the side to grow, from this menu (you may also pick a closely related long-tail variant in the same intent):
- creator acquisition: "how to get paid as a food creator", "food content creator jobs near me [metro]", "how much do food influencers charge", "how to become a food content creator".
- restaurant acquisition: "best way to get social media content for my restaurant", "how to find local food influencers", "restaurant social media marketing ideas", "how to get more customers with social media".
GTM OVERRIDE: honor PROJECT_CONTEXT''s GTM rule — creators are onboarded BEFORE restaurants in a new market. If that conflicts with the raw under-supplied count, the GTM phase wins; state which rule you applied and why.
Then write the article. Output:
- the target keyword, the search intent, and which side it acquires (creator / restaurant);
- an SEO title (~60 chars, keyword-led), a meta description (~155 chars), and a URL slug;
- an H1 + a full multi-section body (H2/H3) that is GENUINELY USEFUL to the reader (real, specific how-to help — Google E-E-A-T — not thin or keyword-stuffed);
- ONE natural DragonCandy CTA, naming which page it links to;
- 2-3 suggested internal links.
The how-to substance is general expertise written for the audience (that is fine). But any DragonCandy-specific number, claim, feature, or page path must trace to get_internal_doc or get_platform_stats (a tool result), or be a clearly-marked placeholder — never invent a metric, testimonial, feature, or URL. LINKS/CTA: no tool enumerates the site''s routes or existing blog posts, so treat the CTA target and internal links as suggestions the founder confirms at publish — write any path you cannot verify from a tool as a bracketed placeholder (e.g. [CONFIRM PATH: /for-creators]), never a confident invented URL. Pre-revenue you will rarely have a DragonCandy number worth citing — that is expected; lean on useful advice, not stats.',
    'Write as Dezzy, DragonCandy''s growth agent (this sets the VOICE only; the engine identity stays Donny). Helpful, benefit-led, plain-spoken, credible (E-E-A-T) — never spammy or keyword-stuffed; the reader should get real value whether or not they sign up. Since DragonCandy has NO published case studies or testimonials yet, earn credibility through the depth and specificity of the advice — never reach for a fabricated proof point to hit the E-E-A-T bar. One clear CTA. Markdown article, no pipe tables. Never fabricate a DragonCandy stat, quote, feature, or URL — clearly-marked placeholders are fine, invented facts are not.',
    'The article has: the target keyword + search intent + which side it acquires; an SEO title; a meta description; a URL slug; an H1 + a multi-section, genuinely-useful body (not thin/keyword-stuffed); exactly one DragonCandy CTA (with its link target); and 2-3 suggested internal links. TRACEABILITY: every DragonCandy-specific number, claim, feature, and page path traces to a tool result or is a clearly-marked placeholder (e.g. [CONFIRM PATH: …]); nothing — no stat, feature, testimonial, or URL — is fabricated. The message ends with the required JSON self-assessment.',
    '[]'::jsonb
  )
on conflict (slug) do nothing;
