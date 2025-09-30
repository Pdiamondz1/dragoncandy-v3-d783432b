
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { MessageCircle, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface MessagingStepProps {
  stepId: string;
  userRole: 'business_client' | 'content_creator' | 'brand';
  onNext: () => void;
}

export const MessagingStep: React.FC<MessagingStepProps> = ({ onNext }) => {
  const messagingFeatures = [
    {
      icon: <MessageCircle className="w-5 h-5 text-pink-600" />,
      title: "Campaign Messages",
      description: "Communicate directly with creators about specific campaigns"
    },
    {
      icon: <FileText className="w-5 h-5 text-pink-600" />,
      title: "File Sharing",
      description: "Share briefs, assets, and receive deliverables securely"
    },
    {
      icon: <CheckCircle className="w-5 h-5 text-pink-600" />,
      title: "Project Management",
      description: "Track progress, approve deliverables, and manage timelines"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Messaging & Collaboration
        </h2>
        <p className="text-gray-600">
          Effective communication is key to successful campaigns. Here's how to collaborate with creators.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {messagingFeatures.map((feature, index) => (
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
        <h3 className="font-medium text-purple-800 mb-2">💼 Best Practices</h3>
        <div className="text-sm text-purple-700 space-y-1">
          <p>• Be clear and specific in your communication</p>
          <p>• Provide detailed feedback on deliverables</p>
          <p>• Respect agreed timelines and deadlines</p>
          <p>• Keep all communication within the platform</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <Link 
          to="/messages"
          className="text-pink-600 hover:text-pink-700 text-sm font-medium flex items-center gap-2"
        >
          <MessageCircle className="w-4 h-4" />
          View Messages →
        </Link>
        <Button onClick={onNext} variant="outline">
          Complete Tutorial
        </Button>
      </div>
    </div>
  );
};
