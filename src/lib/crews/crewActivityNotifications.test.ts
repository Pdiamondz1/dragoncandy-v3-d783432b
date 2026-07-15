import { describe, it, expect } from 'vitest';
import { crewActivityNotifications } from './crewActivityNotifications';
import type { CrewActivityFacts, CrewEventType } from './crewActivityNotifications';

// A fully-populated facts fixture. Distinct ids so a cross-creator leak (a payload
// targeting anyone other than owner_id / participant_id) is detectable.
function facts(overrides: Partial<CrewActivityFacts> = {}): CrewActivityFacts {
  return {
    id: 'act-1',
    group_id: 'group-1',
    owner_id: 'owner-1',
    participant_id: 'creator-1',
    event_type: 'content_submitted',
    campaign_id: 'camp-1',
    campaign_title: 'Taco Tuesday Blitz',
    creator_name: 'Ava Reels',
    ...overrides,
  };
}

// The Task-0-verified overlap: every event EXCEPT content_submitted is already
// belled (and, where high-signal, emailed) by the standard lifecycle, so the pure
// map returns [] for them (firing again would double-bell).
const ROW_ONLY_EVENTS: CrewEventType[] = [
  'campaign_posted',
  'application_received',
  'hired',
  'content_approved',
  'revision_requested',
  'completed',
];

describe('crewActivityNotifications', () => {
  describe('content_submitted (the one real gap)', () => {
    it('returns exactly one payload to the owner with the specified fields', () => {
      const f = facts({ event_type: 'content_submitted' });
      const payloads = crewActivityNotifications(f);

      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toEqual({
        recipientId: 'owner-1',
        type: 'content_submitted',
        // `campaigns` (not `content`) so the high-signal owner email sends by default.
        category: 'campaigns',
        title: 'New content submitted',
        body: 'Ava Reels submitted content for "Taco Tuesday Blitz"',
        actionUrl: '/dashboard/business/campaigns/camp-1',
        icon: 'content',
        data: { campaign_id: 'camp-1' },
        emailData: { creatorName: 'Ava Reels', campaignTitle: 'Taco Tuesday Blitz' },
      });
    });

    it('emails default on: category is campaigns (content would default off)', () => {
      const payloads = crewActivityNotifications(facts({ event_type: 'content_submitted' }));
      expect(payloads[0].category).toBe('campaigns');
    });

    it('carries emailData for the template, falling back when names are null', () => {
      const payloads = crewActivityNotifications(
        facts({ event_type: 'content_submitted', creator_name: null, campaign_title: null }),
      );
      expect(payloads[0].emailData).toEqual({
        creatorName: 'A creator',
        campaignTitle: 'your campaign',
      });
    });

    it('targets owner_id — never the participant or any other creator', () => {
      const f = facts({ event_type: 'content_submitted' });
      const payloads = crewActivityNotifications(f);

      expect(payloads[0].recipientId).toBe(f.owner_id);
      expect(payloads[0].recipientId).not.toBe(f.participant_id);
    });

    it('falls back to "A creator" when creator_name is null', () => {
      const payloads = crewActivityNotifications(
        facts({ event_type: 'content_submitted', creator_name: null }),
      );
      expect(payloads[0].body).toBe('A creator submitted content for "Taco Tuesday Blitz"');
    });

    it('falls back to "a campaign" when campaign_title is null', () => {
      const payloads = crewActivityNotifications(
        facts({ event_type: 'content_submitted', campaign_title: null }),
      );
      expect(payloads[0].body).toBe('Ava Reels submitted content for "a campaign"');
    });

    it('still targets the owner when participant_id is null', () => {
      const payloads = crewActivityNotifications(
        facts({ event_type: 'content_submitted', participant_id: null }),
      );
      expect(payloads).toHaveLength(1);
      expect(payloads[0].recipientId).toBe('owner-1');
    });
  });

  describe('row-only events (standard path already bells the recipient)', () => {
    it.each(ROW_ONLY_EVENTS)('returns [] for %s', (eventType) => {
      expect(crewActivityNotifications(facts({ event_type: eventType }))).toEqual([]);
    });
  });

  describe('no cross-creator leak (invariant across every event)', () => {
    const ALL_EVENTS: CrewEventType[] = ['content_submitted', ...ROW_ONLY_EVENTS];

    it.each(ALL_EVENTS)(
      'every %s payload targets only owner_id or participant_id',
      (eventType) => {
        const f = facts({ event_type: eventType });
        for (const p of crewActivityNotifications(f)) {
          expect([f.owner_id, f.participant_id]).toContain(p.recipientId);
        }
      },
    );

    it('never targets a third-party id even when owner and participant differ', () => {
      const f = facts({
        event_type: 'content_submitted',
        owner_id: 'owner-X',
        participant_id: 'creator-Y',
      });
      for (const p of crewActivityNotifications(f)) {
        expect(['owner-X', 'creator-Y']).toContain(p.recipientId);
      }
    });
  });
});
