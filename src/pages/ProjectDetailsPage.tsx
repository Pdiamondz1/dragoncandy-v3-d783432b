import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  FileCheck, 
  MessageSquare, 
  Calendar, 
  DollarSign,
  User,
  Clock,
  Zap
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCollaboration } from '@/hooks/useCollaboration';
import ContentApprovalPanel from '@/components/projects/ContentApprovalPanel';
import CreatorContentSubmit from '@/components/projects/CreatorContentSubmit';
import CreatorPayoutBanner from '@/components/projects/CreatorPayoutBanner';
import DragonDashTimer from '@/components/projects/DragonDashTimer';
import StartContentButton from '@/components/projects/StartContentButton';
import ProjectFileUpload from '@/components/projects/ProjectFileUpload';
import { useFileUploads } from '@/hooks/useFileUploads';
import ProtectedFilePreview from '@/components/projects/ProtectedFilePreview';
import { useDragonDashTimer } from '@/hooks/useDragonDashTimer';
import { formatDistanceToNow, format } from 'date-fns';

const ProjectDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: collaboration, isLoading, error } = useCollaboration(id!);
  const { data: files } = useFileUploads(collaboration?.campaign_id, 'deliverable');
  const { timerData, startContentCreation } = useDragonDashTimer(id || null);
  
  const isBusinessClient = profile?.role === 'business_client';
  const isCreator = profile?.role === 'content_creator';
  const isDragonDash = collaboration?.campaign?.delivery_type && collaboration.campaign.delivery_type !== 'standard';

  const getDeliveryLabel = (type: string | null) => {
    switch (type) {
      case 'expedited': return 'Expedited (8-12hr)';
      case 'dragon_rush': return 'DragonRush (1-3hr)';
      default: return 'Standard (72hr)';
    }
  };

  const getTotalAmount = () => {
    if (!collaboration?.campaign) return 0;
    const { fixed_price, budget_min, budget_max, delivery_fee } = collaboration.campaign;
    const baseAmount = fixed_price || ((budget_min || 0) + (budget_max || 0)) / 2;
    return baseAmount + (delivery_fee || 0);
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole={isBusinessClient ? 'business_client' : 'content_creator'}>
        <div className="flex-1 p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <Skeleton className="h-10 w-64" />
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !collaboration) {
    return (
      <DashboardLayout userRole={isBusinessClient ? 'business_client' : 'content_creator'}>
        <div className="flex-1 p-6">
          <div className="max-w-5xl mx-auto">
            <Card>
              <CardContent className="py-12 text-center">
                <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Project Not Found</h3>
                <p className="text-muted-foreground mb-4">This project doesn't exist or you don't have access to it.</p>
                <Button onClick={() => navigate(-1)}>Go Back</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={isBusinessClient ? 'business_client' : 'content_creator'}>
      <div className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate(isBusinessClient ? '/dashboard/business/projects' : '/dashboard/creator/projects')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{collaboration.campaign.title}</h1>
                <p className="text-muted-foreground">
                  {isBusinessClient 
                    ? `Working with ${collaboration.creator_profile?.creator_name || 'Creator'}`
                    : `Project for ${collaboration.business_profile?.business_name || 'Client'}`
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isDragonDash && (
                <Badge variant="destructive" className="gap-1">
                  <Zap className="h-3 w-3" />
                  {getDeliveryLabel(collaboration.campaign.delivery_type)}
                </Badge>
              )}
              <Badge variant={collaboration.status === 'completed' ? 'secondary' : 'default'}>
                {collaboration.status}
              </Badge>
            </div>
          </div>

          {/* Creator Payout Banner (for creators only) */}
          {isCreator && <CreatorPayoutBanner creatorId={user!.id} />}

          {/* DragonDash Timer */}
          {timerData && timerData.status !== 'not_started' && collaboration.content_status !== 'approved' && (
            <DragonDashTimer 
              formattedTime={timerData.formattedTime}
              percentageRemaining={timerData.percentageRemaining}
              status={timerData.status}
              deliveryType={timerData.deliveryType}
            />
          )}

          {/* Main Content Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Project Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {isBusinessClient ? 'Creator' : 'Client'}
                    </p>
                    <p className="font-medium">
                      {isBusinessClient 
                        ? collaboration.creator_profile?.creator_name 
                        : collaboration.business_profile?.business_name
                      }
                    </p>
                  </div>
                </div>

                {collaboration.campaign.deadline && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Deadline</p>
                      <p className="font-medium">
                        {format(new Date(collaboration.campaign.deadline), 'PPP')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Project Value</p>
                    <p className="font-medium">
                      ${getTotalAmount().toLocaleString()}
                      {collaboration.campaign.delivery_fee ? (
                        <span className="text-sm text-muted-foreground ml-1">
                          (includes ${collaboration.campaign.delivery_fee} delivery fee)
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Started</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(collaboration.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Content Approval / Submission Panel */}
            {isBusinessClient ? (
              <ContentApprovalPanel
                collaborationId={collaboration.id}
                campaignId={collaboration.campaign_id}
                contentStatus={collaboration.content_status}
                revisionCount={collaboration.revision_count}
                creatorId={collaboration.creator_id}
                creatorName={collaboration.creator_profile?.creator_name || 'Creator'}
              />
            ) : (
              <div className="space-y-4">
                {/* Start Content Button for creators */}
                {(!collaboration.content_status || collaboration.content_status === 'pending') && (
                  <Card>
                    <CardContent className="pt-6">
                      <StartContentButton 
                        deliveryType={collaboration.campaign.delivery_type || 'standard'}
                        onStart={startContentCreation}
                      />
                    </CardContent>
                  </Card>
                )}
                
                <CreatorContentSubmit
                  collaborationId={collaboration.id}
                  campaignId={collaboration.campaign_id}
                  contentStatus={collaboration.content_status}
                  revisionCount={collaboration.revision_count}
                  businessName={collaboration.business_profile?.business_name || 'Client'}
                />
              </div>
            )}
          </div>

          {/* Files Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deliverables</CardTitle>
              <CardDescription>
                {isCreator 
                  ? 'Upload your content files here'
                  : 'View and download submitted content'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isCreator && collaboration.content_status !== 'approved' && (
                <div className="mb-4">
                  <ProjectFileUpload 
                    campaignId={collaboration.campaign_id}
                    campaignTitle={collaboration.campaign.title}
                  />
                </div>
              )}
              
              {files && files.length > 0 ? (
                <div className="grid gap-3">
                  {files.map((file: any) => (
                    <ProtectedFilePreview
                      key={file.id}
                      file={file}
                      contentStatus={collaboration.content_status}
                      isBusinessClient={isBusinessClient}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No files uploaded yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => navigate(`/messages/${collaboration.campaign_id}`)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Open Messages
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProjectDetailsPage;
