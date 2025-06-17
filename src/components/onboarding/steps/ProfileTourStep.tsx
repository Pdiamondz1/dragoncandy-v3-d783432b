
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { User, Building, Camera, Star } from 'lucide-react';

interface ProfileTourStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator';
  onNext: () => void;
}

export const ProfileTourStep: React.FC<ProfileTourStepProps> = ({ userRole, onNext }) => {
  const profileTips = userRole === 'business_client' 
    ? [
        {
          icon: <Building className="w-5 h-5 text-pink-600" />,
          title: "Business Information",
          description: "Add your company details, industry, and website"
        },
        {
          icon: <Camera className="w-5 h-5 text-pink-600" />,
          title: "Logo & Samples",
          description: "Upload your logo and sample content for creators to reference"
        },
        {
          icon: <User className="w-5 h-5 text-pink-600" />,
          title: "Social Media Links",
          description: "Connect your social profiles to show creators your brand presence"
        }
      ]
    : [
        {
          icon: <User className="w-5 h-5 text-pink-600" />,
          title: "Creator Profile",
          description: "Showcase your skills, experience, and personality"
        },
        {
          icon: <Camera className="w-5 h-5 text-pink-600" />,
          title: "Portfolio",
          description: "Upload your best work to attract businesses"
        },
        {
          icon: <Star className="w-5 h-5 text-pink-600" />,
          title: "Skills & Rates",
          description: "Set your skills and pricing to match with relevant campaigns"
        }
      ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Complete Your Profile
        </h2>
        <p className="text-gray-600">
          A complete profile helps you {userRole === 'business_client' ? 'attract quality creators' : 'get discovered by businesses'}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {profileTips.map((tip, index) => (
          <Card key={index} className="p-4">
            <CardContent className="p-0">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {tip.icon}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{tip.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{tip.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <h3 className="font-medium text-yellow-800 mb-2">💡 Pro Tip</h3>
        <p className="text-sm text-yellow-700">
          {userRole === 'business_client' 
            ? "Profiles with complete information and sample content receive 3x more applications from creators."
            : "Creators with complete portfolios and clear skills get 5x more campaign invitations."
          }
        </p>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to={`/dashboard/${userRole === 'business_client' ? 'business' : 'creator'}/settings`}
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
