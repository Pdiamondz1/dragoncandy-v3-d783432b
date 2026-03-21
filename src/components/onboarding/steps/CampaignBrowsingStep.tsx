
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { Search, Filter, Heart, DollarSign } from 'lucide-react';

interface CampaignBrowsingStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator' | 'brand';
  onNext: () => void;
}

export const CampaignBrowsingStep: React.FC<CampaignBrowsingStepProps> = ({ onNext }) => {
  const browsingFeatures = [
    {
      icon: <Search className="w-5 h-5 text-pink-600" />,
      title: "Smart Search",
      description: "Find campaigns that match your skills using our intelligent search filters"
    },
    {
      icon: <Filter className="w-5 h-5 text-pink-600" />,
      title: "Filter by Preferences",
      description: "Filter by budget, timeline, location, and project type to find perfect matches"
    },
    {
      icon: <Heart className="w-5 h-5 text-pink-600" />,
      title: "Save Favorites",
      description: "Bookmark interesting campaigns and get notified when similar ones are posted"
    },
    {
      icon: <DollarSign className="w-5 h-5 text-pink-600" />,
      title: "Budget Transparency",
      description: "See budget ranges upfront so you can focus on campaigns within your rate"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Browse Campaign Marketplace
        </h2>
        <p className="text-gray-600">
          Discover opportunities that align with your skills and creative vision.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {browsingFeatures.map((feature, index) => (
          <Card key={index} className="p-4">
            <CardContent className="p-0">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{feature.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
        <h3 className="font-medium text-purple-800 mb-2">🎯 Pro Tip</h3>
        <p className="text-sm text-purple-700">
          Set up email alerts for campaigns matching your criteria so you never miss the perfect opportunity.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to="/dashboard/creator/campaigns"
          className="text-pink-600 hover:text-pink-700 text-sm font-medium"
        >
          Browse Campaigns Now →
        </Link>
        <Button onClick={onNext} variant="outline">
          Continue Tour
        </Button>
      </div>
    </div>
  );
};
