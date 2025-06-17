
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { FileText, Clock, MessageSquare, CheckCircle } from 'lucide-react';

interface ApplicationStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator';
  onNext: () => void;
}

export const ApplicationStep: React.FC<ApplicationStepProps> = ({ onNext }) => {
  const applicationSteps = [
    {
      icon: <FileText className="w-5 h-5 text-pink-600" />,
      title: "Craft Your Application",
      description: "Write a personalized proposal explaining why you're perfect for the project"
    },
    {
      icon: <Clock className="w-5 h-5 text-pink-600" />,
      title: "Set Timeline & Rate",
      description: "Propose realistic timelines and competitive rates for the deliverables"
    },
    {
      icon: <MessageSquare className="w-5 h-5 text-pink-600" />,
      title: "Engage with Businesses",
      description: "Communicate professionally and ask clarifying questions when needed"
    },
    {
      icon: <CheckCircle className="w-5 h-5 text-pink-600" />,
      title: "Track Application Status",
      description: "Monitor your applications and follow up appropriately"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Apply to Campaigns
        </h2>
        <p className="text-gray-600">
          Learn how to create compelling applications that win projects.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {applicationSteps.map((step, index) => (
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

      <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
        <h3 className="font-medium text-indigo-800 mb-2">💡 Application Success</h3>
        <p className="text-sm text-indigo-700">
          Applications with personalized messages, relevant portfolio samples, and competitive rates have a 75% higher acceptance rate.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to="/dashboard/creator/applications"
          className="text-pink-600 hover:text-pink-700 text-sm font-medium"
        >
          View My Applications →
        </Link>
        <Button onClick={onNext} variant="outline">
          Continue Tour
        </Button>
      </div>
    </div>
  );
};
