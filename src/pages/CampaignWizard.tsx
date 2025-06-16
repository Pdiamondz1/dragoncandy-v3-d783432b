
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Sparkles, Users, Clock, DollarSign, Target } from 'lucide-react';

const CampaignWizard: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const steps = [
    { number: 1, title: 'Campaign Goal', active: true },
    { number: 2, title: 'AI Analysis', active: false },
    { number: 3, title: 'Customize', active: false },
    { number: 4, title: 'Timeline & Budget', active: false },
    { number: 5, title: 'Finalize', active: false },
  ];

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

  const handleGenerateWithAI = async () => {
    setIsGenerating(true);
    // TODO: Implement AI generation with OpenAI
    setTimeout(() => {
      setIsGenerating(false);
      // Move to next step after AI generation
      setCurrentStep(2);
    }, 2000);
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate('/dashboard/business/campaigns');
    }
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Campaign Wizard</h1>
            <p className="text-gray-600">
              Let DragonCandy AI analyze your goals and create the perfect campaign structure
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center space-x-4">
              {steps.map((step, index) => (
                <React.Fragment key={step.number}>
                  <div className="flex flex-col items-center">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                      ${step.number <= currentStep 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 text-gray-600'
                      }
                    `}>
                      {step.number}
                    </div>
                    <span className={`
                      text-xs mt-1 font-medium
                      ${step.number <= currentStep ? 'text-blue-600' : 'text-gray-500'}
                    `}>
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`
                      w-8 h-0.5 
                      ${step.number < currentStep ? 'bg-blue-600' : 'bg-gray-200'}
                    `} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step 1: Campaign Goal */}
          {currentStep === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2">
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
                      onClick={handleGenerateWithAI}
                      disabled={!campaignGoal.trim() || isGenerating}
                      className="w-full bg-pink-500 hover:bg-pink-600 text-white"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {isGenerating ? 'Generating Campaign with DragonCandy AI...' : 'Generate Campaign with DragonCandy AI'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
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
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={handleBack}>
              {currentStep === 1 ? 'Back to Campaigns' : 'Previous Step'}
            </Button>
            
            {currentStep > 1 && (
              <Button onClick={handleNext} disabled={currentStep >= 5}>
                {currentStep === 5 ? 'Create Campaign' : 'Next Step'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignWizard;
