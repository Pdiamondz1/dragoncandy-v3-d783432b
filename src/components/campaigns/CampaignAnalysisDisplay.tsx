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
import { CampaignAnalysis } from '@/types/campaign';

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
            <div className="space-y-2">
              {analysis.goals.map((goal, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-green-500" />
                  <span className="text-gray-700">{goal}</span>
                </div>
              ))}
            </div>
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
            <p className="text-gray-700">{analysis.target_audience}</p>
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
              {analysis.recommended_platforms.map((platform, index) => (
                <Badge key={index} variant="secondary" className="text-sm">
                  {platform}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Types & Key Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5 text-orange-500" />
              Content Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analysis.content_types.map((type, index) => (
                <Badge key={index} variant="outline" className="text-sm">
                  {type}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-indigo-500" />
              Key Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.key_messages.map((message, index) => (
                <div key={index} className="text-sm text-gray-700">
                  • {message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline & Budget */}
      {(analysis.timeline_recommendations || analysis.budget_recommendations) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analysis.timeline_recommendations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-red-500" />
                  Timeline Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div><strong>Preparation:</strong> {analysis.timeline_recommendations.preparation}</div>
                  <div><strong>Execution:</strong> {analysis.timeline_recommendations.execution}</div>
                  <div><strong>Analysis:</strong> {analysis.timeline_recommendations.analysis}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {analysis.budget_recommendations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  Budget Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-lg font-semibold">
                    ${analysis.budget_recommendations.min} - ${analysis.budget_recommendations.max}
                  </div>
                  <p className="text-sm text-gray-600">{analysis.budget_recommendations.reasoning}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Success Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckSquare className="h-5 w-5 text-teal-500" />
            Success Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {analysis.success_metrics.map((metric, index) => (
              <div key={index} className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-teal-500" />
                <span className="text-gray-700">{metric}</span>
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
