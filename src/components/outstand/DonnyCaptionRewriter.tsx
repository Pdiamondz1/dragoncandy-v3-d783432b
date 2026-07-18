import React, { useState } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DonnyCaptionRewriterProps {
  originalCaption: string;
  platform: string;
  creatorId: string;
  onAccept: (rewrittenCaption: string) => void;
}

export const DonnyCaptionRewriter: React.FC<DonnyCaptionRewriterProps> = ({
  originalCaption,
  platform,
  creatorId,
  onAccept,
}) => {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleRewrite = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('donny-orchestrator', {
        body: {
          query: `Rewrite this caption in my personal voice for ${platform}. Keep it authentic and engaging. Original caption: "${originalCaption}"`,
          page_path: '/social/cross-post',
          user_role: 'creator',
          page_context: { creator_id: creatorId, platform },
        },
      });

      if (error) throw error;

      const lines = (data as string).split('\n');
      const eventLine = lines.find((l: string) => l.startsWith('data: '));
      if (eventLine) {
        const parsed = JSON.parse(eventLine.replace('data: ', ''));
        setSuggestion(parsed.text ?? parsed.answer ?? null);
      }
    } catch (err) {
      console.error('[DonnyCaptionRewriter]', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (dismissed) return null;

  if (!suggestion) {
    return (
      <button
        onClick={handleRewrite}
        disabled={isLoading}
        className="flex items-center gap-1.5 text-xs text-dc-teal font-semibold mt-2 hover:underline disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {isLoading ? 'Rewriting...' : 'Rewrite in my voice'}
      </button>
    );
  }

  return (
    <div className="bg-teal-50 rounded-lg p-2 mt-2 border border-teal-200">
      <p className="text-[10px] font-semibold uppercase text-teal-600 tracking-wide mb-1">
        Donny's suggestion
      </p>
      <p className="text-xs text-gray-700">{suggestion}</p>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => { onAccept(suggestion); setDismissed(true); }}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-dc-teal-btn px-2.5 py-1 rounded-full hover:bg-dc-teal-btn-hover"
        >
          <Check className="h-3 w-3" />
          Use this
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-[10px] font-semibold text-gray-400 hover:text-gray-600"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
