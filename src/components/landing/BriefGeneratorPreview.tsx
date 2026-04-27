import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Globe, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GeneratedBrief {
  campaign_name?: string;
  campaign_description?: string;
  target_audience?: string;
  content_suggestions?: string[];
  title?: string;
  description?: string;
  [key: string]: unknown;
}

const PROGRESS_STEPS = [
  'Scanning website...',
  'Analyzing brand...',
  'Generating brief...',
  'Polishing results...',
] as const;

export function BriefGeneratorPreview() {
  const navigate = useNavigate();

  const [url, setUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(-1);
  const [brief, setBrief] = useState<GeneratedBrief | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

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

    try {
      new URL(trimmed);
    } catch {
      toast.error('Please enter a valid URL (e.g. https://example.com)');
      return;
    }

    setIsGenerating(true);
    setBrief(null);
    setRateLimited(false);
    const cleanup = runProgressAnimation();

    try {
      const { data, error } = await supabase.functions.invoke(
        'generate-anonymous-brief',
        { body: { url: trimmed } },
      );

      if (error) throw error;

      if (data?.error === 'rate_limited') {
        setRateLimited(true);
        toast.info('One free brief per day', {
          description: 'Sign up for unlimited briefs.',
        });
        return;
      }

      setBrief(data as GeneratedBrief);
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
  }, [url, runProgressAnimation]);

  const handleSaveAndSignUp = useCallback(() => {
    if (brief) {
      localStorage.setItem('pendingBrief', JSON.stringify(brief));
    }
    navigate('/auth?mode=signup');
  }, [brief, navigate]);

  // Brief display name — handle both response formats
  const briefName = brief?.campaign_name || brief?.title || 'Your Campaign';
  const briefDescription = brief?.campaign_description || brief?.description || '';

  // Progress animation view
  if (isGenerating) {
    return (
      <section className="py-10 md:py-14">
        <div className="max-w-md mx-auto rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4 shadow-lg">
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
      </section>
    );
  }

  // Brief reveal view
  if (brief) {
    return (
      <section className="py-10 md:py-14">
        <div className="max-w-md mx-auto rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4 shadow-lg">
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
              <p className="text-base font-bold text-gray-900">{briefName}</p>
            </div>

            {briefDescription && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Description
                </p>
                <p className="text-sm text-gray-700 line-clamp-3">{briefDescription}</p>
              </div>
            )}

            {brief.target_audience && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Target audience
                </p>
                <p className="text-sm text-gray-700">{brief.target_audience}</p>
              </div>
            )}

            {brief.content_suggestions && brief.content_suggestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Content suggestions
                </p>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mt-1">
                  {brief.content_suggestions.slice(0, 3).map((suggestion, i) => (
                    <li key={`${i}-${suggestion}`}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <Button
            className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
            onClick={handleSaveAndSignUp}
          >
            Save this brief — sign up free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    );
  }

  // Rate-limited view
  if (rateLimited) {
    return (
      <section className="py-10 md:py-14">
        <div className="max-w-md mx-auto rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4 shadow-lg text-center">
          <Sparkles className="w-8 h-8 text-dc-teal mx-auto" />
          <p className="text-lg font-bold text-gray-900">
            You have already used your free brief today
          </p>
          <p className="text-sm text-gray-500">
            Sign up for a free account to generate unlimited briefs.
          </p>
          <Button
            className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
            onClick={() => navigate('/auth?mode=signup')}
          >
            Sign up free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    );
  }

  // Default input view
  return (
    <section className="py-10 md:py-14">
      <div className="max-w-md mx-auto rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-dc-teal" />
          <p className="text-lg font-bold text-gray-900">
            Generate a free campaign brief in 60 seconds.
          </p>
        </div>

        <p className="text-sm text-gray-500">
          Paste your website or social link. No sign-up required.
        </p>

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
          className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
          disabled={!url.trim()}
          onClick={handleGenerate}
        >
          Generate brief — free
        </Button>
      </div>
    </section>
  );
}
