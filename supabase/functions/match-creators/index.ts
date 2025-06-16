
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { campaignId } = await req.json()
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      throw new Error(`Failed to fetch campaign: ${campaignError.message}`)
    }

    // Get available creators based on campaign platforms and requirements
    const { data: creators, error: creatorsError } = await supabaseClient
      .rpc('get_available_creators', {
        campaign_platforms: campaign.platforms,
        required_skills: null // We'll let AI analyze skills match
      })

    if (creatorsError) {
      throw new Error(`Failed to fetch creators: ${creatorsError.message}`)
    }

    // Prepare data for OpenAI analysis
    const campaignContext = {
      title: campaign.title,
      description: campaign.description,
      goals: campaign.goals,
      platforms: campaign.platforms,
      deliverables: campaign.deliverables,
      style: campaign.style,
      tone: campaign.tone,
      budget_min: campaign.budget_min,
      budget_max: campaign.budget_max
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an AI expert in creator-brand matching for marketing campaigns. Analyze the campaign requirements and creator profiles to provide matching scores and reasoning.
            
            For each creator, provide:
            1. A match score between 0.0 and 1.0 (where 1.0 is perfect match)
            2. Specific reasons why they're a good match
            3. Any concerns or gaps
            
            Consider these factors:
            - Platform expertise alignment
            - Skills relevant to campaign needs
            - Portfolio quality and relevance
            - Rate compatibility with budget
            - Geographic location if relevant
            - Creator's bio and brand alignment
            
            Return ONLY a valid JSON object with this structure:
            {
              "matches": [
                {
                  "creator_id": "uuid",
                  "match_score": 0.85,
                  "reasons": ["Excellent Instagram expertise", "Portfolio shows similar brand work"],
                  "concerns": ["Rate might be above budget"],
                  "analysis": "This creator shows strong alignment with your campaign goals..."
                }
              ]
            }`
          },
          {
            role: 'user',
            content: `Campaign: ${JSON.stringify(campaignContext, null, 2)}
            
            Creators to analyze: ${JSON.stringify(creators.map(c => ({
              id: c.id,
              name: c.creator_name,
              bio: c.bio,
              skills: c.skills,
              location: c.location,
              rate: c.base_rate_per_hour,
              platforms: {
                instagram: !!c.instagram_url,
                tiktok: !!c.tiktok_url,
                youtube: !!c.youtube_url,
                facebook: !!c.facebook_url,
                linkedin: !!c.linkedin_url,
                x: !!c.x_url
              }
            })), null, 2)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.statusText}`)
    }

    const aiResult = await openaiResponse.json()
    const analysisResult = JSON.parse(aiResult.choices[0].message.content)

    // Store matches in database
    const matchesToStore = analysisResult.matches.map((match: any) => ({
      campaign_id: campaignId,
      creator_id: match.creator_id,
      match_score: match.match_score,
      match_reasons: {
        reasons: match.reasons,
        concerns: match.concerns
      },
      ai_analysis: match.analysis
    }))

    // Clear existing matches for this campaign
    await supabaseClient
      .from('campaign_matches')
      .delete()
      .eq('campaign_id', campaignId)

    // Insert new matches
    const { error: insertError } = await supabaseClient
      .from('campaign_matches')
      .insert(matchesToStore)

    if (insertError) {
      throw new Error(`Failed to store matches: ${insertError.message}`)
    }

    // Return top 5 matches sorted by score
    const topMatches = analysisResult.matches
      .sort((a: any, b: any) => b.match_score - a.match_score)
      .slice(0, 5)

    return new Response(
      JSON.stringify({ matches: topMatches }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in match-creators function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
