import { Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type {
  BrandBriefData,
  BrandGoal,
  CreatorPersona,
  GeographicScope,
} from '@/hooks/useBrandCampaignWizard';

interface BrandCampaignBriefStepProps {
  briefData: BrandBriefData;
  onBriefDataChange: (data: BrandBriefData) => void;
  onGenerateAnalysis: () => void;
  isGenerating: boolean;
  hasAnalysis: boolean;
  onNext: () => void;
}

const BRAND_GOALS: { value: BrandGoal; label: string }[] = [
  { value: 'awareness', label: 'Brand Awareness' },
  { value: 'conversions', label: 'Conversions' },
  { value: 'ugc_volume', label: 'UGC Volume' },
  { value: 'launch_hype', label: 'Launch Hype' },
];

const CREATOR_PERSONAS: { value: CreatorPersona; label: string }[] = [
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'foodie', label: 'Foodie' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'tech', label: 'Tech' },
  { value: 'travel', label: 'Travel' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'parenting', label: 'Parenting' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'comedy', label: 'Comedy' },
];

const PLATFORMS: { value: string; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
];

const GEOGRAPHIC_SCOPES: { value: GeographicScope; label: string }[] = [
  { value: 'city', label: 'City / Local' },
  { value: 'region', label: 'Regional' },
  { value: 'national', label: 'National' },
];

export const BrandCampaignBriefStep = ({
  briefData,
  onBriefDataChange,
  onGenerateAnalysis,
  isGenerating,
  hasAnalysis,
  onNext,
}: BrandCampaignBriefStepProps) => {
  const updateField = <K extends keyof BrandBriefData>(
    field: K,
    value: BrandBriefData[K]
  ) => {
    onBriefDataChange({ ...briefData, [field]: value });
  };

  const togglePersona = (persona: CreatorPersona) => {
    const current = briefData.targetPersonas;
    const updated = current.includes(persona)
      ? current.filter((p) => p !== persona)
      : [...current, persona];
    updateField('targetPersonas', updated);
  };

  const togglePlatform = (platform: string) => {
    const current = briefData.platforms;
    const updated = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    updateField('platforms', updated);
  };

  const isVisionValid = briefData.campaignVision.trim().length >= 20;

  return (
    <div className="space-y-6">
      {/* Campaign Name */}
      <Card className="rounded-2xl border border-teal-300">
        <CardContent className="p-4 space-y-2">
          <label className="text-sm font-semibold text-gray-800">
            Campaign Name <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="e.g. Summer Glow Launch"
            value={briefData.campaignName}
            onChange={(e) => updateField('campaignName', e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Tagline */}
      <Card className="rounded-2xl border border-teal-300">
        <CardContent className="p-4 space-y-2">
          <label className="text-sm font-semibold text-gray-800">
            Tagline
          </label>
          <Input
            placeholder="A short punchy line for your campaign"
            value={briefData.tagline}
            onChange={(e) => updateField('tagline', e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Brand Goal */}
      <Card className="rounded-2xl border border-teal-300">
        <CardContent className="p-4 space-y-3">
          <label className="text-sm font-semibold text-gray-800">
            Brand Goal
          </label>
          <div className="flex flex-wrap gap-2">
            {BRAND_GOALS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => updateField('brandGoal', value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  briefData.brandGoal === value
                    ? 'bg-dc-teal text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Target Creator Personas */}
      <Card className="rounded-2xl border border-teal-300">
        <CardContent className="p-4 space-y-3">
          <label className="text-sm font-semibold text-gray-800">
            Target Creator Personas
          </label>
          <div className="flex flex-wrap gap-2">
            {CREATOR_PERSONAS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => togglePersona(value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  briefData.targetPersonas.includes(value)
                    ? 'bg-dc-teal text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Platforms */}
      <Card className="rounded-2xl border border-teal-300">
        <CardContent className="p-4 space-y-3">
          <label className="text-sm font-semibold text-gray-800">
            Platforms
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => togglePlatform(value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  briefData.platforms.includes(value)
                    ? 'bg-dc-teal text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Geographic Scope */}
      <Card className="rounded-2xl border border-teal-300">
        <CardContent className="p-4 space-y-3">
          <label className="text-sm font-semibold text-gray-800">
            Geographic Scope
          </label>
          <div className="flex flex-wrap gap-2">
            {GEOGRAPHIC_SCOPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => updateField('geographicScope', value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  briefData.geographicScope === value
                    ? 'bg-dc-teal text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Campaign Vision */}
      <Card className="rounded-2xl border border-teal-300">
        <CardContent className="p-4 space-y-2">
          <label className="text-sm font-semibold text-gray-800">
            Campaign Vision
          </label>
          <Textarea
            placeholder="Describe what you want creators to produce..."
            value={briefData.campaignVision}
            onChange={(e) => updateField('campaignVision', e.target.value)}
            rows={4}
          />
          {briefData.campaignVision.length > 0 &&
            !isVisionValid && (
              <p className="text-xs text-gray-500">
                Minimum 20 characters ({briefData.campaignVision.trim().length}/20)
              </p>
            )}
        </CardContent>
      </Card>

      {/* Generate with AI */}
      <Button
        onClick={onGenerateAnalysis}
        disabled={isGenerating || !isVisionValid}
        className="w-full rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-semibold"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate with AI
          </>
        )}
      </Button>

      {/* Continue */}
      {hasAnalysis && (
        <Button
          onClick={onNext}
          variant="outline"
          className="w-full rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10 font-semibold"
        >
          Continue
        </Button>
      )}
    </div>
  );
};
