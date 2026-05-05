import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageSquare, 
  Clock, 
  User, 
  Send,
  LoaderIcon 
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCreateDirectConversation } from '@/hooks/useConversations';
import { useSendMessage } from '@/hooks/useMessageMutations';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface ContactCreatorModalProps {
  creator: {
    id: string;
    user_id: string;
    creator_name: string;
    avatar_url?: string;
    bio?: string;
    response_time?: string;
  };
  trigger?: React.ReactNode;
}

const ContactCreatorModal: React.FC<ContactCreatorModalProps> = ({ 
  creator, 
  trigger 
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const createConversationMutation = useCreateDirectConversation();
  const sendMessageMutation = useSendMessage();

  const handleSendMessage = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Message Required",
        description: "Please enter a message before sending.",
        variant: "destructive"
      });
      return;
    }

    if (user.id === creator.user_id) {
      toast({
        title: "Cannot Contact Yourself",
        description: "You cannot send a message to yourself.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create or get existing conversation
      const conversationId = await createConversationMutation.mutateAsync(creator.user_id);
      
      // Send the initial message
      await sendMessageMutation.mutateAsync({
        conversationId,
        recipientId: creator.user_id,
        content: message.trim()
      });

      toast({
        title: "Message Sent",
        description: `Your message has been sent to ${creator.creator_name}.`
      });

      setMessage('');
      setOpen(false);
      
      // Navigate to the specific conversation to see the message
      navigate(`/messages/direct/${conversationId}`);
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Failed to Send Message",
        description: "There was an error sending your message. Please try again.",
        variant: "destructive"
      });
    }
  };

  const isLoading = createConversationMutation.isPending || sendMessageMutation.isPending;

  const defaultTrigger = (
    <Button>
      <MessageSquare className="h-4 w-4 mr-2" />
      Contact
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact {creator.creator_name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Creator Info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Avatar className="h-12 w-12">
              <AvatarImage src={creator.avatar_url} />
              <AvatarFallback>
                <User className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <h3 className="font-semibold">{creator.creator_name}</h3>
              {creator.response_time && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Usually responds {creator.response_time.replace('-', ' ')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bio Preview */}
          {creator.bio && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {creator.bio}
              </p>
            </div>
          )}

          {/* Message Input */}
          <div className="space-y-2">
            <Label htmlFor="message">Your Message</Label>
            <Textarea
              id="message"
              placeholder={`Hi ${creator.creator_name}, I'd like to discuss a potential project with you…`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={isLoading}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || !message.trim()}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </div>

          {/* Info Text */}
          <p className="text-xs text-muted-foreground text-center">
            This will start a direct conversation that you can continue in your Messages.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactCreatorModal;