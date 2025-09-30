
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Sparkles, Users, Target, TrendingUp } from 'lucide-react';

interface WelcomeStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator' | 'brand';
  onNext: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ userRole, onNext }) => {
  const { profile } = useAuth();

  const businessFeatures = [
    {
      icon: <Target className="w-6 h-6 text-pink-600" />,
      title: "Create Campaigns",
      description: "Launch targeted campaigns to reach your audience"
    },
    {
      icon: <Users className="w-6 h-6 text-pink-600" />,
      title: "Find Creators",
      description: "Connect with talented content creators"
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-pink-600" />,
      title: "Track Performance",
      description: "Monitor campaign success and ROI"
    }
  ];

  const creatorFeatures = [
    {
      icon: <Sparkles className="w-6 h-6 text-pink-600" />,
      title: "Showcase Skills",
      description: "Build an impressive portfolio profile"
    },
    {
      icon: <Target className="w-6 h-6 text-pink-600" />,
      title: "Apply to Campaigns",
      description: "Find projects that match your expertise"
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-pink-600" />,
      title: "Build Reputation",
      description: "Earn reviews and grow your creator brand"
    }
  ];

  const features = (userRole === 'business_client' || userRole === 'brand') ? businessFeatures : creatorFeatures;
  const roleName = (userRole === 'business_client' || userRole === 'brand') ? 'Business' : 'Creator';

  return (
    <div className="text-center space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}!
        </h2>
        <p className="text-lg text-gray-600">
          You're joining DragonCandy as a <strong>{roleName}</strong>. 
          Let's explore what you can accomplish on our platform.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
        {features.map((feature, index) => (
          <div key={index} className="p-6 border border-gray-200 rounded-lg">
            <div className="flex justify-center mb-4">
              {feature.icon}
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
            <p className="text-sm text-gray-600">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-pink-50 p-6 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2">What's Next?</h3>
        <p className="text-gray-600 mb-4">
          This quick tutorial will guide you through the essential features to get you started. 
          It takes about 5 minutes and will help you make the most of DragonCandy.
        </p>
        <Button 
          onClick={onNext}
          className="bg-pink-600 hover:bg-pink-700"
        >
          Let's Get Started!
        </Button>
      </div>
    </div>
  );
};
