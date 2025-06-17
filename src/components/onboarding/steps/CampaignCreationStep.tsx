
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { PlusCircle, Target, Calendar, DollarSign } from 'lucide-react';

interface CampaignCreationStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator';
  onNext: () => void;
}

export const CampaignCreationStep: React.FC<CampaignCreationStepProps> = ({ onNext }) => {
  const campaignSteps = [
    {
      icon: <Target className="w-5 h-5 text-pink-600" />,
      title: "Define Your Goals",
      description: "Set clear objectives for your campaign (brand awareness, product launch, etc.)"
    },
    {
      icon: <DollarSign className="w-5 h-5 text-pink-600" />,
      title: "Set Your Budget",
      description: "Determine your budget range to attract the right creators"
    },
    {
      icon: <Calendar className="w-5 h-5 text-pink-600" />,
      title: "Choose Timeline",
      description: "Set realistic deadlines for deliverables and campaign completion"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Create Your First Campaign
        </h2>
        <p className="text-gray-600">
          Campaigns are how you connect with creators and get amazing content made for your brand.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {campaignSteps.map((step, index) => (
          <Card key={index} className="p-4">
            <CardContent className="p-0">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {step.icon}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{step.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-medium text-blue-800 mb-2">🎯 Campaign Wizard</h3>
        <p className="text-sm text-blue-700">
          Our step-by-step campaign wizard will guide you through creating your first campaign. 
          It takes about 10 minutes and ensures you provide all the details creators need.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to="/dashboard/business/campaigns/create"
          className="text-pink-600 hover:text-pink-700 text-sm font-medium flex items-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          Create Campaign Now →
        </Link>
        <Button onClick={onNext} variant="outline">
          Continue Tour
        </Button>
      </div>
    </div>
  );
};
