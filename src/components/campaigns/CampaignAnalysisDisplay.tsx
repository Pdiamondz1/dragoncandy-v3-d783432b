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

  Edit,
  ArrowRight,
  Lightbulb,
  Hash,
  Type,
  Clock,
  Eye,
  Copy
} from 'lucide-react';
import { CampaignAnalysis } from '@/types/campaign';
import { toast } from 'sonner';

interface CampaignAnalysisDisplayProps {
  analysis: CampaignAnalysis;
  onEditCampaignIdea?: () => void;
  onApproveAndCustomize?: () => void;
}

export const CampaignAnalysisDisplay: React.FC<CampaignAnalysisDisplayProps> = ({
  analysis,
  onEditCampaignIdea,
  onApproveAndCustomize,
}) => {
  return (
    <div className="space-y-6">
      {/* Campaign Title */}
      {analysis.title && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl text-center text-dc-teal-btn break-words">
              {analysis.title}
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Campaign Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {analysis.description && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-dc-teal-btn" />
                Campaign Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">{analysis.description}</p>
            </CardContent>
          </Card>
        )}

        {analysis.goals && analysis.goals.length > 0 && (
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
                    <span className="text-foreground">{goal}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Target Audience & Platforms */}
      {(analysis.target_audience || (analysis.recommended_platforms && analysis.recommended_platforms.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analysis.target_audience && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-dc-teal" />
                  Target Audience
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground">{analysis.target_audience}</p>
              </CardContent>
            </Card>
          )}

          {analysis.recommended_platforms && analysis.recommended_platforms.length > 0 && (
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
          )}
        </div>
      )}

      {/* Content Types & Key Messages */}
      {((analysis.content_types && analysis.content_types.length > 0) || (analysis.key_messages && analysis.key_messages.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analysis.content_types && analysis.content_types.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Palette className="h-5 w-5 text-dc-pink-accent" />
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
          )}

          {analysis.key_messages && analysis.key_messages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5 text-dc-teal-btn" />
                  Key Messages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.key_messages.map((message, index) => (
                    <div key={index} className="text-sm text-foreground">
                      • {message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Timeline & Budget */}
      {analysis.timeline_recommendations && (
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
                  <div className="text-foreground"><strong>Preparation:</strong> {analysis.timeline_recommendations.preparation}</div>
                  <div className="text-foreground"><strong>Execution:</strong> {analysis.timeline_recommendations.execution}</div>
                  <div className="text-foreground"><strong>Analysis:</strong> {analysis.timeline_recommendations.analysis}</div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* Success Metrics */}
      {analysis.success_metrics && analysis.success_metrics.length > 0 && (
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
                  <span className="text-foreground">{metric}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Creative Brief Section */}
      {(analysis.content_ideas || analysis.hashtags || analysis.captions || analysis.posting_schedule || analysis.style_direction) && (
        <div className="space-y-6">
          <div className="border-t pt-6">
            <h3 className="text-xl font-semibold text-center mb-6 flex items-center justify-center gap-2">
              <Lightbulb className="h-6 w-6 text-yellow-500" />
              Creative Brief
            </h3>
          </div>

          {/* Content Ideas */}
          {analysis.content_ideas && analysis.content_ideas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Content Ideas ({analysis.content_ideas.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.content_ideas.map((idea, index) => (
                    <div key={index} className="border border-dc-teal/15 rounded-lg p-4 bg-dc-teal/[0.04]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">{idea.concept}</span>
                        <Badge variant="secondary" className="text-xs">{idea.format}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{idea.description}</p>
                      {idea.estimated_duration && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {idea.estimated_duration}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hashtags & Captions side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {analysis.hashtags && analysis.hashtags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-lg min-w-0">
                    <Hash className="h-5 w-5 text-dc-teal-btn shrink-0" />
                    <span className="min-w-0">Hashtags</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(analysis.hashtags!.join(' '));
                        toast.success('Hashtags copied!');
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy All
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {analysis.hashtags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-sm cursor-pointer hover:bg-dc-teal/5"
                        onClick={() => {
                          navigator.clipboard.writeText(tag);
                          toast.success(`Copied ${tag}`);
                        }}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {analysis.captions && analysis.captions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Type className="h-5 w-5 text-dc-pink-accent" />
                    Ready-to-Post Captions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysis.captions.map((caption, index) => (
                      <div key={index} className="border border-dc-teal/15 rounded-lg p-3 bg-dc-teal/[0.04] relative group">
                        <p className="text-sm text-foreground pr-8">{caption}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            navigator.clipboard.writeText(caption);
                            toast.success('Caption copied!');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Posting Schedule & Style Direction */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {analysis.posting_schedule && analysis.posting_schedule.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5 text-teal-500" />
                    Posting Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysis.posting_schedule.map((entry, index) => (
                      <div key={index} className="border rounded-lg p-3">
                        <div className="font-semibold text-foreground mb-1">{entry.platform}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div><span className="font-medium">Frequency:</span> {entry.frequency}</div>
                          <div><span className="font-medium">Best times:</span> {entry.best_times}</div>
                          <div><span className="font-medium">Content mix:</span> {entry.content_mix}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {analysis.style_direction && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Eye className="h-5 w-5 text-pink-500" />
                    Style Direction
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <span className="font-medium text-foreground">Visual Style:</span>
                      <p className="text-sm text-muted-foreground">{analysis.style_direction.visual_style}</p>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Mood:</span>
                      <p className="text-sm text-muted-foreground">{analysis.style_direction.mood}</p>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Color Palette:</span>
                      <p className="text-sm text-muted-foreground">{analysis.style_direction.color_palette}</p>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Reference:</span>
                      <p className="text-sm text-muted-foreground">{analysis.style_direction.references}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons — only shown in wizard context */}
      {(onEditCampaignIdea || onApproveAndCustomize) && (
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {onEditCampaignIdea && (
            <Button
              variant="outline"
              onClick={onEditCampaignIdea}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <Edit className="h-4 w-4" />
              Edit Campaign Idea
            </Button>
          )}
          {onApproveAndCustomize && (
            <Button
              variant="dc-primary"
              onClick={onApproveAndCustomize}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              Approve & Customize
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

