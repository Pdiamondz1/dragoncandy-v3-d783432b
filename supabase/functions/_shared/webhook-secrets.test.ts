import { describe, it, expect } from 'vitest';
import { webhookSigningSecrets } from './webhook-secrets';

describe('webhookSigningSecrets', () => {
  it('returns both secrets in priority order (platform first, Connect second)', () => {
    expect(
      webhookSigningSecrets({
        STRIPE_WEBHOOK_SECRET: 'whsec_platform',
        STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
      }),
    ).toEqual(['whsec_platform', 'whsec_connect']);
  });

  it('returns only the platform secret when Connect is unset (backward compatible)', () => {
    expect(webhookSigningSecrets({ STRIPE_WEBHOOK_SECRET: 'whsec_platform' })).toEqual([
      'whsec_platform',
    ]);
  });

  it('returns only the Connect secret when the platform secret is unset', () => {
    expect(
      webhookSigningSecrets({ STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect' }),
    ).toEqual(['whsec_connect']);
  });

  it('returns an empty array when neither is set', () => {
    expect(webhookSigningSecrets({})).toEqual([]);
  });

  it('de-duplicates when the same secret is configured for both endpoints', () => {
    expect(
      webhookSigningSecrets({
        STRIPE_WEBHOOK_SECRET: 'whsec_same',
        STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_same',
      }),
    ).toEqual(['whsec_same']);
  });

  it('ignores empty / whitespace-only values', () => {
    expect(
      webhookSigningSecrets({
        STRIPE_WEBHOOK_SECRET: '   ',
        STRIPE_CONNECT_WEBHOOK_SECRET: '',
      }),
    ).toEqual([]);
  });

  it('trims surrounding whitespace on a real secret', () => {
    expect(
      webhookSigningSecrets({ STRIPE_WEBHOOK_SECRET: '  whsec_platform  ' }),
    ).toEqual(['whsec_platform']);
  });
});
