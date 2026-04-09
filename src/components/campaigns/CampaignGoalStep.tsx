
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lightbulb, Sparkles, Loader2 } from 'lucide-react';

interface CampaignGoalStepProps {
  campaignGoal: string;
  setCampaignGoal: (value: string) => void;
  onGenerateWithAI: () => void;
  isGenerating: boolean;
}

const CampaignGoalStep: React.FC<CampaignGoalStepProps> = ({
  campaignGoal,
  setCampaignGoal,
  onGenerateWithAI,
  isGenerating,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">
            2
          </div>
          Step 2: Describe Your Campaign Goal
        </CardTitle>
        <p className="text-gray-600 text-sm">
          Tell DragonCandy AI about your restaurant's content needs
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Textarea
            placeholder="Example: We just launched a new weekend brunch menu at our downtown cafe and want to drive foot traffic. We need mouth-watering food photos and short-form video reels showcasing our signature dishes — think close-up shots of our avocado toast, latte art, and the cozy interior vibe. Target local foodies and brunch lovers on Instagram and TikTok within a 15-mile radius. Budget is around $200-500 and we'd love content ready by this weekend."
            value={campaignGoal}
            onChange={(e) => setCampaignGoal(e.target.value)}
            className="min-h-[150px] resize-none"
          />
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          Be specific about your dishes, vibe, target audience, preferred platforms, budget range, and timeline for the best results.
        </div>

        <Button 
          onClick={onGenerateWithAI}
          disabled={!campaignGoal.trim() || isGenerating}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {isGenerating ? 'Generating Campaign with DragonCandy AI...' : 'Generate Campaign with DragonCandy AI'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CampaignGoalStep;
