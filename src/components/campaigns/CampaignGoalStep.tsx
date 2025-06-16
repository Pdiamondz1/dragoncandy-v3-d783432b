
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lightbulb, Sparkles } from 'lucide-react';

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
            1
          </div>
          Step 1: Describe Your Campaign Goal
        </CardTitle>
        <p className="text-gray-600 text-sm">
          Tell DragonCandy AI about your campaign vision
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Textarea
            placeholder="Example: I want to launch a new summer product line for my sustainable fashion brand. I need to reach eco-conscious millennials and Gen Z consumers through Instagram and TikTok. The campaign should feel authentic and showcase our commitment to sustainability while driving sales for our new collection. Budget is around $1500-2500 and we want to launch by July 15th."
            value={campaignGoal}
            onChange={(e) => setCampaignGoal(e.target.value)}
            className="min-h-[150px] resize-none"
          />
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          Be specific about your goals, target audience, preferred platforms, budget range, and timeline for best results.
        </div>

        <Button 
          onClick={onGenerateWithAI}
          disabled={!campaignGoal.trim() || isGenerating}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {isGenerating ? 'Generating Campaign with DragonCandy AI...' : 'Generate Campaign with DragonCandy AI'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CampaignGoalStep;
