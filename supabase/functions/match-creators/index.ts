
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting match-creators function');
    
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

    // Clear existing matches for this campaign
    await supabase
      .from('campaign_matches')
      .delete()
      .eq('campaign_id', campaignId);

    // Fetch available creators
    const { data: creators, error: creatorsError } = await supabase
      .from('creator_profiles')
      .select('*')
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
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate AI analysis for each creator
    const matches = [];

    for (const creator of creators) {
      try {
        console.log('Analyzing creator:', creator.creator_name);

        const prompt = `Analyze how well this creator matches the campaign requirements:

Campaign: ${campaign.title}
Description: ${campaign.description || 'No description provided'}
Goals: ${campaign.goals || 'No goals specified'}
Platforms: ${campaign.platforms?.join(', ') || 'Not specified'}
Style: ${campaign.style || 'Not specified'}
Tone: ${campaign.tone || 'Not specified'}
Budget: $${campaign.budget_min || 0} - $${campaign.budget_max || 'unlimited'}

Creator: ${creator.creator_name}
Bio: ${creator.bio || 'No bio provided'}
Skills: ${creator.skills?.join(', ') || 'No skills listed'}
Location: ${creator.location || 'Not specified'}
Rate: $${creator.base_rate_per_hour || 'Not specified'}/hour
Platforms: ${[
  creator.instagram_url ? 'Instagram' : null,
  creator.tiktok_url ? 'TikTok' : null,
  creator.youtube_url ? 'YouTube' : null,
  creator.facebook_url ? 'Facebook' : null,
  creator.linkedin_url ? 'LinkedIn' : null,
  creator.x_url ? 'X/Twitter' : null
].filter(Boolean).join(', ') || 'No platforms specified'}

Provide a match analysis in JSON format with:
- match_score: number between 0-100 (be generous, even partial matches should score 30-70)
- reasons: array of strings explaining why this is a good match
- concerns: array of strings explaining potential issues
- analysis: detailed text explanation

Important: Even if the match isn't perfect, provide a meaningful score (minimum 25) if the creator could potentially work on this campaign. Focus on adaptability and transferable skills.

Respond ONLY with valid JSON, no markdown formatting.`;

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
                content: 'You are an expert at matching creators with campaigns. Always respond with valid JSON only, no markdown formatting or code blocks. Be generous with scoring - focus on potential and adaptability.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          console.error('OpenAI API error:', response.status, response.statusText);
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const aiResponse = await response.json();
        console.log('Raw AI response for', creator.creator_name, ':', aiResponse.choices?.[0]?.message?.content);

        let analysisResult;
        const aiContent = aiResponse.choices?.[0]?.message?.content;

        if (!aiContent) {
          throw new Error('No content in AI response');
        }

        // Clean the response - remove any markdown formatting
        let cleanedContent = aiContent.trim();
        
        // Remove markdown code blocks if present
        if (cleanedContent.startsWith('```json')) {
          cleanedContent = cleanedContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        try {
          analysisResult = JSON.parse(cleanedContent);
        } catch (parseError) {
          console.error('JSON parse error for creator', creator.creator_name, ':', parseError);
          console.error('Cleaned content was:', cleanedContent);
          
          // Fallback: create a generous match result
          analysisResult = {
            match_score: 45,
            reasons: ['Creator available for collaboration', 'Adaptable skill set'],
            concerns: ['Detailed analysis unavailable', 'Requires manual review'],
            analysis: 'This creator is available and may be suitable for your campaign. Manual review recommended to assess fit.'
          };
        }

        // Validate and ensure minimum scoring
        const matchScore = Math.max(25, Math.min(100, analysisResult.match_score || 45));
        const reasons = Array.isArray(analysisResult.reasons) ? analysisResult.reasons : ['Creator available for collaboration'];
        const concerns = Array.isArray(analysisResult.concerns) ? analysisResult.concerns : ['Manual review recommended'];
        const analysis = analysisResult.analysis || 'Creator analysis completed - review details for compatibility assessment';

        // Store the match in database
        const { error: insertError } = await supabase
          .from('campaign_matches')
          .insert({
            campaign_id: campaignId,
            creator_id: creator.user_id,
            match_score: matchScore,
            match_reasons: { reasons, concerns },
            ai_analysis: analysis,
          });

        if (insertError) {
          console.error('Error inserting match:', insertError);
        } else {
          matches.push({
            creator_id: creator.user_id,
            creator_name: creator.creator_name,
            match_score: matchScore,
            reasons,
            concerns,
            analysis
          });
        }

      } catch (creatorError) {
        console.error('Error analyzing creator', creator.creator_name, ':', creatorError);
        
        // Add a generous fallback match even if AI analysis fails
        const fallbackMatch = {
          creator_id: creator.user_id,
          creator_name: creator.creator_name,
          match_score: 35,
          reasons: ['Creator available for collaboration', 'Profile completed'],
          concerns: ['AI analysis failed', 'Manual review required'],
          analysis: 'Creator is available and has a completed profile. Manual assessment recommended to determine campaign fit.'
        };

        // Try to insert fallback match
        const { error: insertError } = await supabase
          .from('campaign_matches')
          .insert({
            campaign_id: campaignId,
            creator_id: creator.user_id,
            match_score: 35,
            match_reasons: { reasons: fallbackMatch.reasons, concerns: fallbackMatch.concerns },
            ai_analysis: fallbackMatch.analysis,
          });

        if (!insertError) {
          matches.push(fallbackMatch);
        }
      }
    }

    // Sort matches by score
    matches.sort((a, b) => b.match_score - a.match_score);

    console.log('Generated matches:', matches.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        matches,
        message: `Generated ${matches.length} creator matches`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
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
