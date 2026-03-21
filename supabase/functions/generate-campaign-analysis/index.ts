
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Campaign analysis function called');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      console.error('OpenAI API key not found');
      throw new Error('OpenAI API key not configured');
    }

    const requestBody = await req.json();
    console.log('Request body:', requestBody);
    
    const { campaignGoal } = requestBody;

    if (!campaignGoal || !campaignGoal.trim()) {
      throw new Error('Campaign goal is required');
    }

    console.log('Calling OpenAI API with goal:', campaignGoal);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: `You are a marketing expert AI that helps businesses create effective social media campaigns. 
            
            Analyze the user's campaign goal and provide a comprehensive campaign strategy WITH a full creative brief in valid JSON format with this exact structure:

            {
              "title": "Campaign title (max 60 chars)",
              "description": "Detailed campaign description (2-3 paragraphs)",
              "target_audience": "Primary target audience description",
              "goals": ["goal1", "goal2", "goal3"],
              "recommended_platforms": ["Instagram", "TikTok", "YouTube"],
              "content_types": ["Video", "Image", "Story"],
              "key_messages": ["message1", "message2", "message3"],
              "success_metrics": ["metric1", "metric2", "metric3"],
              "budget_recommendations": {
                "min": 500,
                "max": 2000,
                "reasoning": "Budget explanation"
              },
              "timeline_recommendations": {
                "preparation": "1-2 weeks",
                "execution": "2-4 weeks",
                "analysis": "1 week"
              },
              "content_ideas": [
                {
                  "concept": "Short name for the content idea",
                  "format": "Reel / TikTok / Carousel / Story / Photo",
                  "description": "Detailed description of what the creator should shoot, including setting, action, and hook",
                  "estimated_duration": "15-30 seconds"
                }
              ],
              "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
              "captions": [
                "A ready-to-post caption with emoji and CTA for the first content piece",
                "A second caption variation with different angle"
              ],
              "posting_schedule": [
                {
                  "platform": "Instagram",
                  "frequency": "3x per week",
                  "best_times": "Tue/Thu 11am, Sat 9am",
                  "content_mix": "2 Reels, 1 Carousel"
                }
              ],
              "style_direction": {
                "visual_style": "Bright, natural lighting with warm tones",
                "mood": "Energetic and authentic",
                "color_palette": "Warm earth tones with pops of brand color",
                "references": "Think casual food vlog meets polished brand content"
              }
            }

            IMPORTANT: Generate 3-5 content_ideas that are specific, actionable shot/video concepts a content creator can execute immediately. Generate 5-10 relevant hashtags. Generate 2-3 ready-to-post captions with emoji and calls to action. Generate a posting_schedule entry for each recommended platform. The style_direction should give creators clear visual guidance.

            Ensure all recommendations are practical, actionable, and tailored to the specific campaign goal. Use snake_case for field names to match the expected interface.`
          },
          {
            role: 'user',
            content: `Please analyze this campaign goal and provide a comprehensive strategy: ${campaignGoal}`
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('OpenAI error response:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('OpenAI response:', data);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from OpenAI API');
    }

    const generatedContent = data.choices[0].message.content;
    console.log('Generated content:', generatedContent);

    // Parse the JSON response
    let campaignAnalysis;
    try {
      campaignAnalysis = JSON.parse(generatedContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.error('Raw content:', generatedContent);
      throw new Error('Failed to parse campaign analysis from AI response');
    }

    // Validate required fields
    const requiredFields = ['title', 'description', 'target_audience', 'goals', 'recommended_platforms'];
    for (const field of requiredFields) {
      if (!campaignAnalysis[field]) {
        throw new Error(`Missing required field in campaign analysis: ${field}`);
      }
    }

    console.log('Campaign analysis generated successfully');
    
    return new Response(JSON.stringify({ 
      success: true, 
      analysis: campaignAnalysis 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-campaign-analysis function:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'An unexpected error occurred',
      details: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
