import { useParams, Navigate } from 'react-router-dom';
import { useCollaboration } from '@/hooks/useCollaboration';
import { Skeleton } from '@/components/ui/skeleton';

export function CollaborationRedirect() {
  const { id } = useParams<{ id: string }>();
  const { data: collaboration, isLoading, error } = useCollaboration(id!);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (error || !collaboration) {
    return <Navigate to="/dashboard/creator/my-campaigns" replace />;
  }

  return <Navigate to={`/dashboard/creator/my-campaigns/${collaboration.campaign_id}`} replace />;
}
