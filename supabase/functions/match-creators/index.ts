
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ── Scoring weights ──────────────────────────────────────────────────────────
const WEIGHTS = {
  platform_overlap: 20,   // Does creator cover the campaign's platforms?
  budget_fit: 15,         // Does creator's rate fit the campaign budget?
  skills_match: 20,       // Do creator skills align with campaign needs?
  geographic: 10,         // Same city/country as campaign owner?
  availability: 10,       // Creator available and responsive?
  ai_quality: 25,         // AI-assessed content quality & style fit
};

// ── Deterministic scoring helpers ────────────────────────────────────────────

interface CreatorProfile {
  user_id: string;
  creator_name: string;
  bio: string | null;
  skills: string[] | null;
  location: string | null;
  city: string | null;
  country: string | null;
  base_rate_per_hour: number | null;
  min_project_budget: number | null;
  availability: string | null;
  response_time: string | null;
  max_projects_per_month: number | null;
  preferred_project_duration: string | null;
  years_of_experience: number | null;
  average_rating: number | null;
  total_reviews: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
}

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  goals: string | null;
  platforms: string[] | null;
  style: string | null;
  tone: string | null;
  budget_min: number | null;
  budget_max: number | null;
  fixed_price: number | null;
  deliverables: string[] | null;
  delivery_type: string | null;
  deadline: string | null;
  user_id: string;
}

interface ScoreBreakdown {
  platform_overlap: number;
  budget_fit: number;
  skills_match: number;
  geographic: number;
  availability: number;
  ai_quality: number;
}

function getCreatorPlatforms(creator: CreatorProfile): string[] {
  const platforms: string[] = [];
  if (creator.instagram_url) platforms.push('instagram');
  if (creator.tiktok_url) platforms.push('tiktok');
  if (creator.youtube_url) platforms.push('youtube');
  if (creator.facebook_url) platforms.push('facebook');
  if (creator.linkedin_url) platforms.push('linkedin');
  if (creator.x_url) platforms.push('x', 'twitter');
  return platforms;
}

function scorePlatformOverlap(creator: CreatorProfile, campaign: Campaign): number {
  const campaignPlatforms = (campaign.platforms || []).map(p => p.toLowerCase());
  if (campaignPlatforms.length === 0) return 80; // No platform requirement = generous score

  const creatorPlatforms = getCreatorPlatforms(creator);
  if (creatorPlatforms.length === 0) return 30;

  const overlap = campaignPlatforms.filter(p =>
    creatorPlatforms.some(cp => cp.includes(p) || p.includes(cp))
  );
  const ratio = overlap.length / campaignPlatforms.length;
  return Math.round(ratio * 100);
}

function scoreBudgetFit(creator: CreatorProfile, campaign: Campaign): number {
  const creatorRate = creator.base_rate_per_hour || 0;
  const creatorMin = creator.min_project_budget || 0;
  const campaignMax = campaign.budget_max || campaign.fixed_price || 0;
  const campaignMin = campaign.budget_min || 0;

  // If no budget info on either side, neutral score
  if (campaignMax === 0 && campaignMin === 0) return 70;
  if (creatorRate === 0 && creatorMin === 0) return 60;

  // Check if creator's minimum is within campaign range
  if (creatorMin > 0 && campaignMax > 0) {
    if (creatorMin <= campaignMax) return 90;
    if (creatorMin <= campaignMax * 1.2) return 60; // Slightly over budget
    return 30; // Significantly over budget
  }

  // Estimate from hourly rate (assume ~8 hours per deliverable)
  if (creatorRate > 0 && campaignMax > 0) {
    const estimatedCost = creatorRate * 8;
    if (estimatedCost <= campaignMax) return 85;
    if (estimatedCost <= campaignMax * 1.3) return 55;
    return 25;
  }

  return 60; // Default neutral
}

function scoreSkillsMatch(creator: CreatorProfile, campaign: Campaign): number {
  const creatorSkills = (creator.skills || []).map(s => s.toLowerCase());
  if (creatorSkills.length === 0) return 30;

  // Build a set of keywords from campaign description, goals, style, deliverables
  const campaignText = [
    campaign.description,
    campaign.goals,
    campaign.style,
    campaign.tone,
    ...(campaign.deliverables || []),
    campaign.delivery_type,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!campaignText) return 60; // No campaign detail = neutral

  // Check skill keyword matches against campaign text
  let matchCount = 0;
  for (const skill of creatorSkills) {
    const skillWords = skill.replace(/[_-]/g, ' ').split(' ');
    if (skillWords.some(w => w.length > 2 && campaignText.includes(w))) {
      matchCount++;
    }
  }

  const ratio = matchCount / Math.max(creatorSkills.length, 1);
  // Scale: 0 matches = 30, all match = 100
  return Math.round(30 + ratio * 70);
}

function scoreGeographic(creator: CreatorProfile, campaignOwnerProfile: { city?: string; country?: string; location?: string } | null): number {
  if (!campaignOwnerProfile) return 50;

  const creatorCity = (creator.city || '').toLowerCase().trim();
  const creatorCountry = (creator.country || '').toLowerCase().trim();
  const creatorLocation = (creator.location || '').toLowerCase().trim();

  const ownerCity = (campaignOwnerProfile.city || '').toLowerCase().trim();
  const ownerCountry = (campaignOwnerProfile.country || '').toLowerCase().trim();
  const ownerLocation = (campaignOwnerProfile.location || '').toLowerCase().trim();

  // Same city
  if (creatorCity && ownerCity && creatorCity === ownerCity) return 100;
  // City mentioned in location string
  if (creatorLocation && ownerCity && creatorLocation.includes(ownerCity)) return 90;
  if (ownerLocation && creatorCity && ownerLocation.includes(creatorCity)) return 90;
  // Same country
  if (creatorCountry && ownerCountry && creatorCountry === ownerCountry) return 70;
  // Location strings share a word
  if (creatorLocation && ownerLocation) {
    const creatorWords = creatorLocation.split(/[\s,]+/).filter(w => w.length > 2);
    const ownerWords = ownerLocation.split(/[\s,]+/).filter(w => w.length > 2);
    if (creatorWords.some(w => ownerWords.includes(w))) return 65;
  }

  return 40; // Different/unknown location
}

function scoreAvailability(creator: CreatorProfile): number {
  let score = 50;

  const avail = (creator.availability || '').toLowerCase();
  if (avail.includes('full') || avail.includes('available') || avail.includes('open')) {
    score += 30;
  } else if (avail.includes('part') || avail.includes('limited')) {
    score += 15;
  }

  const responseTime = (creator.response_time || '').toLowerCase();
  if (responseTime.includes('hour') || responseTime.includes('immediate') || responseTime.includes('same day')) {
    score += 15;
  } else if (responseTime.includes('day') || responseTime.includes('24')) {
    score += 10;
  }

  if ((creator.years_of_experience || 0) >= 3) score += 5;

  return Math.min(100, score);
}

// ── Batch AI scoring ─────────────────────────────────────────────────────────

interface AIMatchResult {
  creator_id: string;
  quality_score: number;
  reasons: string[];
  concerns: string[];
  analysis: string;
}

async function batchAIScore(
  campaign: Campaign,
  creators: CreatorProfile[],
): Promise<Map<string, AIMatchResult>> {
  const results = new Map<string, AIMatchResult>();

  // Process in batches of 5 to stay within token limits while being much faster
  const BATCH_SIZE = 5;
  const batches: CreatorProfile[][] = [];
  for (let i = 0; i < creators.length; i += BATCH_SIZE) {
    batches.push(creators.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const creatorSummaries = batch.map((c, idx) => {
      const platforms = getCreatorPlatforms(c);
      return `Creator ${idx + 1} (ID: ${c.user_id}):
  Name: ${c.creator_name}
  Bio: ${(c.bio || 'No bio').substring(0, 200)}
  Skills: ${(c.skills || []).join(', ') || 'None listed'}
  Location: ${c.location || c.city || 'Not specified'}
  Rate: $${c.base_rate_per_hour || 'N/A'}/hr
  Platforms: ${platforms.join(', ') || 'None'}
  Experience: ${c.years_of_experience || 'N/A'} years
  Rating: ${c.average_rating || 'N/A'} (${c.total_reviews || 0} reviews)`;
    }).join('\n\n');

    const prompt = `You are scoring how well each creator fits this campaign on CONTENT QUALITY & STYLE FIT only.

CAMPAIGN:
  Title: ${campaign.title}
  Description: ${(campaign.description || 'No description').substring(0, 300)}
  Goals: ${(campaign.goals || 'Not specified').substring(0, 200)}
  Platforms: ${(campaign.platforms || []).join(', ') || 'Not specified'}
  Style: ${campaign.style || 'Not specified'}
  Tone: ${campaign.tone || 'Not specified'}
  Deliverables: ${(campaign.deliverables || []).join(', ') || 'Not specified'}

CREATORS:
${creatorSummaries}

For EACH creator, score their content quality & style fit from 0-100. Consider:
- How well their skills/bio match the campaign's style and tone
- Whether their experience suggests quality content delivery
- Portfolio/platform relevance to what the campaign needs
- Overall creative fit

Respond with a JSON array. Each element must have:
- "creator_id": the user_id string
- "quality_score": number 0-100
- "reasons": array of 2-3 short strings for good fit
- "concerns": array of 1-2 short strings for potential issues
- "analysis": one sentence summary

Respond ONLY with a valid JSON array, no markdown formatting or code blocks.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at matching content creators with campaigns. Respond with valid JSON arrays only. Be generous but honest in scoring — even partial fits should score 30-60.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        console.error('OpenAI batch error:', response.status);
        // Fallback: give neutral AI scores
        for (const c of batch) {
          results.set(c.user_id, {
            creator_id: c.user_id,
            quality_score: 50,
            reasons: ['Creator profile available', 'Content quality assessment pending'],
            concerns: ['AI analysis unavailable'],
            analysis: 'Creator is available — manual review recommended.',
          });
        }
        continue;
      }

      const aiResponse = await response.json();
      let content = (aiResponse.choices?.[0]?.message?.content || '').trim();

      // Clean markdown fences
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      try {
        const parsed: AIMatchResult[] = JSON.parse(content);
        for (const result of parsed) {
          results.set(result.creator_id, {
            creator_id: result.creator_id,
            quality_score: Math.max(0, Math.min(100, result.quality_score || 50)),
            reasons: Array.isArray(result.reasons) ? result.reasons : ['Creator available'],
            concerns: Array.isArray(result.concerns) ? result.concerns : [],
            analysis: result.analysis || 'Match analysis completed.',
          });
        }
      } catch (parseError) {
        console.error('Batch JSON parse error:', parseError);
        for (const c of batch) {
          results.set(c.user_id, {
            creator_id: c.user_id,
            quality_score: 45,
            reasons: ['Creator available for collaboration'],
            concerns: ['Detailed analysis unavailable'],
            analysis: 'Creator available — manual review recommended.',
          });
        }
      }
    } catch (fetchError) {
      console.error('Batch fetch error:', fetchError);
      for (const c of batch) {
        results.set(c.user_id, {
          creator_id: c.user_id,
          quality_score: 45,
          reasons: ['Creator available for collaboration'],
          concerns: ['AI analysis failed'],
          analysis: 'Creator available — manual review recommended.',
        });
      }
    }
  }

  return results;
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting enhanced match-creators function');

    const { campaignId } = await req.json();
    console.log('Campaign ID:', campaignId);

    if (!campaignId) {
      throw new Error('Campaign ID is required');
    }

    // Fetch campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) {
      console.error('Error fetching campaign:', campaignError);
      throw new Error(`Failed to fetch campaign: ${campaignError.message}`);
    }

    console.log('Campaign fetched:', campaign?.title);

    // Fetch campaign owner profile for geographic scoring
    const { data: ownerProfile } = await supabase
      .from('business_profiles')
      .select('city, country, business_address')
      .eq('user_id', campaign.user_id)
      .single();

    const ownerGeo = ownerProfile ? {
      city: ownerProfile.city || '',
      country: ownerProfile.country || '',
      location: ownerProfile.business_address || '',
    } : null;

    // Clear existing matches for this campaign
    await supabase
      .from('campaign_matches')
      .delete()
      .eq('campaign_id', campaignId);

    // Fetch available creators with full profile data
    const { data: creators, error: creatorsError } = await supabase
      .from('creator_profiles')
      .select('user_id, creator_name, bio, skills, location, city, country, base_rate_per_hour, min_project_budget, availability, response_time, max_projects_per_month, preferred_project_duration, years_of_experience, average_rating, total_reviews, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url')
      .eq('is_completed', true);

    if (creatorsError) {
      console.error('Error fetching creators:', creatorsError);
      throw new Error(`Failed to fetch creators: ${creatorsError.message}`);
    }

    console.log('Creators fetched:', creators?.length || 0);

    if (!creators || creators.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          matches: [],
          message: 'No available creators found'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Compute deterministic scores for all creators
    const deterministicScores = creators.map(creator => ({
      creator,
      platform: scorePlatformOverlap(creator as CreatorProfile, campaign as Campaign),
      budget: scoreBudgetFit(creator as CreatorProfile, campaign as Campaign),
      skills: scoreSkillsMatch(creator as CreatorProfile, campaign as Campaign),
      geographic: scoreGeographic(creator as CreatorProfile, ownerGeo),
      availability: scoreAvailability(creator as CreatorProfile),
    }));

    // Step 2: Pre-filter — only send top candidates to AI (saves tokens & time)
    // Compute a preliminary score without AI, keep top 20 (or all if fewer)
    const withPreliminary = deterministicScores.map(d => {
      const prelim = (
        d.platform * (WEIGHTS.platform_overlap / 100) +
        d.budget * (WEIGHTS.budget_fit / 100) +
        d.skills * (WEIGHTS.skills_match / 100) +
        d.geographic * (WEIGHTS.geographic / 100) +
        d.availability * (WEIGHTS.availability / 100)
      ) / (1 - WEIGHTS.ai_quality / 100); // Normalize to 0-100 range before AI
      return { ...d, preliminary: Math.round(prelim) };
    });

    withPreliminary.sort((a, b) => b.preliminary - a.preliminary);
    const topCandidates = withPreliminary.slice(0, 20);

    console.log(`Pre-filtered to ${topCandidates.length} candidates (from ${creators.length})`);

    // Step 3: Batch AI scoring for top candidates
    const aiResults = await batchAIScore(
      campaign as Campaign,
      topCandidates.map(c => c.creator as CreatorProfile),
    );

    // Step 4: Compute final weighted scores and build match records
    const matches = [];

    for (const candidate of topCandidates) {
      const aiResult = aiResults.get(candidate.creator.user_id);
      const aiScore = aiResult?.quality_score || 50;

      const breakdown: ScoreBreakdown = {
        platform_overlap: candidate.platform,
        budget_fit: candidate.budget,
        skills_match: candidate.skills,
        geographic: candidate.geographic,
        availability: candidate.availability,
        ai_quality: aiScore,
      };

      const finalScore = Math.round(
        breakdown.platform_overlap * (WEIGHTS.platform_overlap / 100) +
        breakdown.budget_fit * (WEIGHTS.budget_fit / 100) +
        breakdown.skills_match * (WEIGHTS.skills_match / 100) +
        breakdown.geographic * (WEIGHTS.geographic / 100) +
        breakdown.availability * (WEIGHTS.availability / 100) +
        breakdown.ai_quality * (WEIGHTS.ai_quality / 100)
      );

      // Ensure minimum score of 20
      const clampedScore = Math.max(20, Math.min(100, finalScore));

      const matchReasons = {
        reasons: aiResult?.reasons || ['Creator available for collaboration'],
        concerns: aiResult?.concerns || [],
        score_breakdown: breakdown,
        weights: WEIGHTS,
      };

      const { error: insertError } = await supabase
        .from('campaign_matches')
        .insert({
          campaign_id: campaignId,
          creator_id: candidate.creator.user_id,
          match_score: clampedScore,
          match_reasons: matchReasons,
          ai_analysis: aiResult?.analysis || 'Match analysis completed.',
        });

      if (insertError) {
        console.error('Error inserting match:', insertError);
      } else {
        matches.push({
          creator_id: candidate.creator.user_id,
          creator_name: candidate.creator.creator_name,
          match_score: clampedScore,
          reasons: aiResult?.reasons || ['Creator available'],
          concerns: aiResult?.concerns || [],
          analysis: aiResult?.analysis || 'Match analysis completed.',
          score_breakdown: breakdown,
        });
      }
    }

    // Sort by final score
    matches.sort((a, b) => b.match_score - a.match_score);

    console.log('Generated matches:', matches.length);

    return new Response(
      JSON.stringify({
        success: true,
        matches,
        message: `Generated ${matches.length} creator matches`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in match-creators function:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
