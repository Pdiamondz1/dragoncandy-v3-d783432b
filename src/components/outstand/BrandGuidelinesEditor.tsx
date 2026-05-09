import React, { useState, useEffect } from 'react';
import { useBrandGuidelines, type BrandSocialGuidelines } from '@/hooks/outstand/useBrandGuidelines';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder: string;
}

function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-dc-teal/10 text-dc-teal text-xs font-medium px-2.5 py-1 rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="hover:text-red-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={!input.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export const BrandGuidelinesEditor: React.FC = () => {
  const { guidelines, isLoading, save, isSaving } = useBrandGuidelines();
  const [draft, setDraft] = useState<BrandSocialGuidelines>(guidelines);

  useEffect(() => {
    setDraft(guidelines);
  }, [guidelines]);

  if (isLoading) {
    return <div className="text-sm text-gray-400 py-4">Loading guidelines...</div>;
  }

  const handleSave = () => save(draft);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(guidelines);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Voice &amp; Tone
        </label>
        <Input
          value={draft.voice_tone}
          onChange={(e) => setDraft({ ...draft, voice_tone: e.target.value })}
          placeholder="Professional but approachable"
          className="mt-1 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Required Hashtags
        </label>
        <div className="mt-1">
          <TagInput
            tags={draft.required_hashtags}
            onChange={(t) => setDraft({ ...draft, required_hashtags: t })}
            placeholder="#YourBrand"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Mandatory Disclosures
        </label>
        <div className="mt-1">
          <TagInput
            tags={draft.mandatory_disclosures}
            onChange={(t) => setDraft({ ...draft, mandatory_disclosures: t })}
            placeholder="#ad"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Prohibited Words
        </label>
        <div className="mt-1">
          <TagInput
            tags={draft.prohibited_words}
            onChange={(t) => setDraft({ ...draft, prohibited_words: t })}
            placeholder="competitor name"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Default CTA
        </label>
        <Input
          value={draft.default_cta}
          onChange={(e) => setDraft({ ...draft, default_cta: e.target.value })}
          placeholder="Learn more at yourbrand.com"
          className="mt-1 text-sm"
        />
      </div>
      <Button
        onClick={handleSave}
        disabled={isSaving || !hasChanges}
        className="w-full"
        variant="dc-primary"
      >
        {isSaving ? 'Saving...' : 'Save Guidelines'}
      </Button>
    </div>
  );
};
