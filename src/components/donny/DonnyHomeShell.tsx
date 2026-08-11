// The Donny-first dashboard LAYOUT, extracted from DonnyHome so a second role
// (creator) can render the same layout with different data. This file owns no
// data hooks and no state — everything it renders comes from props. See
// DonnyHome.tsx for the business container this was extracted from; it carries
// the fuller history/rationale comments for the layout decisions below.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageBody } from '@/components/app/PageBody';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { DonnyAvatar } from './DonnyAvatar';
import { DonnyThreadRegion } from './DonnyThreadRegion';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { TourButton } from '@/components/guidance/TourButton';
import { DCTour } from '@/components/guidance/DCTour';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';
import type { UserRole } from '@/types/user';
import type { TourStep } from '@/lib/tours/role-tours';
import type { DonnyHomeConversation } from '@/hooks/donny/useDonnyHomeConversation';

interface DonnyHomeShellProps {
  userRole: UserRole;
  roleLabel: string;
  greetingName: string;
  subtitle: string;
  badge?: ReactNode;
  overviewRoute: string;
  onOverviewOpen: () => void;
  suggestions: DonnySuggestion[];
  onSubmit: (text: string) => void;
  onSuggestionTap: (s: DonnySuggestion) => void;
  profileLoaded: boolean;
  children: ReactNode;
  /** Per-role tour anchors for the two elements the SHELL owns (§4.6).
   *  Business passes nothing; creator passes both. Applied to elements that
   *  ALREADY EXIST — add no wrapper, the tests pin element depth. */
  tourAnchors?: { prompt?: string; overview?: string };
  conversation: DonnyHomeConversation;
  tour: {
    showTour: boolean;
    tourSteps: TourStep[];
    completeTour: () => void;
    skipTour: () => void;
    triggerTour: () => void;
  };
}

export function DonnyHomeShell({
  userRole,
  roleLabel,
  greetingName,
  subtitle,
  badge,
  overviewRoute,
  onOverviewOpen,
  suggestions,
  onSubmit,
  onSuggestionTap,
  profileLoaded,
  children,
  tourAnchors,
  conversation,
  tour,
}: DonnyHomeShellProps) {
  const { hasConversation, isBusy, historyUnavailable, composerRef, thread } = conversation;
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = tour;

  if (!profileLoaded) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-white overflow-x-hidden">
          {/* Mirrors the loaded hero's width and centring so there is no
              layout jump when the profile resolves. */}
          <PageBody maxWidth="4xl">
            <div className="flex flex-col items-center gap-3 pt-4 lg:pt-12">
              <DCSkeleton variant="text-block" className="h-16 w-16 rounded-full" />
              <DCSkeleton variant="text-block" className="h-8 w-64" />
              <DCSkeleton variant="text-block" className="h-3 w-72" />
            </div>
            <DCSkeleton variant="text-block" className="h-16 w-full rounded-full" />
            <DCSkeleton variant="list-row" count={3} />
          </PageBody>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="min-h-screen bg-white overflow-x-hidden">
        <PageBody maxWidth="4xl">
          {/* A centered hero, not a heading with a field under it: on this
              dashboard the prompt IS the body, so it gets the emblem, the
              greeting and the whitespace rather than sharing them with a
              stat grid. Deliberately NOT DashboardGreeting — that component
              is left-aligned and shared with the creator/brand dashboards,
              which keep their current layout. No tour anchor lives in it, so
              swapping it here costs nothing. */}
          {/* The hero COLLAPSES to its label row once a conversation is
              running (founder's choice, 2026-08-10). It is not decoration: the
              avatar, greeting and subtitle are ~200px, and on a phone that is
              the difference between a thread worth reading and a letterbox. A
              greeting is an opening move — once the owner has asked something,
              the screen belongs to the answer.

              The label row survives in both states so the page never loses its
              identity or the location it is acting on. */}
          {hasConversation ? (
            <div className="flex items-center justify-center gap-2 pt-4 lg:pt-8">
              <span className="text-xs font-semibold uppercase tracking-widest text-dc-text-muted">
                {roleLabel}
              </span>
              {badge}
            </div>
          ) : (
            <div className="flex flex-col items-center pt-4 text-center lg:pt-12">
              <div className="flex items-center gap-2 pb-7">
                <span className="text-xs font-semibold uppercase tracking-widest text-dc-text-muted">
                  {roleLabel}
                </span>
                {badge}
              </div>
              <DonnyAvatar size="xl" aria-label="Donny" />
              <h1 className="pt-5 text-3xl font-bold text-dc-text lg:text-4xl">
                Welcome back, {greetingName}
              </h1>
              <p className="pt-2 text-base text-dc-text-muted">
                {subtitle}
              </p>
            </div>
          )}

          {/* Two arrangements, one wrapper.
              RESTING (no conversation): a bare div holding the composer — the
              same greeting → composer → taps → attention list page as before.
              CONVERSATION: a bounded flex column. The thread scrolls INSIDE it
              and the composer sits directly underneath, always reachable,
              instead of the thread growing the page a screen per exchange and
              stranding the composer at the top of it.

              The wrapper is rendered in BOTH states on purpose. `false` still
              occupies slot 0 below when there is no conversation, so the
              composer stays at slot 1 and React's positional reconciliation
              keeps it MOUNTED across the switch — a remount would drop focus
              and any half-typed follow-up the moment the first reply arrived.

              Sizing: the subtrahend is the chrome this block sits between, and
              it is close enough on both viewports to be one number. It is
              12rem, not the 26rem this started as, because the hero above
              COLLAPSES in exactly the state this class applies in — subtracting
              a hero that is no longer rendered would hand the reclaimed ~200px
              back as whitespace and leave the thread the size it was, which is
              the whole point of collapsing it. Desktop: 64px sticky header +
              32px content padding + ~36px collapsed label row + 32px PageBody
              gap + 32px bottom padding. Mobile: ~56px top nav + 16px pt-4 +
              ~36px label row + 32px gap + 96px MobileBottomNav clearance (the
              content area's own pb-24). `dvh`, never `vh` — the app document
              never scrolls, so iOS toolbars never collapse and `vh` overshoots
              the visible area (docs/DESIGN_SYSTEM.md). The 20rem floor wins
              over max-h on very short viewports, where the honest outcome is a
              slightly scrolling page rather than a thread squeezed to nothing. */}
          <div
            className={
              hasConversation
                ? 'flex max-h-[calc(100dvh-12rem)] min-h-[20rem] flex-col gap-3'
                : undefined
            }
          >
            {hasConversation && (
              <DonnyThreadRegion
                className="min-h-0 flex-1"
                // THIS VISIT's messages, not the whole shared conversation.
                messages={thread.messages}
                avatarState={thread.avatarState}
                // Not `isBusy`: a queued ask waiting on history that failed is
                // not "answering", and a typing indicator over an error is a
                // lie about what is happening.
                isStreaming={isBusy && !historyUnavailable}
                streamingContent={thread.streamingContent}
                error={thread.error}
                retry={thread.retry}
                userRole={thread.userRole}
              />
            )}
            <div
              ref={composerRef}
              data-tour={tourAnchors?.prompt}
              className={hasConversation ? 'shrink-0' : undefined}
            >
              <DonnyHomePrompt
                suggestions={suggestions}
                onSubmit={onSubmit}
                onSuggestionTap={onSuggestionTap}
                busy={isBusy}
                compact={hasConversation}
              />
            </div>
          </div>

          {/* The rating prompts go INSIDE the attention frame, not beside it.
              `NeedsAttentionSection` exists to consolidate every "needs you"
              banner into ONE quiet framed list — the replaced body put all four
              in a single instance. Rendering these as siblings would produce one
              framed list plus two orphaned rows under it. */}
          {children}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Link
              to={overviewRoute}
              onClick={onOverviewOpen}
              data-tour={tourAnchors?.overview}
              className="text-sm font-semibold text-dc-teal-btn hover:underline"
            >
              View full dashboard →
            </Link>
            <TourButton onClick={triggerTour} />
          </div>
        </PageBody>
        {showTour && tourSteps.length > 0 && (
          <DCTour steps={tourSteps} onComplete={completeTour} onSkip={skipTour} />
        )}
      </div>
    </DashboardLayout>
  );
}
