import { DonnyAvatar } from '@/components/donny/DonnyAvatar';

interface ExtractionFeedProps {
  messages: string[];
  isExtracting: boolean;
}

export function ExtractionFeed({ messages, isExtracting }: ExtractionFeedProps) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-3 mt-6">
      {messages.map((msg, i) => (
        <div
          key={i}
          className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <DonnyAvatar
            size="sm"
            state={i === messages.length - 1 && isExtracting ? 'thinking' : 'idle'}
          />
          <div className="bg-[#F9A8D4] rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%]">
            <p className="text-sm text-gray-900">{msg}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
