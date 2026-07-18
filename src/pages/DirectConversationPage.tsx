import React from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MoreVertical } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ConversationMessageThread } from '@/components/messages/ConversationMessageThread';
import { useConversations } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';
import { CampaignConversationHeader } from '@/components/messaging/CampaignConversationHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useBlockUser, useUnblockUser, useIsUserBlocked } from '@/hooks/useUserBlocks';
import { useReportUser } from '@/hooks/useReportUser';

const DirectConversationPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeOrgUnit } = useAuth();
  const { data: conversations = [] } = useConversations(activeOrgUnit?.id);
  
  // Check if user came from browse creators page
  const navigationState = location.state as { from?: string; backPath?: string } | null;

  const userRole = user?.user_metadata?.role || 'business_client';

  const [otherParticipantId, setOtherParticipantId] = React.useState<string>("");
  const [blockDialogOpen, setBlockDialogOpen] = React.useState(false);

  const { data: isBlocked } = useIsUserBlocked(otherParticipantId || undefined);
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const reportUser = useReportUser();

  const goToMessagesList = React.useCallback(() => {
    const role = userRole === 'content_creator' ? 'creator' : 'business';
    navigate(`/dashboard/${role}/messages`);
  }, [userRole, navigate]);

  const handleConfirmBlock = () => {
    if (!otherParticipantId) return;
    if (isBlocked) {
      unblockUser.mutate(otherParticipantId, {
        onSuccess: () => setBlockDialogOpen(false),
      });
    } else {
      blockUser.mutate(otherParticipantId, {
        onSuccess: () => {
          setBlockDialogOpen(false);
          goToMessagesList();
        },
      });
    }
  };

  const handleReport = () => {
    if (!otherParticipantId) return;
    reportUser.mutate({ reportedId: otherParticipantId, conversationId });
  };

  React.useEffect(() => {
    if (conversationId && user) {
      supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setOtherParticipantId(data.user_id);
          }
        });
    }
  }, [conversationId, user]);

  // Find the current conversation
  const conversation = conversations.find(c => c.conversation_id === conversationId);

  if (!conversationId) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="flex-1 p-6 bg-white min-h-screen overflow-x-hidden">
          <div className="text-center">
            <p>Conversation not found</p>
            <Button onClick={() => {
              const role = userRole === 'content_creator' ? 'creator' : 'business';
              navigate(`/dashboard/${role}/messages`);
            }} className="mt-4">
              Back to Messages
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const recipientId = otherParticipantId;

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex flex-col h-full bg-white">
        {/* Chat header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4 flex items-center justify-between flex-shrink-0">
          {/* Left: back arrow */}
          <button
            onClick={() => {
              if (navigationState?.from === 'browse-creators' && navigationState?.backPath) {
                navigate(navigationState.backPath);
              } else {
                const role = userRole === 'content_creator' ? 'creator' : 'business';
                navigate(`/dashboard/${role}/messages`);
              }
            }}
            className="text-dc-pink text-xl p-1 -ml-1"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-dc-pink" />
          </button>

          {/* Center: name + status */}
          <div className="flex-1 text-center mx-3">
            <h1 className="text-lg font-bold text-dc-teal leading-tight">
              {conversation?.other_participant_name || 'Direct Conversation'}
            </h1>
            <p className="text-xs text-gray-500">Recently Active</p>
          </div>

          {/* Right: View Profile link + kebab menu */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {otherParticipantId && (
              <>
                <Link
                  to={`/profile/${otherParticipantId}`}
                  className="text-xs font-medium text-dc-teal hover:underline"
                >
                  View Profile
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-dc-teal hover:bg-dc-teal/12"
                      aria-label="Conversation options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setBlockDialogOpen(true)}>
                      {isBlocked ? 'Unblock user' : 'Block user'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleReport}>
                      Report user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        <AlertDialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isBlocked ? 'Unblock this user?' : 'Block this user?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isBlocked
                  ? 'You will be able to send and receive messages with this user again.'
                  : 'You will no longer exchange messages with this user. You can unblock them later.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmBlock}
                className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white"
              >
                {isBlocked ? 'Unblock' : 'Block'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Campaign context banner */}
        {conversation?.campaign_id && (
          <CampaignConversationHeader campaignId={conversation.campaign_id} />
        )}

        {/* Message Thread — fills remaining height */}
        <div className="flex-1 min-h-0 flex flex-col">
          <ErrorBoundary level="section">
            <ConversationMessageThread
              conversationId={conversationId}
              recipientId={recipientId}
              conversationTitle={conversation?.other_participant_name || 'Direct Conversation'}
            />
          </ErrorBoundary>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectConversationPage;