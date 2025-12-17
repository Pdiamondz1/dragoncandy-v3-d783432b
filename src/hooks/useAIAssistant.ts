import { useEffect } from 'react';
import { useAIAssistantContext } from '@/contexts/AIAssistantContext';

interface UseAIAssistantProps {
  userRole: string;
}

export const useAIAssistant = ({ userRole }: UseAIAssistantProps) => {
  const context = useAIAssistantContext();
  
  // Update role when it changes
  useEffect(() => {
    context.setUserRole(userRole);
  }, [userRole, context.setUserRole]);

  return {
    messages: context.messages,
    isLoading: context.isLoading,
    error: context.error,
    sendMessage: context.sendMessage,
    clearChat: context.clearChat,
  };
};
