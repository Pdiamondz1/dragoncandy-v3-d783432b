import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useDelegatedPermissions } from '@/hooks/outstand/useDelegatedPermissions';

interface DelegatePostingToggleProps {
  granteeId: string;
  granteeName: string;
  campaignId: string;
  availablePlatforms: string[];
}

export const DelegatePostingToggle: React.FC<DelegatePostingToggleProps> = ({
  granteeId, granteeName, campaignId, availablePlatforms,
}) => {
  const { grantPermission } = useDelegatedPermissions(campaignId);
  const [enabled, setEnabled] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(availablePlatforms);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (checked && selectedPlatforms.length > 0) {
      grantPermission({ granteeId, platforms: selectedPlatforms, campaignId });
    }
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  return (
    <div className="border border-gray-200 rounded-xl p-3 mt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">
          Allow <span className="font-semibold">{granteeName}</span> to also post to your channels?
        </p>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
      {enabled && (
        <div className="mt-2 space-y-1.5">
          {availablePlatforms.map((p) => (
            <label key={p} className="flex items-center gap-2 text-xs">
              <Checkbox checked={selectedPlatforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
              <span className="capitalize">{p}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
