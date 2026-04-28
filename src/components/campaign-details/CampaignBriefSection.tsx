import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignBriefSectionProps {
  description?: string | null;
  goals?: string | null;
  style?: string | null;
  tone?: string | null;
  targetPersonas?: string[] | null;
  tagline?: string | null;
  campaignType?: string | null;
  hashtags?: string | null;
}

export function CampaignBriefSection({
  description,
  goals,
  style,
  tone,
  targetPersonas,
  tagline,
  campaignType,
  hashtags,
}: CampaignBriefSectionProps) {
  if (!description && !goals && !style && !tone) return null;

  const goalList = goals
    ?.split(/[,\n]/)
    .map((g) => g.trim())
    .filter(Boolean);

  return (
    <CampaignDetailSection title="Campaign Brief">
      {(tagline || campaignType) && (
        <div className="flex flex-wrap items-center gap-2">
          {campaignType && (
            <span className="bg-teal-50 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full capitalize">
              {campaignType.replace(/_/g, ' ')}
            </span>
          )}
          {tagline && (
            <p className="text-sm text-gray-700 italic">{tagline}</p>
          )}
        </div>
      )}

      {description && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
          {description}
        </p>
      )}

      {goalList && goalList.length > 0 && (
        <div>
          <span className="text-[11px] text-gray-500 uppercase">Goals</span>
          <ul className="mt-1 space-y-1">
            {goalList.map((g, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-dc-teal mt-0.5">•</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(style || tone) && (
        <div className="flex gap-4">
          {style && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Style</span>
              <p className="text-sm text-gray-700 mt-0.5">{style}</p>
            </div>
          )}
          {tone && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Tone</span>
              <p className="text-sm text-gray-700 mt-0.5">{tone}</p>
            </div>
          )}
        </div>
      )}

      {targetPersonas && targetPersonas.length > 0 && (
        <div>
          <span className="text-[11px] text-gray-500 uppercase">Target Audience</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {targetPersonas.map((p) => (
              <span key={p} className="bg-pink-100 text-pink-700 text-xs px-2.5 py-1 rounded-full capitalize">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {hashtags && (
        <div>
          <span className="text-[11px] text-gray-500 uppercase">Hashtags</span>
          <p className="text-sm text-teal-600 mt-0.5">{hashtags}</p>
        </div>
      )}
    </CampaignDetailSection>
  );
}
