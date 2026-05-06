import { DonnyAvatar } from '@/components/donny/DonnyAvatar';

interface DonnyGreetingProps {
  isExtracting: boolean;
}

export function DonnyGreeting({ isExtracting }: DonnyGreetingProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <DonnyAvatar size="lg" state={isExtracting ? 'thinking' : 'idle'} glow={isExtracting} />
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">
          Create a Campaign
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Paste a link, drop a photo, or tell me about your restaurant
        </p>
      </div>
    </div>
  );
}
