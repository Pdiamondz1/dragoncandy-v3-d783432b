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
          <div className="px-4 pt-4 pb-24">
            <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white text-center text-sm text-gray-500">
              Loading...
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen overflow-x-hidden bg-dc-gray">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="w-7" />
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Messages
          </h1>
          <div className="w-7" />
        </div>

        {/* Scrollable conversation list */}
        <div className="pb-24 px-4 pt-4">
          <DirectMessagesList />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandMessages;
