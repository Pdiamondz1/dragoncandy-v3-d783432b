import { useState } from 'react';
import { SmartInput } from './SmartInput';
import { DonnyGreeting } from './DonnyGreeting';
import { ExtractionFeed } from './ExtractionFeed';
import { SamplePromptCarousel } from './SamplePromptCarousel';
import { InspirationStrip } from './InspirationStrip';
import { TemplateStrip } from './TemplateStrip';
import type { InspirationRef } from '@/types/firstRun';

interface DropScreenProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  extractionMessages: string[];
  /** Seeds the input when generation was started without typing (e.g. the
   * Donny-chat `?brief=` handoff) so a failed run is retryable in one tap. */
  prefillValue?: string;
  onInspirationChange?: (refs: InspirationRef[]) => void;
  onInspirationScrolled?: () => void;
}

export function DropScreen({ onSubmit, isExtracting, extractionMessages, prefillValue, onInspirationChange, onInspirationScrolled }: DropScreenProps) {
  const [externalValue, setExternalValue] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <DonnyGreeting isExtracting={isExtracting} />
      <div className="w-full max-w-md">
        <SmartInput onSubmit={onSubmit} isExtracting={isExtracting} externalValue={externalValue ?? prefillValue} />
        <SamplePromptCarousel onSelect={setExternalValue} disabled={isExtracting} />
        <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
        <TemplateStrip />
        <InspirationStrip
          onSelectionChange={onInspirationChange ?? (() => {})}
          onScrolled={onInspirationScrolled}
        />
      </div>
    </div>
  );
}
