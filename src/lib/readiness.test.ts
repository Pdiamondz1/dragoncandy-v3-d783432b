import { describe, it, expect } from 'vitest';
import { deriveReadiness, type ReadinessInput } from './readiness';

const base: ReadinessInput = {
  require: { stripe: true, social: false },
  stripeQuery: { isLoading: false, isError: false, data: { hasAccount: true, onboardingComplete: true, chargesEnabled: true, payoutsEnabled: true, platformPendingBalance: 0 } },
  socialHasActive: true,
  socialReconnectNeeded: [],
  previousAccountId: null,
};

describe('deriveReadiness — fail-open', () => {
  it('blocks only on a definitive not-ready (no account)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: false, data: { hasAccount: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0 } } });
    expect(r.status).toBe('no_account');
    expect(r.isReady).toBe(false);
    expect(r.shouldBlock).toBe(true);
  });

  it('ALLOWS while loading (fail-open, no block)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: true, isError: false, data: undefined } });
    expect(r.status).toBe('loading');
    expect(r.shouldBlock).toBe(false);
  });

  it('ALLOWS on query error (fail-open, no block)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: true, data: undefined } });
    expect(r.status).toBe('indeterminate');
    expect(r.shouldBlock).toBe(false);
  });

  it('ALLOWS when data is missing despite not loading (fail-open)', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: false, data: undefined } });
    expect(r.shouldBlock).toBe(false);
  });

  it('ready when account onboarded', () => {
    const r = deriveReadiness(base);
    expect(r.status).toBe('ready');
    expect(r.isReady).toBe(true);
    expect(r.shouldBlock).toBe(false);
  });

  it('verification_pending when account exists but not onboarded', () => {
    const r = deriveReadiness({ ...base, stripeQuery: { isLoading: false, isError: false, data: { hasAccount: true, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0 } } });
    expect(r.status).toBe('verification_pending');
    expect(r.shouldBlock).toBe(true);
  });

  it('reconnect_needed only when social required and a platform needs reconnect', () => {
    const needs = [{ platform: 'instagram', platformHandle: '@x' }];
    const blocked = deriveReadiness({ ...base, require: { stripe: true, social: true }, socialHasActive: false, socialReconnectNeeded: needs });
    expect(blocked.status).toBe('reconnect_needed');
    const ignored = deriveReadiness({ ...base, require: { stripe: true, social: false }, socialReconnectNeeded: needs });
    expect(ignored.status).toBe('ready'); // social not required → ignored
  });

  it('requireStripe:false never blocks on stripe', () => {
    const r = deriveReadiness({ ...base, require: { stripe: false, social: false }, stripeQuery: { isLoading: false, isError: false, data: { hasAccount: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0 } } });
    expect(r.shouldBlock).toBe(false);
    expect(r.status).toBe('ready');
  });
});
