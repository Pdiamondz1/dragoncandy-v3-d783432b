import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Building, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCreateDirectConversation } from '@/hooks/useConversations';
import { useSendMessage } from '@/hooks/useMessageMutations';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface ContactRestaurantModalProps {
  restaurant: {
    user_id: string;
    business_name: string;
    logo_url?: string;
    description?: string;
  };
  campaignTitle?: string;
  trigger?: React.ReactNode;
}

const ContactRestaurantModal: React.FC<ContactRestaurantModalProps> = ({ 
  restaurant, 
  campaignTitle,
  trigger 
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  
  const createConversation = useCreateDirectConversation();
  const sendMessage = useSendMessage();

  const handleSendMessage = async () => {
    if (!message.trim() || !user) return;

    try {
      // Create or get direct conversation
      const conversationId = await createConversation.mutateAsync(restaurant.user_id);

      // Send the message
      await sendMessage.mutateAsync({
        conversationId,
        recipientId: restaurant.user_id,
        content: message.trim()
      });

      toast({
        title: "Message Sent",
        description: `Your message has been sent to ${restaurant.business_name}.`
      });

      setMessage('');
      setOpen(false);
      
      // Navigate to the conversation
      navigate(`/messages/conversation/${conversationId}`);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Failed to send message",
        description: "Please try again later.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            Message Restaurant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message {restaurant.business_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Restaurant Info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Avatar>
              <AvatarImage src={restaurant.logo_url} />
              <AvatarFallback>
                <Building className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{restaurant.business_name}</p>
              {campaignTitle && (
                <p className="text-xs text-muted-foreground">
                  Campaign: {campaignTitle}
                </p>
              )}
            </div>
          </div>

          {/* Message Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Message</label>
            <Textarea
              placeholder="Write your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSendMessage}
              disabled={!message.trim() || createConversation.isPending || sendMessage.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {createConversation.isPending || sendMessage.isPending ? 'Sending...' : 'Send Message'}
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

export default ContactRestaurantModal;
