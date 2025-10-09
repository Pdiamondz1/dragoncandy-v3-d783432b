import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import DirectMessagesList from '@/components/messages/DirectMessagesList';

const BrandMessages = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      // Immediately navigate to the direct conversation page
      navigate(`/dashboard/brand/messages/direct/${conversationId}`, { replace: true });
    }
  }, [searchParams, navigate]);

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Messages</h1>
          <p className="text-muted-foreground">
            Communicate with restaurants and creators
          </p>
        </div>
        
        <DirectMessagesList />
      </div>
    </DashboardLayout>
  );
};

export default BrandMessages;
