import { useState } from 'react';
import { motion } from '@/lib/motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';

interface BioStepProps {
  bio: string;
  onBioChange: (bio: string) => void;
}

const SUGGESTIONS = [
  "I create viral food content for restaurants",
  "NYC-based photographer & video editor",
  "Helping brands tell stories through video",
  "UGC creator specializing in lifestyle content",
  "Social media wizard for small businesses",
];

export function BioStep({ bio, onBioChange }: BioStepProps) {
  const [showSuggestions, setShowSuggestions] = useState(!bio);

  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Label htmlFor="creator-bio" className="sr-only">Bio</Label>
        <Input
          id="creator-bio"
          value={bio}
          onChange={e => {
            onBioChange(e.target.value);
            if (e.target.value) setShowSuggestions(false);
          }}
          onFocus={() => { if (!bio) setShowSuggestions(true); }}
          placeholder="I create viral food content for restaurants"
          className="text-center text-lg font-medium h-14 rounded-2xl border-2 border-landing-line bg-white text-landing-ink focus-visible:ring-2 focus-visible:ring-landing-mint placeholder:text-landing-ink-soft"
          maxLength={120}
          autoFocus
        />
        <p className="text-xs text-landing-ink-soft text-center mt-2">
          {bio.length}/120
        </p>
      </motion.div>

      {showSuggestions && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full space-y-2"
        >
          <div className="flex items-center justify-center gap-1.5 text-xs text-landing-ink-soft">
            <Sparkles className="w-3 h-3" />
            <span>Tap one to get started</span>
          </div>
          {SUGGESTIONS.map((suggestion, i) => (
            <motion.button
              key={suggestion}
              type="button"
              onClick={() => {
                onBioChange(suggestion);
                setShowSuggestions(false);
              }}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.06 }}
              whileTap={{ scale: 0.97 }}
              className="w-full text-left px-4 py-3 rounded-xl border border-landing-line bg-white text-sm text-landing-ink-soft hover:border-landing-mint hover:bg-landing-mint-soft transition-colors"
            >
              "{suggestion}"
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
