interface ExtractionFeedProps {
  messages: string[];
  isExtracting: boolean;
}

export function ExtractionFeed({ messages, isExtracting }: ExtractionFeedProps) {
  if (messages.length === 0) return null;

  const latestMessage = messages[messages.length - 1];

  return (
    <div className="flex flex-col items-center justify-center py-6 animate-in fade-in duration-300">
      <p className="text-sm text-gray-500 text-center tracking-wide">
        {latestMessage}
      </p>
      {isExtracting && (
        <div className="flex gap-1.5 mt-3">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse [animation-delay:300ms]" />
        </div>
      )}
    </div>
  );
}
