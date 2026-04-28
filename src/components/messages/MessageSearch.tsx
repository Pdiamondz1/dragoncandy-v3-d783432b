
import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X } from 'lucide-react';
import { useSearchMessages } from '@/hooks/useMessages';
import MessageBubbleEnhanced from './MessageBubbleEnhanced';

interface MessageSearchProps {
  campaignId: string;
  isOpen: boolean;
  onClose: () => void;
}

const MessageSearch: React.FC<MessageSearchProps> = ({ campaignId, isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  const { data: searchResults = [], isLoading } = useSearchMessages(campaignId, debouncedQuery);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="border-l bg-white w-96 flex flex-col" role="search">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b">
        <Search className="h-5 w-5 text-gray-500" aria-hidden="true" />
        <h3 className="font-medium flex-1">Search Messages</h3>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close search">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search input */}
      <div className="p-4 border-b">
        <Input
          placeholder="Search messages…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
          aria-label="Search messages"
          name="search"
        />
      </div>

      {/* Search results */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading && (
            <div className="text-center text-gray-500 py-8">
              Searching…
            </div>
          )}
          
          {!isLoading && searchQuery && searchResults.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No messages found for "{searchQuery}"
            </div>
          )}

          {!searchQuery && (
            <div className="text-center text-gray-500 py-8">
              Type to search messages
            </div>
          )}

          {searchResults.map((message) => (
            <MessageBubbleEnhanced
              key={message.id}
              message={message}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default MessageSearch;
