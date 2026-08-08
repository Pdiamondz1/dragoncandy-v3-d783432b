import { describe, expect, test } from 'vitest';
import { INVITE_EXPLAINER, INVITE_LABEL, describeInvitation } from './inviteCopy';

describe('describeInvitation', () => {
  test('no invitation yet → null, so the invite button shows', () => {
    expect(describeInvitation(undefined)).toBeNull();
  });

  test('pending reads as waiting, not as done', () => {
    expect(describeInvitation('pending')).toEqual({
      label: 'Invited · waiting',
      tone: 'amber',
      actionable: false,
    });
  });

  test('accepted and counter_offered both point at the applications list', () => {
    const accepted = describeInvitation('accepted');
    expect(accepted).toEqual({ label: 'Applied — review them', tone: 'teal', actionable: true });
    expect(describeInvitation('counter_offered')).toEqual(accepted);
  });

  test('declined is visually distinct from accepted — the bug this replaces', () => {
    const declined = describeInvitation('declined');
    const accepted = describeInvitation('accepted');
    expect(declined?.label).not.toBe(accepted?.label);
    expect(declined?.tone).not.toBe(accepted?.tone);
    expect(declined?.actionable).toBe(false);
  });

  test('no tone is gray — the no-gray rule', () => {
    const tones = (['pending', 'accepted', 'counter_offered', 'declined'] as const).map(
      (s) => describeInvitation(s)?.tone,
    );
    expect(tones.every((t) => t === 'teal' || t === 'amber' || t === 'neutral')).toBe(true);
  });

  test('the label names the ask, and the explainer says the campaign is already visible', () => {
    expect(INVITE_LABEL).toBe('Invite to apply');
    expect(INVITE_EXPLAINER.body).toContain('already see');
    expect(INVITE_EXPLAINER.body).toContain('you pick who to hire');
  });
});
