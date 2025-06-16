import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Check, X, Trash2 } from 'lucide-react';
import { useManageApplication } from '@/hooks/useManageApplication';
import { CampaignApplication } from '@/types/applications';
import { toast } from '@/hooks/use-toast';

interface BulkApplicationActionsProps {
  applications: CampaignApplication[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

const BulkApplicationActions: React.FC<BulkApplicationActionsProps> = ({
  applications,
  selectedIds,
  onSelectionChange,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const manageApplication = useManageApplication();

  const selectedApplications = applications.filter(app => selectedIds.includes(app.id));
  const pendingSelected = selectedApplications.filter(app => app.status === 'pending');

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(applications.map(app => app.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleBulkAction = async (action: 'accepted' | 'rejected') => {
    setIsProcessing(true);
    
    try {
      for (const applicationId of selectedIds) {
        const app = applications.find(a => a.id === applicationId);
        if (app && app.status === 'pending') {
          await manageApplication.mutateAsync({
            applicationId,
            status: action,
          });
        }
      }
      
      toast({
        title: `Applications ${action}`,
        description: `Successfully ${action} ${pendingSelected.length} applications.`,
      });
      
      onSelectionChange([]);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process applications.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (applications.length === 0) {
    return null;
  }

  const allSelected = selectedIds.length === applications.length;
  const someSelected = selectedIds.length > 0;

  return (
    <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
      <div className="flex items-center gap-4">
        <Checkbox
          checked={allSelected}
          onCheckedChange={handleSelectAll}
          className="mr-2"
        />
        <span className="text-sm font-medium">
          {someSelected ? `${selectedIds.length} selected` : 'Select all'}
        </span>
        {someSelected && (
          <Badge variant="secondary">
            {pendingSelected.length} pending
          </Badge>
        )}
      </div>

      {someSelected && (
        <div className="flex items-center gap-2">
          {pendingSelected.length > 0 && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProcessing}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Accept ({pendingSelected.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Accept Applications</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to accept {pendingSelected.length} applications? 
                      This will create new collaborations and cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleBulkAction('accepted')}>
                      Accept Applications
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProcessing}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject ({pendingSelected.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject Applications</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to reject {pendingSelected.length} applications? 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => handleBulkAction('rejected')}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Reject Applications
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange([])}
          >
            Clear Selection
          </Button>
        </div>
      )}
    </div>
  );
};

export default BulkApplicationActions;
