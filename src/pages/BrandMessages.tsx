import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import DirectMessagesList from '@/components/messages/DirectMessagesList';

const BrandMessages = () => {
  const { profile } = useAuth();

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
