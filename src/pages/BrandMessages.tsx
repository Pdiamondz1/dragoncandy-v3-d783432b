import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
      navigate(`/dashboard/brand/messages/direct/${conversationId}`, { replace: true });
    }
  }, [searchParams, navigate]);

  if (!profile) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen overflow-x-hidden bg-dc-gray">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <div className="w-7" />
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              Messages
            </h1>
            <div className="w-7" />
          </div>
          <div className="px-4 pt-4 pb-24 md:pb-0">
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen overflow-x-hidden bg-dc-gray md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="w-7" />
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Messages
          </h1>
          <div className="w-7" />
        </div>

        {/* Scrollable conversation list */}
        <div className="pb-24 md:pb-0 px-4 pt-4">
          <DirectMessagesList />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandMessages;
