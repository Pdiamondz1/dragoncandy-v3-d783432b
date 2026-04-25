import { DonnyAvatar } from './DonnyAvatar';

export function DonnyTypingIndicator() {
  return (
    <div className="flex gap-2 items-end" role="status" aria-label="Donny is typing">
      <DonnyAvatar size="sm" state="thinking" />
      <div className="bg-[#F9A8D4] rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-[#111] rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" />
          <span className="w-1.5 h-1.5 bg-[#111] rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.15s]" style={{ animationDelay: '0.15s' }} />
          <span className="w-1.5 h-1.5 bg-[#111] rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.3s]" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  );
}
