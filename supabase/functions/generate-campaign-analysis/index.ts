
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CampaignAnalysisRequest {
  campaignGoal: string;
}

interface CampaignAnalysisResponse {
  title: string;
  description: string;
  goals: string;
  targetAudience: string;
  platforms: string[];
  timeline: string;
  style: string;
  tone: string;
  deliverables: string[];
  budgetRecommendation: string;
}

serve(async (req) => {
  console.log('Campaign analysis function called');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaignGoal }: CampaignAnalysisRequest = await req.json();
    console.log('Received campaign goal:', campaignGoal);

    const systemPrompt = `You are DragonCandy AI, an expert campaign strategist specializing in social media marketing. Analyze the user's campaign goal and generate a comprehensive campaign strategy.

Return your response as a JSON object with these exact keys:
- title: A compelling, specific campaign title (max 60 characters)
- description: Detailed campaign description (2-3 sentences)
- goals: Specific, measurable campaign objectives
- targetAudience: Detailed target audience description
- platforms: Array of recommended social media platforms
- timeline: Recommended campaign duration and key milestones
- style: Visual and creative style recommendations
- tone: Brand voice and messaging tone
- deliverables: Array of specific content deliverables needed
- budgetRecommendation: Suggested budget range and allocation

Make recommendations specific, actionable, and tailored to the campaign goal provided.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Campaign Goal: ${campaignGoal}` }
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('OpenAI response received');
    
    const generatedContent = data.choices[0].message.content;
    console.log('Generated content:', generatedContent);
    
    // Parse the JSON response from OpenAI
    let analysisResult: CampaignAnalysisResponse;
    try {
      analysisResult = JSON.parse(generatedContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      throw new Error('Invalid response format from AI');
    }

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-campaign-analysis function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
