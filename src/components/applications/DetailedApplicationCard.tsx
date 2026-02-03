
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, DollarSign, Building, MessageSquare, FolderOpen, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ApplicationStatusBadge from '@/components/campaigns/ApplicationStatusBadge';
import ContactRestaurantModal from '@/components/creator-profile/ContactRestaurantModal';
import { CampaignApplication } from '@/types/applications';
import { useWithdrawApplication } from '@/hooks/useWithdrawApplication';

interface DetailedApplicationCardProps {
  application: CampaignApplication;
}

const DetailedApplicationCard: React.FC<DetailedApplicationCardProps> = ({ application }) => {
  const navigate = useNavigate();
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const withdrawApplication = useWithdrawApplication();
  
  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };
  
  const handleWithdraw = () => {
    withdrawApplication.mutate({
      applicationId: application.id,
      campaignTitle: application.campaign?.title,
    });
    setShowWithdrawDialog(false);
  };

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {application.campaign?.title || 'Campaign Title'}
            </CardTitle>
            
            {/* Restaurant Information */}
            {application.campaign?.business_profile && (
              <div className="flex items-center gap-2 mt-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={application.campaign.business_profile.logo_url} />
                  <AvatarFallback>
                    <Building className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {application.campaign.business_profile.business_name}
                  </p>
                  {application.campaign.business_profile.location && (
                    <p className="text-xs text-muted-foreground">
                      {application.campaign.business_profile.location}
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <p className="text-sm text-muted-foreground mt-2">
              Applied on {formatDate(application.created_at)}
            </p>
          </div>
          <ApplicationStatusBadge status={application.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-medium mb-1">Your Message</h4>
          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            {application.intro_message || 'No message provided'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {application.proposed_timeline && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Timeline</p>
                <p className="text-sm font-medium">{application.proposed_timeline}</p>
              </div>
            </div>
          )}

          {application.proposed_rate && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xs text-gray-500">Proposed Rate</p>
                <p className="text-sm font-medium">{formatCurrency(application.proposed_rate)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Pending Application Actions */}
        {application.status === 'pending' && (
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setShowWithdrawDialog(true)}
            >
              <X className="h-4 w-4 mr-2" />
              Withdraw Application
            </Button>
          </div>
        )}

        {/* Accepted Application Actions */}
        {application.status === 'accepted' && 
         application.campaign?.business_profile && (
          <div className="pt-4 border-t space-y-2">
            <Button 
              className="w-full" 
              onClick={() => navigate('/dashboard/creator/projects')}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              View Project
            </Button>
            <ContactRestaurantModal
              restaurant={{
                user_id: application.campaign.business_profile.user_id,
                business_name: application.campaign.business_profile.business_name,
                logo_url: application.campaign.business_profile.logo_url,
                description: application.campaign.business_profile.description,
              }}
              campaignTitle={application.campaign.title}
              trigger={
                <Button className="w-full" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message {application.campaign.business_profile.business_name}
                </Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
    
    {/* Withdraw Confirmation Dialog */}
    <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw Application?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to withdraw your application for "{application.campaign?.title}"? 
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleWithdraw}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Withdraw
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default DetailedApplicationCard;
