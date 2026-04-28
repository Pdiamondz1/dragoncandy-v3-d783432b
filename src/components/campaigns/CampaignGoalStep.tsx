
import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lightbulb, Sparkles, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

const EXAMPLES = [
  {
    label: '🍳 Brunch Launch',
    text: 'We just launched a new weekend brunch menu at our downtown cafe and want to drive foot traffic this month. We need mouth-watering food photos and short-form video reels showcasing our signature dishes — think close-up shots of our avocado toast, latte art, and the cozy interior vibe. Target local foodies and brunch lovers on Instagram and TikTok within a 15-mile radius. Budget is around $200-500 and we\'d love content ready by this weekend.',
  },
  {
    label: '🍕 Grand Opening',
    text: 'We\'re opening a new pizza restaurant next month and want to build buzz before launch day. We need a creator to film the kitchen prep, capture the first customers, and create hype reels. Target local food lovers on Instagram and TikTok. Budget is $300-600.',
  },
  {
    label: '🌮 Seasonal Special',
    text: 'We have a limited-time summer taco special and want to drive orders this week. Need vibrant food photography and a 15-second reel showing the taco being made. Target our neighborhood on Instagram. Budget is $150-300, need it by Friday.',
  },
];

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleUseExample = (text: string) => {
    setCampaignGoal(text);
    toast.success('Example loaded — edit it to match your restaurant!');
    textareaRef.current?.focus();
  };

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
            ref={textareaRef}
            placeholder="Example: We just launched a new weekend brunch menu at our downtown cafe and want to drive foot traffic. We need mouth-watering food photos and short-form video reels showcasing our signature dishes — think close-up shots of our avocado toast, latte art, and the cozy interior vibe. Target local foodies and brunch lovers on Instagram and TikTok within a 15-mile radius. Budget is around $200-500 and we'd love content ready by this weekend."
            value={campaignGoal}
            onChange={(e) => setCampaignGoal(e.target.value)}
            className="min-h-[200px] sm:min-h-[150px] resize-none text-base"
          />
        </div>

        {!campaignGoal && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Copy className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
              <span className="text-sm text-gray-500">
                Pick an example below and edit it to match your restaurant
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => handleUseExample(example.text)}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-full bg-gray-50 hover:bg-teal-50 text-sm text-gray-600 hover:text-teal-600 transition-colors border border-gray-200 hover:border-teal-300 text-center sm:text-left"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-sm text-gray-600">
          <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
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
          {isGenerating ? 'Generating Campaign with DragonCandy AI…' : 'Generate Campaign with DragonCandy AI'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CampaignGoalStep;
