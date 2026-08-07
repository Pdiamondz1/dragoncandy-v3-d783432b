import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AppChip } from '@/components/app/AppChip';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { MAX_CAMPAIGN_TAGS, normalizeCampaignTags } from '@/lib/campaignAudience';

interface CampaignTagsFieldProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Creative-direction cues the creator reads on the brief — what to point a camera at.
 * Donny suggests these; the business prunes and adds.
 */
export function CampaignTagsField({ tags, onChange }: CampaignTagsFieldProps) {
  // One nullable state, not a `draft` + `isAdding` pair that has to be kept in sync:
  // "adding" is simply draft !== null.
  const [draft, setDraft] = useState<string | null>(null);
  const isFull = tags.length >= MAX_CAMPAIGN_TAGS;

  const commit = () => {
    const next = normalizeCampaignTags([...tags, draft ?? '']);
    if (next.length !== tags.length) onChange(next);
    setDraft(null);
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign Tags</label>
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        {tags.map((tag) => (
          // Same badge the campaign detail page and preview card use for these values, so a
          // tag looks identical everywhere it appears.
          <AppStatusBadge key={tag} tone="teal" className="gap-1 border border-dc-teal/20">
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="text-dc-teal-btn/60 hover:text-dc-teal-btn"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              <X className="w-3 h-3" />
            </button>
          </AppStatusBadge>
        ))}
        {draft !== null ? (
          <Input
            autoFocus
            value={draft}
            placeholder="golden hour"
            className="h-7 w-32 text-xs"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') setDraft(null);
            }}
          />
        ) : !isFull && (
          <AppChip className="px-2.5 py-1 text-xs" onClick={() => setDraft('')}>
            + add
          </AppChip>
        )}
      </div>
    </div>
  );
}
