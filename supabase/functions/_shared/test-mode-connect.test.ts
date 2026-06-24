import { describe, it, expect } from 'vitest';
import { buildTestAccountParams } from './test-mode-connect';

describe('buildTestAccountParams', () => {
  const params = buildTestAccountParams({
    email: 'creator@example.com',
    businessName: 'Jane Creator',
    productDescription: 'Content creation services via DragonCandy marketplace',
    metadata: { user_id: 'u1', platform: 'dragoncandy' },
    requestIp: '8.8.8.8',
    nowUnix: 1_700_000_000,
  });

  it('creates a Custom individual account', () => {
    expect(params.type).toBe('custom');
    expect(params.business_type).toBe('individual');
  });
  it('requests card_payments + transfers capabilities', () => {
    expect(params.capabilities?.card_payments?.requested).toBe(true);
    expect(params.capabilities?.transfers?.requested).toBe(true);
  });
  it('attaches the test bank token and accepted ToS with the given ip/date', () => {
    expect(params.external_account).toBe('btok_us');
    expect(params.tos_acceptance).toEqual({ date: 1_700_000_000, ip: '8.8.8.8' });
  });
  it('carries email, business name, description, and metadata', () => {
    expect(params.email).toBe('creator@example.com');
    expect(params.business_profile?.name).toBe('Jane Creator');
    expect(params.business_profile?.product_description).toContain('Content creation');
    expect(params.metadata?.user_id).toBe('u1');
  });
});
