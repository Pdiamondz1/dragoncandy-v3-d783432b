
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { Search, Filter, Users, Star } from 'lucide-react';

interface CreatorDiscoveryStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator';
  onNext: () => void;
}

export const CreatorDiscoveryStep: React.FC<CreatorDiscoveryStepProps> = ({ onNext }) => {
  const discoveryFeatures = [
    {
      icon: <Search className="w-5 h-5 text-pink-600" />,
      title: "Search & Browse",
      description: "Find creators by skills, location, rates, and social media platforms"
    },
    {
      icon: <Filter className="w-5 h-5 text-pink-600" />,
      title: "Smart Filters",
      description: "Use advanced filters to find creators that match your exact needs"
    },
    {
      icon: <Star className="w-5 h-5 text-pink-600" />,
      title: "Reviews & Ratings",
      description: "Check creator portfolios, ratings, and reviews from other businesses"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Discover Amazing Creators
        </h2>
        <p className="text-gray-600">
          Find the perfect creators for your brand using our powerful discovery tools.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {discoveryFeatures.map((feature, index) => (
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

      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
        <h3 className="font-medium text-green-800 mb-2">🔍 Two Ways to Find Creators</h3>
        <div className="text-sm text-green-700 space-y-1">
          <p><strong>1. Campaign Applications:</strong> Post a campaign and let creators apply to you</p>
          <p><strong>2. Direct Outreach:</strong> Browse creator profiles and invite them directly</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to="/dashboard/business/creators"
          className="text-pink-600 hover:text-pink-700 text-sm font-medium flex items-center gap-2"
        >
          <Users className="w-4 h-4" />
          Browse Creators →
        </Link>
        <Button onClick={onNext} variant="outline">
          Continue Tour
        </Button>
      </div>
    </div>
  );
};
