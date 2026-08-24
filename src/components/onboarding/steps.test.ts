import { describe, it, expect } from 'vitest';
import { ROLE_REQUIREMENTS } from '@/lib/accountReadiness/requirements';
import type { AccountRole } from '@/lib/accountReadiness/types';
import { ROLE_STEPS, STEP_PHASE, REQUIREMENT_STEP, NO_CAPTURE_FLOW, collectSteps, lastCollectStep, coreFingerprint } from './steps';
import type { StepId } from './steps';

const ROLES: AccountRole[] = ['business_client', 'content_creator', 'brand'];

/**
 * The invariant this file exists for: the wizard may carry MORE than the required
 * requirements (phone is recommended and is a slide anyway, by design), but it may
 * never carry fewer. Without this, adding a required requirement to the registry
 * leaves onboarding silently unable to satisfy it, and the only symptom is a
 * checklist item a new user can never clear.
 */
describe('wizard covers every required requirement', () => {
  it.each(ROLES)('%s', (role) => {
    const missing = ROLE_REQUIREMENTS[role]
      .filter((r) => r.tier === 'required')
      .filter((r) => !NO_CAPTURE_FLOW[role].includes(r.key))
      .map((r) => ({ key: r.key, step: REQUIREMENT_STEP[r.key] }))
      .filter(({ step }) => step !== null && !ROLE_STEPS[role].includes(step))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });

  /**
   * The exemption above is the only way to weaken this file, so it gets its own guard:
   * an entry must name a requirement the role actually has, and the two roles whose
   * Stripe flow works must claim no exemptions at all. Without this, "the flow does not
   * exist" becomes the answer to any coverage failure.
   */
  it.each(ROLES)('%s exempts only requirements it really has', (role) => {
    const keys = new Set(ROLE_REQUIREMENTS[role].map((r) => r.key));
    for (const exempt of NO_CAPTURE_FLOW[role]) {
      expect(keys.has(exempt), `${role} exempts "${exempt}", which it does not require`).toBe(true);
    }
  });

  it('exempts nothing for the roles whose capture flows all exist', () => {
    expect(NO_CAPTURE_FLOW.business_client).toEqual([]);
    expect(NO_CAPTURE_FLOW.content_creator).toEqual([]);
  });

  // A passing coverage test proves nothing unless it can fail. This runs the same
  // comparison against a role whose slides are deliberately gutted.
  it('detects a required requirement with no slide', () => {
    const role: AccountRole = 'business_client';
    const gutted: StepId[] = ROLE_STEPS[role].filter((s) => s !== 'payments');
    const missing = ROLE_REQUIREMENTS[role]
      .filter((r) => r.tier === 'required')
      .map((r) => REQUIREMENT_STEP[r.key])
      .filter((step) => step !== null && !gutted.includes(step));
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe('slide order', () => {
  it.each(ROLES)('%s ends on ready and groups collect before service', (role) => {
    const steps = ROLE_STEPS[role];
    expect(steps[steps.length - 1]).toBe('ready');
    expect(steps.filter((s) => s === 'ready')).toHaveLength(1);

    // The core save fires when the last collect slide is left, so a collect slide
    // appearing after a service slide would call a live service against rows that
    // do not exist yet.
    const phases = steps.map((s) => STEP_PHASE[s]);
    const lastCollect = phases.lastIndexOf('collect');
    const firstService = phases.indexOf('service');
    expect(firstService).toBeGreaterThan(lastCollect);
  });

  it.each(ROLES)('%s starts by identifying the account', (role) => {
    expect(ROLE_STEPS[role][0]).toBe('identity');
  });

  it.each(ROLES)('%s reports its own last collect slide', (role) => {
    const collect = collectSteps(role);
    expect(collect.length).toBeGreaterThan(0);
    expect(lastCollectStep(role)).toBe(collect[collect.length - 1]);
    expect(collect.every((s) => STEP_PHASE[s] === 'collect')).toBe(true);
  });
});

describe('requirement-to-slide map', () => {
  it('covers every requirement key used by any role', () => {
    const used = new Set(ROLES.flatMap((r) => ROLE_REQUIREMENTS[r].map((x) => x.key)));
    const unmapped = [...used].filter((k) => !(k in REQUIREMENT_STEP));
    expect(unmapped).toEqual([]);
  });

  it('never points a requirement at a slide that does not exist', () => {
    const bad = Object.entries(REQUIREMENT_STEP)
      .filter(([, step]) => step !== null && !(step in STEP_PHASE))
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });
});


describe('coreFingerprint', () => {
  const base = {
    name: 'Joe', industry: 'food', cuisines: ['italian'], skills: ['video'],
    bio: 'I cook.', showInFeed: true, avatarFile: null,
  };

  it('is stable for unchanged input', () => {
    expect(coreFingerprint(base)).toBe(coreFingerprint({ ...base }));
  });

  /**
   * The bug this exists to prevent: going back, editing a collect field, and continuing
   * used to skip the save entirely, leaving the edit on screen and out of the database.
   * Every field a collect slide gathers must move the fingerprint, or that returns for
   * whichever field is missed.
   */
  it.each([
    ['name', { name: 'Joseph' }],
    ['industry', { industry: 'retail' }],
    ['cuisines', { cuisines: ['italian', 'thai'] }],
    ['skills', { skills: ['photo'] }],
    ['bio', { bio: 'I bake.' }],
    ['showInFeed', { showInFeed: false }],
    ['avatarFile', { avatarFile: { name: 'me.jpg', size: 1234 } }],
  ])('changes when %s changes', (_field, patch) => {
    expect(coreFingerprint({ ...base, ...patch })).not.toBe(coreFingerprint(base));
  });

  it('ignores the order chips were tapped in — that is not an edit', () => {
    expect(coreFingerprint({ ...base, cuisines: ['thai', 'italian'] }))
      .toBe(coreFingerprint({ ...base, cuisines: ['italian', 'thai'] }));
  });

  it('ignores surrounding whitespace, which the save trims anyway', () => {
    expect(coreFingerprint({ ...base, name: '  Joe  ', bio: ' I cook. ' })).toBe(coreFingerprint(base));
  });

  /**
   * Re-selecting the same picture is not worth a second upload, so identity — not
   * object reference — is what counts.
   */
  it('treats two distinct file objects describing the same picture as unchanged', () => {
    const a = { avatarFile: { name: 'me.jpg', size: 42 } };
    const b = { avatarFile: { name: 'me.jpg', size: 42 } };
    expect(coreFingerprint({ ...base, ...a })).toBe(coreFingerprint({ ...base, ...b }));
  });

  it('distinguishes a different picture with the same name', () => {
    expect(coreFingerprint({ ...base, avatarFile: { name: 'me.jpg', size: 42 } }))
      .not.toBe(coreFingerprint({ ...base, avatarFile: { name: 'me.jpg', size: 99 } }));
  });
});
