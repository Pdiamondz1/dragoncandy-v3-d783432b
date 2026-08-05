import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, Clock, Star, Loader2, MapPin } from 'lucide-react';
import { PACKAGES_ENABLED } from '@/lib/featureConfig';
import { usePublicPackage } from '@/hooks/packages/usePublicPackage';
import { usePackageCheckout } from '@/hooks/packages/usePackageCheckout';
import { IntakeForm, validateIntake, type IntakeAnswers } from '@/components/packages/IntakeForm';
import { formatUsd } from '@/lib/packagePricing';
import type { PackageScope } from '@/types/packages';

const PublicPackagePage = () => {
  const { creatorSlug, packageSlug } = useParams<{ creatorSlug: string; packageSlug: string }>();
  const { creator, pkg, isLoading, notFound } = usePublicPackage(creatorSlug, packageSlug);
  const { checkout, isSubmitting } = usePackageCheckout();
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [email, setEmail] = useState('');

  if (!PACKAGES_ENABLED) return <Navigate to="/" replace />;

  const onBook = async () => {
    if (!pkg) return;
    const missing = validateIntake(pkg.intake_schema, answers);
    if (missing) return toast.error(`Please fill in: ${missing}`);
    if (!/.+@.+\..+/.test(email)) return toast.error('Add your email so we can send your order details.');
    await checkout({ packageId: pkg.id, intake: answers, buyerEmail: email.trim() });
  };

  const scope: PackageScope = pkg?.scope ?? {};
  const deliverables = scope.deliverables ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        )}

        {!isLoading && (notFound || !pkg || !creator) && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <h1 className="text-xl font-bold text-foreground">This package isn’t available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The link may be out of date, or the creator has paused this package.
            </p>
          </div>
        )}

        {!isLoading && pkg && creator && (
          <>
            {/* Creator header (F5 — lead with the person, not just price) */}
            <div className="flex items-center gap-3">
              {creator.avatar_url ? (
                <img src={creator.avatar_url} alt={creator.creator_name ?? 'Creator'} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-landing-lilac text-lg font-bold text-landing-ink">
                  {(creator.creator_name ?? 'C').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-foreground">{creator.creator_name ?? 'Creator'}</p>
                {creator.average_rating != null && creator.total_reviews ? (
                  <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="h-3.5 w-3.5 fill-landing-yellow text-landing-yellow" />
                    {creator.average_rating.toFixed(1)} · {creator.total_reviews} reviews
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Content creator</p>
                )}
              </div>
            </div>

            {/* Offer */}
            <div className="mt-5 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-bold text-foreground">{pkg.title}</h1>
                <span className="shrink-0 text-2xl font-bold text-primary">{formatUsd(pkg.price)}</span>
              </div>
              {pkg.description && <p className="mt-2 text-muted-foreground">{pkg.description}</p>}

              <ul className="mt-4 space-y-1.5 text-sm text-foreground">
                {deliverables.map((d, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {d.qty}× {d.label}
                  </li>
                ))}
                {typeof scope.revisions === 'number' && (
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {scope.revisions} revision{scope.revisions === 1 ? '' : 's'} included
                  </li>
                )}
              </ul>

              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {pkg.turnaround_days}-day delivery</span>
                {typeof scope.travel_radius_mi === 'number' && scope.travel_radius_mi > 0 && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> Travels up to {scope.travel_radius_mi} mi</span>
                )}
              </div>
            </div>

            {/* F4 — plain-English safe payment */}
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-landing-mint-line bg-landing-mint-soft p-3 text-sm text-landing-mint-ink">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Your payment is held safely and only released to {creator.creator_name ?? 'the creator'} once you approve the work — fully refunded if they don’t deliver.</span>
            </div>

            {/* Intake brief */}
            <div className="mt-5 rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">Tell {creator.creator_name ?? 'them'} what you need</h2>
              <p className="mt-1 text-sm text-muted-foreground">A few quick details so they can nail it the first time.</p>
              <div className="mt-4">
                <IntakeForm
                  schema={pkg.intake_schema}
                  answers={answers}
                  onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
                />
              </div>

              <div className="mt-4 space-y-1.5">
                <Separator className="mb-4" />
                <Label htmlFor="buyer-email">Your email</Label>
                <Input id="buyer-email" type="email" inputMode="email" placeholder="you@restaurant.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <p className="text-xs text-muted-foreground">We’ll send your order link here — no account needed.</p>
              </div>

              <Button onClick={onBook} disabled={isSubmitting} className="mt-5 w-full" size="lg">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Book & pay {formatUsd(pkg.price)}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PublicPackagePage;
