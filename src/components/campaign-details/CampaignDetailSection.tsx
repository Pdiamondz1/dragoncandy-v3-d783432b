interface CampaignDetailSectionProps {
  title: string;
  children: React.ReactNode;
}

export function CampaignDetailSection({ title, children }: CampaignDetailSectionProps) {
  return (
    <div className="border border-dc-teal/15 rounded-xl overflow-hidden mb-3">
      <div className="bg-teal-50 px-4 py-2.5">
        <span className="font-semibold text-sm text-gray-900">{title}</span>
      </div>
      <div className="px-4 py-3 border-t border-dc-teal/15 space-y-3">
        {children}
      </div>
    </div>
  );
}
