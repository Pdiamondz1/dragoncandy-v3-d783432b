import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantContextType {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  setUserRole: (role: string) => void;
}

const AIAssistantContext = createContext<AIAssistantContextType | null>(null);

const CHAT_URL = `https://zocahiffooqdybdhguqv.supabase.co/functions/v1/chat-assistant`;

interface AIAssistantProviderProps {
  children: ReactNode;
  initialUserRole?: string;
}

export const AIAssistantProvider: React.FC<AIAssistantProviderProps> = ({ 
  children, 
  initialUserRole = 'business_client' 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState(initialUserRole);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    let assistantContent = '';

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'assistant') {
          return prev.map((m, i) => 
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    try {
      const allMessages = [...messages, userMessage];
      
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvY2FoaWZmb29xZHliZGhndXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NzgzMzQsImV4cCI6MjA2NTU1NDMzNH0.bGhT6ft_zTbw-9v2Typi0wxzlfStg3sGiuPOor8Wfz8`,
        },
        body: JSON.stringify({
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          role: userRole,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) updateAssistant(content);
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Handle any remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) updateAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('AI Assistant error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessages(prev => prev.filter(m => m !== userMessage));
    } finally {
      setIsLoading(false);
    }
  }, [messages, userRole, isLoading]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return (
    <AIAssistantContext.Provider value={{ 
      messages, 
      isLoading, 
      error, 
      sendMessage, 
      clearChat,
      setUserRole 
    }}>
      {children}
    </AIAssistantContext.Provider>
  );
};

export const useAIAssistantContext = () => {
  const context = useContext(AIAssistantContext);
  if (!context) {
    throw new Error('useAIAssistantContext must be used within AIAssistantProvider');
  }
  return context;
};
