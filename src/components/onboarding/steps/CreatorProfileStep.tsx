
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { User, Camera, Star, Award } from 'lucide-react';

interface CreatorProfileStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator' | 'brand';
  onNext: () => void;
}

export const CreatorProfileStep: React.FC<CreatorProfileStepProps> = ({ onNext }) => {
  const profileElements = [
    {
      icon: <User className="w-5 h-5 text-pink-600" />,
      title: "Professional Bio",
      description: "Write a compelling bio that showcases your personality and expertise"
    },
    {
      icon: <Camera className="w-5 h-5 text-pink-600" />,
      title: "Portfolio Showcase",
      description: "Upload your best work samples to attract potential clients"
    },
    {
      icon: <Star className="w-5 h-5 text-pink-600" />,
      title: "Skills & Rates",
      description: "Define your skills and set competitive rates for your services"
    },
    {
      icon: <Award className="w-5 h-5 text-pink-600" />,
      title: "Social Proof",
      description: "Connect your social media accounts to show your online presence"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Build Your Creator Profile
        </h2>
        <p className="text-gray-600">
          A strong profile helps you stand out and attract the right opportunities.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {profileElements.map((element, index) => (
          <Card key={index} className="p-4">
            <CardContent className="p-0">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {element.icon}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{element.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{element.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
        <h3 className="font-medium text-green-800 mb-2">✨ Creator Success</h3>
        <p className="text-sm text-green-700">
          Creators with complete profiles receive 4x more project invitations and earn 60% higher rates on average.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to="/dashboard/creator/settings"
          className="text-pink-600 hover:text-pink-700 text-sm font-medium"
        >
          Complete Profile Now →
        </Link>
        <Button onClick={onNext} variant="outline">
          Continue Tour
        </Button>
      </div>
    </div>
  );
};
