import { X, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import DeliverableBuilder from '@/components/campaigns/DeliverableBuilder';
import type { BrandDetailsData } from '@/hooks/useBrandCampaignWizard';
import type { StagedFile } from '@/types/campaignMedia';

interface BrandCampaignDetailsStepProps {
  detailsData: BrandDetailsData;
  onDetailsDataChange: (data: BrandDetailsData) => void;
  onContinue: () => void;
  onBack: () => void;
}

const USAGE_RIGHTS_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '0', label: 'Perpetual' },
];

export const BrandCampaignDetailsStep = ({
  detailsData,
  onDetailsDataChange,
  onContinue,
  onBack,
}: BrandCampaignDetailsStepProps) => {
  const updateField = <K extends keyof BrandDetailsData>(
    field: K,
    value: BrandDetailsData[K]
  ) => {
    onDetailsDataChange({ ...detailsData, [field]: value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    const newFiles: StagedFile[] = Array.from(fileList).map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    updateField('brandAssets', [...detailsData.brandAssets, ...newFiles]);
    e.target.value = '';
  };

  const removeAsset = (index: number) => {
    const updated = detailsData.brandAssets.filter((_, i) => i !== index);
    updateField('brandAssets', updated);
  };

  const canContinue =
    detailsData.budgetMax > 0 &&
    detailsData.creatorCount >= 1 &&
    detailsData.deliverables.length >= 1;

  return (
    <div className="space-y-6">
      {/* Budget & Scale */}
      <Card className="rounded-2xl border border-dc-teal">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Budget & Scale</h3>

          {/* Budget Pool */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Budget Pool ($)</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Min"
                  min={0}
                  value={detailsData.budgetMin || ''}
                  onChange={(e) =>
                    updateField('budgetMin', Number(e.target.value))
                  }
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Max"
                  min={0}
                  value={detailsData.budgetMax || ''}
                  onChange={(e) =>
                    updateField('budgetMax', Number(e.target.value))
                  }
                />
              </div>
            </div>
          </div>

          {/* Per-Creator Payout Cap */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Per-Creator Payout Cap</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                $
              </span>
              <Input
                type="number"
                className="pl-7"
                placeholder="0"
                min={0}
                value={detailsData.perCreatorCap || ''}
                onChange={(e) =>
                  updateField('perCreatorCap', Number(e.target.value))
                }
              />
            </div>
          </div>

          {/* Number of Creators */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">
              Number of Creators <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              placeholder="1"
              min={1}
              value={detailsData.creatorCount || ''}
              onChange={(e) =>
                updateField('creatorCount', Number(e.target.value))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Deliverables */}
      <Card className="rounded-2xl border border-dc-teal">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Required Deliverable Mix <span className="text-red-500">*</span>
          </h3>
          <DeliverableBuilder
            deliverables={detailsData.deliverables}
            onChange={(deliverables) => updateField('deliverables', deliverables)}
            maxDeliverables={20}
          />
        </CardContent>
      </Card>

      {/* Brand Assets */}
      <Card className="rounded-2xl border border-dc-teal">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Brand Assets</h3>

          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-6 cursor-pointer hover:border-dc-teal transition-colors">
            <Upload className="h-6 w-6 text-gray-400" />
            <span className="text-sm text-gray-500 text-center">
              Upload logo, brand guidelines, sample content
            </span>
            <input
              type="file"
              className="hidden"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileChange}
            />
          </label>

          {detailsData.brandAssets.length > 0 && (
            <ul className="space-y-2">
              {detailsData.brandAssets.map((asset, idx) => (
                <li
                  key={`${asset.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                >
                  <span className="text-sm text-gray-700 truncate max-w-[200px]">
                    {asset.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAsset(idx)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Requirements */}
      <Card className="rounded-2xl border border-dc-teal">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Requirements</h3>

          {/* Hashtag / Tagging */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">
              Hashtag / Tagging Requirements
            </label>
            <Textarea
              placeholder="#YourBrand @yourbrand — one per line"
              value={detailsData.hashtagRequirements}
              onChange={(e) =>
                updateField('hashtagRequirements', e.target.value)
              }
              rows={3}
            />
          </div>

          {/* Usage Rights Window */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Usage Rights Window</label>
            <Select
              value={String(detailsData.usageRightsDays)}
              onValueChange={(val) =>
                updateField('usageRightsDays', Number(val))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {USAGE_RIGHTS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Exclusivity Period */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600">
              Exclusivity Period
            </label>
            <Input
              type="number"
              placeholder="e.g. 30"
              min={0}
              value={detailsData.exclusivityDays || ''}
              onChange={(e) =>
                updateField('exclusivityDays', Number(e.target.value))
              }
            />
            <p className="text-xs text-gray-400">
              No competitor brands for this many days
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 rounded-full font-semibold"
        >
          Back
        </Button>
        <Button
          onClick={onContinue}
          disabled={!canContinue}
          className="flex-1 rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-semibold"
        >
          Continue
        </Button>
      </div>
    </div>
  );
};
