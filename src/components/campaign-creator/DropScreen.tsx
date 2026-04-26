import { useState } from 'react';
import { SmartInput } from './SmartInput';
import { DonnyGreeting } from './DonnyGreeting';
import { ExtractionFeed } from './ExtractionFeed';
import { SamplePromptCarousel } from './SamplePromptCarousel';

interface DropScreenProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  extractionMessages: string[];
}

export function DropScreen({ onSubmit, isExtracting, extractionMessages }: DropScreenProps) {
  const [externalValue, setExternalValue] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <DonnyGreeting isExtracting={isExtracting} />
      <div className="w-full max-w-md">
        <SmartInput onSubmit={onSubmit} isExtracting={isExtracting} externalValue={externalValue} />
        <SamplePromptCarousel onSelect={setExternalValue} disabled={isExtracting} />
        <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
      </div>
    </div>
  );
}
