import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, Clock, Users } from 'lucide-react';
import { CampaignApplication } from '@/types/applications';
import { useJointApproval } from '@/hooks/useJointApproval';

interface JointApprovalCardProps {
  application: CampaignApplication & {
    brand_approval_status?: string;
    restaurant_approval_status?: string;
    final_approval_status?: string;
  };
  userRole: 'brand' | 'restaurant';
}

export const JointApprovalCard = ({ application, userRole }: JointApprovalCardProps) => {
  const { updateBrandApproval, updateRestaurantApproval } = useJointApproval();

  const handleApprove = () => {
    if (userRole === 'brand') {
      updateBrandApproval.mutate({
        applicationId: application.id,
        action: 'approved',
      });
    } else {
      updateRestaurantApproval.mutate({
        applicationId: application.id,
        action: 'approved',
      });
    }
  };

  const handleReject = () => {
    if (userRole === 'brand') {
      updateBrandApproval.mutate({
        applicationId: application.id,
        action: 'rejected',
      });
    } else {
      updateRestaurantApproval.mutate({
        applicationId: application.id,
        action: 'rejected',
      });
    }
  };

  const brandStatus = application.brand_approval_status || 'pending';
  const restaurantStatus = application.restaurant_approval_status || 'pending';
  const myStatus = userRole === 'brand' ? brandStatus : restaurantStatus;
  const otherStatus = userRole === 'brand' ? restaurantStatus : brandStatus;

  const getStatusBadge = (status: string) => {
    if (status === 'approved') {
      return <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" />Approved</Badge>;
    }
    if (status === 'rejected') {
      return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Rejected</Badge>;
    }
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          Joint Approval Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Brand Approval */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Brand Sponsor</span>
          {getStatusBadge(brandStatus)}
        </div>

        {/* Restaurant Approval */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Restaurant Owner</span>
          {getStatusBadge(restaurantStatus)}
        </div>

        {/* Approval Actions */}
        {myStatus === 'pending' && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleApprove}
              className="flex-1"
              size="sm"
              disabled={updateBrandApproval.isPending || updateRestaurantApproval.isPending}
            >
              <Check className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button
              onClick={handleReject}
              variant="destructive"
              className="flex-1"
              size="sm"
              disabled={updateBrandApproval.isPending || updateRestaurantApproval.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        )}

        {/* Status Message */}
        {myStatus === 'approved' && otherStatus === 'pending' && (
          <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
            ✓ You've approved. Waiting for {userRole === 'brand' ? 'restaurant owner' : 'brand sponsor'} approval.
          </p>
        )}

        {myStatus === 'approved' && otherStatus === 'approved' && (
          <p className="text-sm text-green-600 bg-green-50 p-2 rounded font-medium">
            🎉 Both parties have approved! Creator will be notified.
          </p>
        )}

        {myStatus === 'rejected' && (
          <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
            You have rejected this application.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
