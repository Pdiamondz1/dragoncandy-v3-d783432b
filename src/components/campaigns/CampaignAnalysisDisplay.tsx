
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Target, 
  Users, 
  Calendar, 
  Palette, 
  MessageSquare, 
  CheckSquare, 
  DollarSign,
  Edit,
  ArrowRight 
} from 'lucide-react';

interface CampaignAnalysis {
  title: string;
  description: string;
  goals: string;
  targetAudience: string;
  platforms: string[];
  timeline: string;
  style: string;
  tone: string;
  deliverables: string[];
  budgetRecommendation: string;
}

interface CampaignAnalysisDisplayProps {
  analysis: CampaignAnalysis;
  onEditCampaignIdea: () => void;
  onApproveAndCustomize: () => void;
}

const CampaignAnalysisDisplay: React.FC<CampaignAnalysisDisplayProps> = ({
  analysis,
  onEditCampaignIdea,
  onApproveAndCustomize,
}) => {
  return (
    <div className="space-y-6">
      {/* Campaign Title */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-center text-blue-600">
            {analysis.title}
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Campaign Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-blue-500" />
              Campaign Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{analysis.description}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-green-500" />
              Campaign Goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{analysis.goals}</p>
          </CardContent>
        </Card>
      </div>

      {/* Target Audience & Platforms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-purple-500" />
              Target Audience
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{analysis.targetAudience}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-pink-500" />
              Recommended Platforms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analysis.platforms.map((platform, index) => (
                <Badge key={index} variant="secondary" className="text-sm">
                  {platform}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Style & Tone */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5 text-orange-500" />
              Visual Style
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{analysis.style}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-indigo-500" />
              Brand Tone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{analysis.tone}</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline & Budget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-red-500" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{analysis.timeline}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-green-500" />
              Budget Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{analysis.budgetRecommendation}</p>
          </CardContent>
        </Card>
      </div>

      {/* Deliverables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckSquare className="h-5 w-5 text-teal-500" />
            Recommended Deliverables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {analysis.deliverables.map((deliverable, index) => (
              <div key={index} className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-teal-500" />
                <span className="text-gray-700">{deliverable}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button 
          variant="outline" 
          onClick={onEditCampaignIdea}
          className="flex items-center gap-2"
        >
          <Edit className="h-4 w-4" />
          Edit Campaign Idea
        </Button>
        <Button 
          onClick={onApproveAndCustomize}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
        >
          Approve & Customize
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default CampaignAnalysisDisplay;
