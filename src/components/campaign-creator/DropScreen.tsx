import { SmartInput } from './SmartInput';
import { DonnyGreeting } from './DonnyGreeting';
import { ExtractionFeed } from './ExtractionFeed';

interface DropScreenProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  extractionMessages: string[];
}

export function DropScreen({ onSubmit, isExtracting, extractionMessages }: DropScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <DonnyGreeting isExtracting={isExtracting} />
      <div className="w-full max-w-md">
        <SmartInput onSubmit={onSubmit} isExtracting={isExtracting} />
        <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
      </div>
    </div>
  );
}
