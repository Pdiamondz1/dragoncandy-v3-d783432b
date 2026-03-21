
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Target, Users, Clock, DollarSign, Sparkles } from 'lucide-react';

const CampaignWizardSidebar: React.FC = () => {
  const tips = [
    {
      icon: Target,
      title: 'Be Specific About Goals',
      description: 'Instead of "increase awareness", try "drive 50 new customers to our July grand opening"'
    },
    {
      icon: Users,
      title: 'Define Your Audience',
      description: 'Target "health-conscious millennials who work out 3+ times per week" vs just "fitness enthusiasts"'
    },
    {
      icon: Clock,
      title: 'Include Timeline Context',
      description: 'Mention seasonal relevance: "back-to-school campaign for August" or "holiday shopping push"'
    },
    {
      icon: DollarSign,
      title: 'Share Budget Range',
      description: 'Give a realistic range like "$500-2000" to get better platform and creator recommendations'
    },
    {
      icon: Sparkles,
      title: 'Describe Desired Style',
      description: 'Be descriptive: "minimalist and elegant" or "bold, energetic, and colorful"'
    }
  ];

  const examples = [
    {
      category: 'Restaurant/Food',
      content: '"I want to promote our new vegan breakfast menu to health-conscious professionals aged 25-40. Looking for Instagram posts and stories that feel fresh and appetizing. Budget is around $800-1200 and we want to launch next month."'
    },
    {
      category: 'Fitness/Wellness',
      content: '"We\'re launching a new yoga studio in downtown and need to attract busy professionals who want stress relief after work. Need authentic content that shows our calming atmosphere and expert instructors. Budget: $1000-1500."'
    },
    {
      category: 'Fashion/Beauty',
      content: '"Our sustainable fashion brand is releasing a summer collection. We want to reach eco-conscious Gen Z shoppers through TikTok and Instagram. Looking for diverse creators who can show how our pieces work in real life. Budget: $2000-3000."'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Tips Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-600">
            <Lightbulb className="h-5 w-5" />
            Tips for Better AI Campaign Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tips.map((tip, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center gap-2">
                <tip.icon className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">{tip.title}</span>
              </div>
              <p className="text-xs text-gray-600 ml-6">{tip.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Examples Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-green-600">Example Prompts That Work Well</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {examples.map((example, index) => (
            <div key={index} className="space-y-2">
              <Badge variant="outline" className="text-xs">
                {example.category}
              </Badge>
              <p className="text-xs text-gray-700 italic leading-relaxed">
                {example.content}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignWizardSidebar;
