import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RestaurantTypeahead } from '@/components/dragonshare/RestaurantTypeahead';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';
import { useContentBrief, type ContentBrief } from '@/hooks/useContentBrief';
import { Button } from '@/components/ui/button';
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-dc-teal hover:text-dc-teal-dark p-1"
      aria-label="Copy"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function BriefView({ brief, usedPerf }: { brief: ContentBrief; usedPerf: boolean }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-dc-teal/15 text-dc-teal-btn px-3 py-1 text-xs font-semibold">
          {brief.recommended_format}
        </span>
        <span className="rounded-full bg-dc-pink/40 text-dc-pink-accent px-3 py-1 text-xs font-semibold capitalize">
          {brief.platform}
        </span>
        <span className="rounded-full bg-dc-teal/10 text-dc-text-muted px-3 py-1 text-xs">
          {brief.best_time}
        </span>
      </div>
      <div className="rounded-2xl border border-dc-teal/30 bg-dc-card p-4">
        <p className="text-xs font-bold uppercase text-dc-text-muted">Hook</p>
        <p className="text-sm text-dc-text mt-1">{brief.hook}</p>
      </div>
      <div className="rounded-2xl border border-dc-teal/30 bg-dc-card p-4">
        <p className="text-xs font-bold uppercase text-dc-text-muted">3 angles</p>
        <ul className="mt-1 list-disc pl-5 text-sm text-dc-text space-y-1">
          {brief.angles.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-dc-teal/30 bg-dc-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-dc-text-muted">Caption</p>
          <CopyButton text={brief.sample_caption} />
        </div>
        <p className="text-sm text-dc-text mt-1 whitespace-pre-wrap">{brief.sample_caption}</p>
        <p className="text-xs text-dc-pink-accent mt-2">{brief.hashtags.join(' ')}</p>
      </div>
      <p className="text-xs text-dc-text-muted">{brief.rationale}</p>
      <p className="text-[11px] text-dc-text-muted italic">
        {usedPerf
          ? 'Based on your top-performing posts + this restaurant\'s profile.'
          : 'Based on this restaurant\'s profile + content best practices.'}
      </p>
    </div>
  );
}

export function ContentIdeaCard() {
  const [org, setOrg] = useState<RestaurantSearchResult | null>(null);
  const { mutate, data, isPending, reset } = useContentBrief();
  const navigate = useNavigate();

  return (
    <div className="rounded-3xl border-2 border-dc-teal/40 bg-dc-card p-5 lg:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-dc-teal" />
        <h3 className="text-base font-bold text-dc-text">Get a content idea</h3>
      </div>
      <p className="text-sm text-dc-text-muted mt-1">
        Pick a restaurant and Donny will draft a content brief.
      </p>
      <div className="mt-3">
        <RestaurantTypeahead
          selectedOrg={org}
          onSelect={(o) => {
            setOrg(o);
            reset();
          }}
          onClear={() => {
            setOrg(null);
            reset();
          }}
        />
      </div>
      {org && !data && (
        <Button
          onClick={() =>
            mutate(org.id, {
              onError: () =>
                toast.error('Could not generate a brief. Please try again.'),
            })
          }
          disabled={isPending}
          className="mt-3 w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white font-semibold"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Donny is
              thinking…
            </>
          ) : (
            'Get my content brief'
          )}
        </Button>
      )}
      {data && <BriefView brief={data.brief} usedPerf={data.used_performance_data} />}
      {data?.brief_id && org && (
        <Button
          onClick={() => navigate(`/dashboard/creator/dragonshare?restaurant=${org.id}&brief=${data.brief_id}`)}
          className="mt-4 w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold"
        >
          Make it &amp; submit to {org.name}
        </Button>
      )}
    </div>
  );
}
