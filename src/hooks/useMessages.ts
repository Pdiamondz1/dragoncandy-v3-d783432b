// Re-export all message-related hooks and types
export type { Message, SendMessageParams } from '@/types/messages';

export { useMessages, useSearchMessages } from '@/hooks/useMessageQueries';
export { useSendMessage, useStarMessage, useMarkMessageAsRead } from '@/hooks/useMessageMutations';
export { useUnreadMessageCounts } from '@/hooks/useUnreadCounts';

// Keep the original exports for backward compatibility
export * from '@/hooks/useMessageQueries';
export * from '@/hooks/useMessageMutations';
export * from '@/hooks/useUnreadCounts';
