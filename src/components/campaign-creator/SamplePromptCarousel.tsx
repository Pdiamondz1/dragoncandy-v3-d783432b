import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useReducedMotion } from '@/lib/motion';

interface SamplePromptCarouselProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const TEMPLATES = [
  {
    label: 'Weekend Promo',
    template: `We're [Restaurant] in [City]. Looking for 2 Instagram reels showcasing our [signature dish] this weekend. Fun, vibrant energy — think foodie date night vibes.`,
  },
  {
    label: 'New Menu Launch',
    template: `[Restaurant] just launched a new summer menu. Need a TikTok and an IG carousel highlighting our top 3 new dishes. Clean, bright plating shots with a casual voiceover.`,
  },
  {
    label: 'Grand Opening',
    template: `We're opening [Restaurant] in [Neighborhood] next Friday! Need 3 creators to cover opening night — 1 reel each, plus stories. Energetic, packed-house vibes.`,
  },
  {
    label: 'Seasonal Special',
    template: `[Restaurant] is running a Valentine's Day prix fixe dinner. Looking for 1 romantic, cinematic reel — candlelit ambiance, plated courses, couple reactions.`,
  },
];

function personalize(template: string, businessName?: string): string {
  if (!businessName) return template;
  return template.replace(/\[Restaurant\]/g, businessName);
}

export function SamplePromptCarousel({ onSelect, disabled }: SamplePromptCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showCopied, setShowCopied] = useState(false);
  const { profile } = useAuth();

  const businessName = profile?.business_name ?? undefined;
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % TEMPLATES.length);
    }, 5000);
    return () => clearInterval(id);
  }, [reducedMotion, paused]);

  const handleTap = useCallback(() => {
    if (disabled) return;
    const text = personalize(TEMPLATES[activeIndex].template, businessName);
    onSelect(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  }, [activeIndex, businessName, disabled, onSelect]);

  const current = TEMPLATES[activeIndex];
  const displayText = personalize(current.template, businessName);

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={disabled}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative w-full bg-teal-50 border border-teal-200 rounded-2xl p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-50 mt-4"
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={paused ? "Resume carousel" : "Pause carousel"}
        onClick={(e) => { e.stopPropagation(); setPaused(p => !p); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setPaused(p => !p); } }}
        className="absolute bottom-3 right-3 p-1.5 rounded-full bg-dc-dark/50 text-white text-xs z-10"
      >
        {paused ? "▶" : "⏸"}
      </span>
      <div className="flex items-center justify-between mb-2">
        <span className="text-teal-500 font-semibold text-[11px] uppercase tracking-wide">
          Try this example
        </span>
        <span className="text-gray-400 text-[11px]">
          {showCopied ? 'Copied!' : 'Tap to copy'}
        </span>
      </div>
      <p className="text-gray-700 text-[13px] leading-relaxed">
        "{displayText}"
      </p>
      <div className="flex items-center gap-1.5 mt-3">
        {TEMPLATES.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === activeIndex ? 'bg-teal-400' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </button>
  );
}
