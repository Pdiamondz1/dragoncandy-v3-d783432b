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
  source_quality?: { readable: boolean; chars: number };
  [key: string]: unknown;
}

const PROGRESS_STEPS = [
  'Scanning website…',
  'Analyzing brand…',
  'Generating brief…',
  'Polishing results…',
] as const;

// Light-palette surfaces shared across all four views (Joe redesign — see docs/DESIGN_SYSTEM.md).
const CARD =
  'max-w-md mx-auto rounded-2xl border-2 border-landing-line bg-white p-6 space-y-4 shadow-[0_14px_30px_rgba(36,19,50,0.08)]';
const CTA =
  'w-full h-12 rounded-full bg-landing-pink text-white font-semibold text-base shadow-landing-pink hover:shadow-landing-pink-hover transition-all';
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-landing-ink-soft';

export function BriefGeneratorPreview() {
  const navigate = useNavigate();

  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState(''); // bot decoy — humans never fill this
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
        { body: { url: trimmed, subject_hp: honeypot } },
      );

      if (error) throw error;

      // Every handled outcome arrives as HTTP 200 with an `error` discriminator.
      if (data?.error) {
        if (data.error === 'rate_limited' || data.error === 'capacity') {
          setRateLimited(true);
        } else {
          // fetch_failed | generation_failed
          toast.error("Couldn't generate from that link", {
            description: 'Try your homepage or menu URL.',
          });
        }
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
  }, [url, honeypot, runProgressAnimation]);

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
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-landing-mint animate-pulse" />
          <p className="text-sm font-bold uppercase tracking-wide text-landing-mint">
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
                <CheckCircle2 className="w-4 h-4 text-landing-mint shrink-0" />
              ) : i === progressIndex ? (
                <Loader2 className="w-4 h-4 text-landing-mint animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-landing-line shrink-0" />
              )}
              <span className="text-sm text-landing-ink-soft">{step}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Brief reveal view
  if (brief) {
    return (
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-landing-mint" />
          <p className="text-sm font-bold uppercase tracking-wide text-landing-mint">
            Your brief is ready
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className={LABEL}>Campaign name</p>
            <p className="text-base font-bold text-landing-ink">{briefName}</p>
          </div>

          {briefDescription && (
            <div>
              <p className={LABEL}>Description</p>
              <p className="text-sm text-landing-ink-soft line-clamp-3">{briefDescription}</p>
            </div>
          )}

          {brief.target_audience && (
            <div>
              <p className={LABEL}>Target audience</p>
              <p className="text-sm text-landing-ink-soft">{brief.target_audience}</p>
            </div>
          )}

          {brief.content_suggestions && brief.content_suggestions.length > 0 && (
            <div>
              <p className={LABEL}>Content suggestions</p>
              <ul className="list-disc list-inside text-sm text-landing-ink-soft space-y-1 mt-1">
                {brief.content_suggestions.slice(0, 3).map((suggestion, i) => (
                  <li key={`${i}-${suggestion}`}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {brief.source_quality?.readable === false && (
            <p className="text-xs text-landing-ink-soft">
              We couldn't pull much from that page — try your homepage or menu URL for a sharper draft.
            </p>
          )}
        </div>

        <Button className={CTA} onClick={handleSaveAndSignUp}>
          Save this brief — sign up free
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  // Rate-limited view
  if (rateLimited) {
    return (
      <div className={`${CARD} text-center`}>
        <Sparkles className="w-8 h-8 text-landing-mint mx-auto" />
        <p className="text-lg font-bold text-landing-ink">
          You have already used your free brief today
        </p>
        <p className="text-sm text-landing-ink-soft">
          Sign up for a free account to generate unlimited briefs.
        </p>
        <Button className={CTA} onClick={() => navigate('/auth?mode=signup')}>
          Sign up free
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  // Default input view
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-landing-mint" />
        <p className="text-lg font-bold text-landing-ink">
          Generate a free draft campaign brief in 60 seconds.
        </p>
      </div>

      <p className="text-sm text-landing-ink-soft">
        Paste your website or social link — works best with your homepage or menu. No sign-up required.
      </p>

      <div className="relative">
        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-landing-ink-soft pointer-events-none" />
        <Input
          type="url"
          placeholder="Paste your homepage or menu URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="pl-10 border-landing-line bg-white text-landing-ink placeholder:text-landing-ink-soft"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleGenerate();
          }}
        />
      </div>

      {/* Honeypot: invisible to humans, tempting to bots. Off-screen (not display:none,
          which some bots skip). A filled value short-circuits to a benign no-op server-side. */}
      <input
        type="text"
        name="subject_hp"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
      />

      <Button className={CTA} disabled={!url.trim()} onClick={handleGenerate}>
        Generate brief — free
      </Button>
    </div>
  );
}
