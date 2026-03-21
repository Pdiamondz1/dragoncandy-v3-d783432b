
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { Upload, MessageCircle, Star, Repeat } from 'lucide-react';

interface ProjectManagementStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator' | 'brand';
  onNext: () => void;
}

export const ProjectManagementStep: React.FC<ProjectManagementStepProps> = ({ onNext }) => {
  const projectSteps = [
    {
      icon: <MessageCircle className="w-5 h-5 text-pink-600" />,
      title: "Communicate Effectively",
      description: "Keep clients updated on progress and ask questions when needed"
    },
    {
      icon: <Upload className="w-5 h-5 text-pink-600" />,
      title: "Deliver Quality Work",
      description: "Upload your deliverables through our secure file management system"
    },
    {
      icon: <Repeat className="w-5 h-5 text-pink-600" />,
      title: "Handle Revisions",
      description: "Incorporate feedback professionally and deliver revisions promptly"
    },
    {
      icon: <Star className="w-5 h-5 text-pink-600" />,
      title: "Build Your Reputation",
      description: "Complete projects successfully to earn great reviews and repeat clients"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Manage Your Projects
        </h2>
        <p className="text-gray-600">
          Excel at project delivery to build a stellar reputation and grow your business.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {projectSteps.map((step, index) => (
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

      <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
        <h3 className="font-medium text-emerald-800 mb-2">🚀 Success Metrics</h3>
        <p className="text-sm text-emerald-700">
          Creators who consistently deliver on time and communicate well earn 5-star reviews and get 3x more repeat business.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to="/dashboard/creator/projects"
          className="text-pink-600 hover:text-pink-700 text-sm font-medium"
        >
          View My Projects →
        </Link>
        <Button onClick={onNext} variant="outline">
          Complete Tour
        </Button>
      </div>
    </div>
  );
};
