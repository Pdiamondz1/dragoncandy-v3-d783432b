// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useAccountReadiness', () => ({ useAccountReadiness: () => readiness.current }));

const firstRunMissions = vi.hoisted(() => ({ current: { missions: null as any } }));
vi.mock('@/hooks/useFirstRunMissions', () => ({ useFirstRunMissions: () => firstRunMissions.current }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { MissionChecklist } from './MissionChecklist';

function req(key: string, status: string, tier = 'required') {
  return { key, tier, label: `Do ${key}`, why: `Because ${key}`,
    resolve: { route: `/x/${key}` }, state: { status } };
}
function setRequirements(requirements: any[]) {
  readiness.current = {
    requirements, required: requirements.filter((r) => r.tier === 'required'),
    recommended: requirements.filter((r) => r.tier === 'recommended'),
    outstanding: requirements.filter((r) => ['unmet', 'pending'].includes(r.state.status)),
    missingFor: () => [], isBlocked: () => false, dismiss: vi.fn(),
  };
}
function setMissions(missions: Record<string, unknown> | null) {
  firstRunMissions.current = { missions };
}

describe('MissionChecklist', () => {
  beforeEach(() => {
    navigate.mockClear();
    // Default: no view-event missions loaded, so only derived requirements
    // render. This keeps the derived-only assertions below exact.
    setMissions(null);
  });

  /**
   * The behaviour change: the old component locked item N until N-1 was done.
   * With derived truth that is a lie — someone can finish Stripe before ever
   * browsing inspiration.
   */
  it('does not lock a later item just because an earlier one is unmet', () => {
    setRequirements([req('profile_basics', 'unmet'), req('stripe', 'met')]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    // Assert on the COMPUTED status (`data-item-status`, from itemStatus()),
    // not the raw `data-status` (the requirement's own state, which a
    // positional lock would never touch). `stripe` is `met` regardless of
    // `profile_basics` being unmet — a reintroduced N-1-before-N lock would
    // drag this to 'locked'.
    expect(getByText('Do stripe').closest('[data-requirement-row]')?.getAttribute('data-item-status')).toBe('completed');
  });

  it('renders unknown as a neutral checking row, never as a failure', () => {
    setRequirements([req('stripe', 'unknown')]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    const row = getByText('Do stripe').closest('[data-requirement-row]');
    expect(row?.getAttribute('data-status')).toBe('unknown');
    // The wrapper `<div>` never carries style classes — MissionItem's own root
    // element (the row's first child) is what actually paints the row, so
    // assert there rather than on the always-empty wrapper className.
    const styledElement = row?.firstElementChild as HTMLElement | null;
    expect(styledElement?.className).not.toContain('red');
    // Ruling 2: an unknown row must say "Checking…", never its `why` copy —
    // at half opacity, "Because you need X" reads as an unactionable to-do.
    expect(getByText('Checking…')).toBeTruthy();
  });

  it('counts only definitive met items in the progress tally', () => {
    setRequirements([req('a', 'met'), req('b', 'unknown'), req('c', 'unmet')]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    expect(getByText('1 / 3')).toBeTruthy();
  });

  it('shows the pending detail rather than a generic unmet state', () => {
    const pending = { ...req('stripe', 'pending'), state: { status: 'pending', detail: 'Stripe is still verifying.' } };
    setRequirements([pending]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    expect(getByText('Stripe is still verifying.')).toBeTruthy();
  });

  /**
   * Ruling 1: the checklist must render BOTH the derived requirements and the
   * retained view-event missions (browse_inspiration / view_campaigns /
   * select_style / browse_creators) in one list, or a user can finish every
   * derived row, see the checklist read complete, and still never leave
   * first-run mode (areMissionsComplete() only counts the view-event keys).
   */
  it('renders view-event mission rows alongside derived requirement rows once the mission blob is loaded', () => {
    setRequirements([req('stripe', 'met')]);
    setMissions({ view_campaigns: false });
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    expect(getByText('Do stripe')).toBeTruthy();
    expect(getByText("See what's out there")).toBeTruthy();
    // 1 derived `met` + 0 view-event done, out of 1 derived + 1 view-event.
    expect(getByText('1 / 2')).toBeTruthy();
  });

  it('counts a completed view-event mission in the tally and marks its row completed', () => {
    setRequirements([req('stripe', 'unmet')]);
    setMissions({ view_campaigns: true });
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    const row = getByText("See what's out there").closest('[data-mission-row]');
    expect(row?.getAttribute('data-status')).toBe('completed');
    expect(getByText('1 / 2')).toBeTruthy();
  });

  it('routes a view-event mission GO tap to its page instead of calling onMissionGo', () => {
    setRequirements([]);
    setMissions({ view_campaigns: false });
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    getByText('GO').click();
    expect(navigate).toHaveBeenCalledWith('/dashboard/creator/campaigns');
  });

  it('renders no view-event rows when the mission blob has not loaded yet', () => {
    setRequirements([req('stripe', 'met')]);
    setMissions(null);
    const { queryByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    expect(queryByText("See what's out there")).toBeNull();
  });
});
