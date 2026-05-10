import { useNavigate } from 'react-router-dom';
import { useCampaignTemplates } from '@/hooks/useCampaignTemplates';
import { useDuplicateCampaign } from '@/hooks/useCampaignMutations';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export function TemplateStrip() {
  const { data: templates, isLoading } = useCampaignTemplates();
  const duplicateCampaign = useDuplicateCampaign();
  const navigate = useNavigate();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const handleDuplicate = async (templateId: string) => {
    setDuplicatingId(templateId);
    try {
      const result = await duplicateCampaign.mutateAsync(templateId);
      navigate(`/dashboard/business/campaigns/${result.id}/edit`);
    } finally {
      setDuplicatingId(null);
    }
  };

  if (isLoading || !templates?.length) return null;

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Your Templates</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => handleDuplicate(t.id)}
            disabled={duplicatingId === t.id}
            className="min-w-[140px] bg-gray-50 rounded-xl p-3 border border-gray-200 text-left flex-shrink-0 hover:border-teal-300 transition-colors disabled:opacity-50"
          >
            {duplicatingId === t.id ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
              </div>
            ) : (
              <>
                <p className="font-bold text-sm text-gray-900 line-clamp-1">{t.title}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {t.deliverables?.length ?? 0} item{(t.deliverables?.length ?? 0) !== 1 ? 's' : ''}
                  {t.budget_min ? ` · $${t.budget_min}` : ''}
                  {t.budget_max ? `–$${t.budget_max}` : ''}
                </p>
                <p className="text-[11px] text-teal-500 mt-1">
                  {t.use_count > 0 ? `Used ${t.use_count} time${t.use_count !== 1 ? 's' : ''}` : 'New'}
                </p>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
