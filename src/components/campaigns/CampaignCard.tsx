
import React, { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, Eye, Users, FileText, MessageSquare, Edit, UserCheck, CreditCard, Loader2, AlertCircle, RefreshCw, FolderOpen, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDeleteCampaign } from '@/hooks/useCampaignMutations';
import { useNavigate } from 'react-router-dom';
import { Campaign } from '@/hooks/useCampaigns';
import { format } from 'date-fns';
import { useCampaignApplicationsCount } from '@/hooks/useCampaignApplicationsCount';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface CampaignCardProps {
  campaign: Campaign;
  onViewDetails?: (campaign: Campaign) => void;
  onEdit?: (campaign: Campaign) => void;
}

const CampaignCard: React.FC<CampaignCardProps> = ({ 
  campaign, 
  onViewDetails, 
  onEdit 
}) => {
  const { data: applicationCounts } = useCampaignApplicationsCount(campaign.id);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isPayingEscrow, setIsPayingEscrow] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteCampaign = useDeleteCampaign();

  const handleDelete = async () => {
    try {
      await deleteCampaign.mutateAsync(campaign.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete campaign:', error);
    }
  };

  const canDelete = !applicationCounts || applicationCounts.accepted === 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-foreground border-border';
      case 'published': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'completed': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-muted text-foreground border-border';
    }
  };

  const getEscrowBadge = () => {
    switch (campaign.escrow_status) {
      case 'pending':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Payment Pending
          </Badge>
        );
      case 'held':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200 text-xs flex items-center gap-1">
            <CreditCard className="h-3 w-3" />
            Escrow Held
          </Badge>
        );
      case 'released':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs flex items-center gap-1">
            <CreditCard className="h-3 w-3" />
            Paid Out
          </Badge>
        );
      default:
        return null;
    }
  };

  // Verify payment first before opening checkout
  const handleVerifyPayment = async () => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
        body: { campaignId: campaign.id },
      });

      if (error) throw error;

      if (data?.success && data?.status === 'held') {
        toast({
          title: 'Payment Already Verified!',
          description: 'Your campaign is published and visible to creators.',
        });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
        return true; // Payment was already made
      }
      return false; // Payment not yet made
    } catch (err) {
      console.error('Verification check failed:', err);
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePayEscrow = async () => {
    setIsPayingEscrow(true);
    
    // First, check if already paid (prevents duplicate charges)
    const alreadyPaid = await handleVerifyPayment();
    if (alreadyPaid) {
      setIsPayingEscrow(false);
      return;
    }
    
    // Open blank window immediately to avoid popup blocker
    const checkoutWindow = window.open('about:blank', '_blank');
    
    try {
      const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
        body: {
          campaignId: campaign.id,
          amount: campaign.fixed_price || 0,
          deliveryFee: campaign.delivery_fee || 0,
          campaignTitle: campaign.title,
          deliveryType: campaign.delivery_type || 'standard',
        },
      });
      
      if (error) throw error;

      // Check if already paid (edge function returns this)
      if (data?.alreadyPaid) {
        checkoutWindow?.close();
        toast({
          title: 'Already Paid',
          description: 'This campaign has already been paid for.',
        });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        return;
      }
      
      if (data?.url && checkoutWindow) {
        checkoutWindow.location.href = data.url;
        toast({
          title: 'Opening Stripe Checkout',
          description: 'Complete your payment to publish the campaign.',
        });
      } else if (data?.url) {
        // Fallback if popup was blocked
        toast({
          title: 'Popup Blocked',
          description: 'Click below to open payment.',
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(data.url, '_blank')}
            >
              Open Payment
            </Button>
          ),
        });
      }
    } catch (error) {
      console.error('Escrow payment error:', error);
      checkoutWindow?.close();
      toast({
        variant: 'destructive',
        title: 'Payment Failed',
        description: 'Could not initiate payment. Please try again.',
      });
    } finally {
      setIsPayingEscrow(false);
    }
  };

  const formatBudget = () => {
    // Show fixed price if it's a fixed campaign
    if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
      const total = campaign.fixed_price + (campaign.delivery_fee || 0);
      return `$${total} (Fixed)`;
    }
    if (campaign.budget_min && campaign.budget_max) {
      return `$${campaign.budget_min} - $${campaign.budget_max}`;
    }
    if (campaign.budget_min) {
      return `From $${campaign.budget_min}`;
    }
    if (campaign.budget_max) {
      return `Up to $${campaign.budget_max}`;
    }
    return 'Budget TBD';
  };

  const getContentItemsCount = () => {
    return campaign.deliverables ? campaign.deliverables.length : 0;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <MessageSquare className="h-3 w-3" />;
      case 'completed':
        return <FileText className="h-3 w-3" />;
      default:
        return null;
    }
  };

  // Check if campaign needs escrow payment
  const needsEscrowPayment = campaign.escrow_status === 'pending';

  return (
<<<<<<< HEAD
    <Card className={`relative overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 max-w-full ${needsEscrowPayment ? 'border-l-amber-500 bg-amber-50/30' : 'border-l-transparent hover:border-l-primary/50'}`}>
      {/* Application Counter Badge - Top Right Corner */}
      {applicationCounts && applicationCounts.pending > 0 && (
        <div className="absolute top-2 right-2 z-10">
=======
    <Card className={`relative hover:shadow-lg transition-all duration-200 border-l-4 ${needsEscrowPayment ? 'border-l-amber-500 bg-amber-50/30' : 'border-l-transparent hover:border-l-primary/50'}`}>
      {/* Application Counter Badge - Top Right Corner */}
      {applicationCounts && applicationCounts.pending > 0 && (
        <div className="absolute -top-2 -right-2 z-10">
>>>>>>> a1eeecf (docs: add Donny Chrome Extension OAuth PKCE design spec)
          <Badge className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded-full shadow-lg">
            {applicationCounts.pending}
          </Badge>
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <CardTitle className="text-base sm:text-lg font-semibold line-clamp-2 mb-2">
              {campaign.title}
            </CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
              <Badge className={`${getStatusColor(campaign.status)} text-xs font-medium flex items-center gap-1 w-fit`}>
                {getStatusIcon(campaign.status)}
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </Badge>
              {getEscrowBadge()}
              <span className="text-xs text-muted-foreground">
                {format(new Date(campaign.created_at), 'MMM dd, yyyy')}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0">
        {/* Escrow Payment Alert */}
        {needsEscrowPayment && (
          <div className="p-3 rounded-lg bg-amber-100 border border-amber-300">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-medium mb-2">
              <AlertCircle className="h-4 w-4" />
              Payment Required to Publish
            </div>
            <p className="text-xs text-amber-700 mb-2">
              Complete escrow payment to make this campaign visible to creators.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handlePayEscrow}
                disabled={isPayingEscrow || isVerifying}
              >
                {isPayingEscrow ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay (${(campaign.fixed_price || 0) + (campaign.delivery_fee || 0)})
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleVerifyPayment}
                disabled={isVerifying || isPayingEscrow}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {campaign.description || 'No description provided'}
        </p>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <span className="text-muted-foreground truncate">{formatBudget()}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="text-muted-foreground">
              {getContentItemsCount()} item{getContentItemsCount() !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Total Applications Count (subtle) */}
          <div className="flex items-center gap-2 text-sm">
            <UserCheck className="h-4 w-4 text-purple-600" />
            <span className="text-muted-foreground">
              {applicationCounts?.total || 0} application{(applicationCounts?.total || 0) !== 1 ? 's' : ''}
            </span>
          </div>

          {campaign.deadline && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-orange-600" />
              <span className="text-muted-foreground">
                Due {format(new Date(campaign.deadline), 'MMM dd, yyyy')}
              </span>
            </div>
          )}
        </div>

        {/* Platforms */}
        {campaign.platforms && campaign.platforms.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {campaign.platforms.slice(0, 2).map((platform) => (
                <Badge key={platform} variant="outline" className="text-xs">
                  {platform}
                </Badge>
              ))}
              {campaign.platforms.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{campaign.platforms.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Deliverables Preview */}
        {campaign.deliverables && campaign.deliverables.length > 0 && (
          <div>
            <div className="flex flex-wrap gap-1">
              {campaign.deliverables.slice(0, 2).map((deliverable, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {deliverable}
                </Badge>
              ))}
              {campaign.deliverables.length > 2 && (
                <Badge variant="secondary" className="text-xs">
                  +{campaign.deliverables.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>

<<<<<<< HEAD
      <CardFooter className="flex flex-wrap gap-2 pt-4 border-t border-border min-w-0 overflow-hidden">
=======
      <CardFooter className="flex flex-wrap gap-2 pt-4 border-t border-border min-w-0">
>>>>>>> a1eeecf (docs: add Donny Chrome Extension OAuth PKCE design spec)
        <Button 
          variant="outline" 
          size="sm" 
          className="text-xs"
          onClick={() => onViewDetails?.(campaign)}
        >
          {applicationCounts && applicationCounts.pending > 0 ? (
            <>
              <UserCheck className="h-3 w-3 mr-1" />
              Review Applications
            </>
          ) : (
            <>
              <Eye className="h-3 w-3 mr-1" />
              View Details
            </>
          )}
        </Button>
        {applicationCounts && applicationCounts.accepted > 0 && (
          <Button 
            variant="secondary" 
            size="sm" 
            className="text-xs"
            onClick={() => navigate('/dashboard/business/projects')}
          >
            <FolderOpen className="h-3 w-3 mr-1" />
            Project Status
          </Button>
        )}
        {canDelete && (
          <Button 
            variant="destructive" 
            size="sm" 
            className="text-xs"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteCampaign.isPending}
          >
            {deleteCampaign.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            Delete
          </Button>
        )}
        {onEdit && (
          <Button 
            variant="default" 
            size="sm" 
            className="text-xs"
            onClick={() => onEdit(campaign)}
          >
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
        )}
      </CardFooter>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{campaign.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default CampaignCard;
