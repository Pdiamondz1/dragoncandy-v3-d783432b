
export interface Message {
  id: string;
  campaign_id: string;
  conversation_id?: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  parent_message_id: string | null;
  thread_id: string | null;
  category: string;
  is_starred: boolean;
  is_archived: boolean;
  delivery_status: string;
  forwarded_from_message_id: string | null;
  edited_at: string | null;
  sender_profile?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  parent_message?: {
    content: string;
    sender_profile?: {
      full_name: string | null;
      email: string | null;
    };
  };
}

export interface SendMessageParams {
  campaignId?: string;
  conversationId?: string; 
  recipientId: string; 
  content: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  parentMessageId?: string;
  threadId?: string;
  category?: string;
  forwardedFromMessageId?: string;
}
