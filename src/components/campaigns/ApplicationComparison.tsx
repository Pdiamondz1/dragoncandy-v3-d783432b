
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  DollarSign, 
  Clock, 
  Star, 
  User, 
  CheckCircle, 
  XCircle,
  ArrowRight
} from 'lucide-react';
import { CampaignApplication } from '@/types/applications';

interface ApplicationComparisonProps {
  applications: CampaignApplication[];
  onSelectApplication?: (applicationId: string) => void;
  onAcceptApplication?: (applicationId: string) => void;
  onRejectApplication?: (applicationId: string) => void;
}

const ApplicationComparison: React.FC<ApplicationComparisonProps> = ({
  applications,
  onSelectApplication,
  onAcceptApplication,
  onRejectApplication,
}) => {
  const [selectedApplications, setSelectedApplications] = useState<string[]>([]);

  const toggleSelection = (applicationId: string) => {
    setSelectedApplications(prev => 
      prev.includes(applicationId) 
        ? prev.filter(id => id !== applicationId)
        : [...prev, applicationId].slice(0, 3) // Max 3 comparisons
    );
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getSkillsMatch = (creatorSkills: string[] = [], campaignDeliverables: string[] = []) => {
    if (!creatorSkills.length || !campaignDeliverables.length) return 0;
    const matches = creatorSkills.filter(skill => 
      campaignDeliverables.some(deliverable => 
        deliverable.toLowerCase().includes(skill.toLowerCase())
      )
    );
    return Math.round((matches.length / campaignDeliverables.length) * 100);
  };

  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <User className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No applications to compare
          </h3>
          <p className="text-gray-600">Applications will appear here once creators start applying.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selection Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Application Comparison
            {selectedApplications.length > 0 && (
              <Badge variant="secondary">
                {selectedApplications.length} selected
              </Badge>
            )}
          </CardTitle>
          <p className="text-sm text-gray-600">
            Select up to 3 applications to compare side by side
          </p>
        </CardHeader>
      </Card>

      {/* Comparison View */}
      {selectedApplications.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {selectedApplications.map(appId => {
            const app = applications.find(a => a.id === appId);
            if (!app) return null;

            return (
              <Card key={app.id} className="border-2 border-blue-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={app.creator_profile?.avatar_url} />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-medium">{app.creator_profile?.creator_name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {app.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {app.proposed_rate && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">
                        {formatCurrency(app.proposed_rate)}
                      </span>
                    </div>
                  )}

                  {app.proposed_timeline && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">{app.proposed_timeline}</span>
                    </div>
                  )}

                  {app.creator_profile?.skills && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm font-medium">Skills Match</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {app.creator_profile.skills.slice(0, 3).map((skill, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  <p className="text-sm text-gray-600 line-clamp-3">
                    {app.intro_message}
                  </p>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => onAcceptApplication?.(app.id)}
                      disabled={app.status !== 'pending'}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRejectApplication?.(app.id)}
                      disabled={app.status !== 'pending'}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Application List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {applications.map(application => (
          <Card 
            key={application.id} 
            className={`cursor-pointer transition-all ${
              selectedApplications.includes(application.id) 
                ? 'ring-2 ring-blue-500 bg-blue-50' 
                : 'hover:shadow-md'
            }`}
            onClick={() => toggleSelection(application.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={application.creator_profile?.avatar_url} />
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">
                      {application.creator_profile?.creator_name}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {application.status}
                    </Badge>
                  </div>
                </div>
                {selectedApplications.includes(application.id) && (
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-3">
                {application.proposed_rate && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">
                      {formatCurrency(application.proposed_rate)}
                    </span>
                  </div>
                )}

                {application.proposed_timeline && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">{application.proposed_timeline}</span>
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                {application.intro_message}
              </p>

              {application.creator_profile?.skills && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {application.creator_profile.skills.slice(0, 3).map((skill, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                  {application.creator_profile.skills.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{application.creator_profile.skills.length - 3} more
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs text-gray-500">
                  Applied {new Date(application.created_at).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectApplication?.(application.id);
                  }}
                >
                  View Details
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ApplicationComparison;
