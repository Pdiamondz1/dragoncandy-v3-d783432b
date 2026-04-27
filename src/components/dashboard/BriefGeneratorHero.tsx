// src/components/dashboard/BriefGeneratorHero.tsx
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Globe, CheckCircle2, Loader2, BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTierGate } from '@/hooks/useTierGate';
import { SoftPaywallSheet } from '@/components/pricing/SoftPaywallSheet';
import { toast } from 'sonner';

interface BriefGeneratorHeroProps {
  orgId?: string;
}

interface GeneratedBrief {
  campaign_name: string;
  campaign_description: string;
  target_audience: string;
  content_suggestions: string[];
  [key: string]: unknown;
}

const PROGRESS_STEPS = [
  'Scanning website...',
  'Analyzing brand...',
  'Generating brief...',
  'Polishing results...',
] as const;

export function BriefGeneratorHero({ orgId }: BriefGeneratorHeroProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const gate = useTierGate('brief_generation');

  const [url, setUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(-1);
  const [brief, setBrief] = useState<GeneratedBrief | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const runProgressAnimation = useCallback(() => {
    setProgressIndex(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PROGRESS_STEPS.length; i++) {
      timers.push(setTimeout(() => setProgressIndex(i), i * 1200));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleGenerate = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    try { new URL(trimmed); } catch {
      toast.error('Please enter a valid URL (e.g. https://example.com)');
      return;
    }

    if (!gate.allowed) {
      setShowPaywall(true);
      return;
    }

    setIsGenerating(true);
    setBrief(null);
    const cleanup = runProgressAnimation();

    try {
      const { data, error } = await supabase.functions.invoke('donny-campaign-generate', {
        body: { url: trimmed },
      });

      if (error) throw error;

      const result = data as GeneratedBrief;
      setBrief(result);

      if (user?.id && orgId) {
        const { error: insertError } = await supabase.from('campaign_brief_generations' as any).insert({
          user_id: user.id,
          org_id: orgId,
          source_url: trimmed,
          brief_jsonb: result,
          generated_at: new Date().toISOString(),
        });
        if (insertError) console.warn('Failed to record brief generation:', insertError);
      }
    } catch (err) {
      console.error('Brief generation failed:', err);
      toast.error('Brief generation failed', {
        description: 'Check the URL and try again.',
      });
    } finally {
      cleanup();
      setIsGenerating(false);
      setProgressIndex(-1);
    }
  }, [url, gate.allowed, runProgressAnimation, user?.id, orgId]);

  const handleSaveForLater = useCallback(() => {
    if (brief) {
      localStorage.setItem('pendingBrief', JSON.stringify(brief));
      toast.success('Brief saved locally. Create a campaign when you\'re ready.');
    }
  }, [brief]);

  // Progress animation view
  if (isGenerating) {
    return (
      <div className="rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-dc-teal animate-pulse" />
          <p className="text-sm font-bold uppercase tracking-wide text-dc-teal">
            Generating brief
          </p>
        </div>
        <div className="space-y-3">
          {PROGRESS_STEPS.map((step, i) => (
            <div
              key={step}
              className={`flex items-center gap-2 transition-opacity duration-300 ${
                i <= progressIndex ? 'opacity-100' : 'opacity-30'
              }`}
            >
              {i < progressIndex ? (
                <CheckCircle2 className="w-4 h-4 text-dc-teal shrink-0" />
              ) : i === progressIndex ? (
                <Loader2 className="w-4 h-4 text-dc-teal animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
              )}
              <span className="text-sm text-gray-700">{step}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Brief reveal view
  if (brief) {
    return (
      <div className="rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-dc-teal" />
          <p className="text-sm font-bold uppercase tracking-wide text-dc-teal">
            Your brief is ready
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Campaign name
            </p>
            <p className="text-base font-bold text-gray-900">
              {brief.campaign_name}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Description
            </p>
            <p className="text-sm text-gray-700">{brief.campaign_description}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Target audience
            </p>
            <p className="text-sm text-gray-700">{brief.target_audience}</p>
          </div>

          {brief.content_suggestions?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Content suggestions
              </p>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mt-1">
                {brief.content_suggestions.map((suggestion, i) => (
                  <li key={`${i}-${suggestion}`}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="dc-primary"
            className="flex-1"
            onClick={() => navigate('/dashboard/business/campaigns/create')}
          >
            Create campaign from brief
          </Button>
          <Button
            variant="dc-outline"
            className="flex-1"
            onClick={handleSaveForLater}
          >
            <BookmarkPlus className="w-4 h-4" />
            Save for later
          </Button>
        </div>
      </div>
    );
  }

  // Default input view
  return (
    <>
      <div className="rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-dc-teal" />
          <p className="text-lg font-bold text-gray-900">
            Generate a free campaign brief in 60 seconds.
          </p>
        </div>

        <div className="relative">
          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            type="url"
            placeholder="Paste your website URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="pl-10"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGenerate();
            }}
          />
        </div>

        <Button
          variant="dc-primary"
          className="w-full"
          disabled={!url.trim()}
          onClick={handleGenerate}
        >
          Generate brief — free
        </Button>
      </div>

      <SoftPaywallSheet
        featureKey="brief_generation"
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
      />
    </>
  );
}
