import { describe, it, expect } from 'vitest';
import { describeGenerationError } from './useCampaignCreator';

describe('describeGenerationError', () => {
  it('maps a FunctionsFetchError (dropped fetch) to human copy', () => {
    const err = Object.assign(new Error('Failed to send a request to the Edge Function'), {
      name: 'FunctionsFetchError',
    });
    expect(describeGenerationError(err)).toBe(
      'The connection dropped mid-generation — tap Generate to try again.',
    );
  });

  it('prefers the edge function error body when present', () => {
    const err = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      name: 'FunctionsHttpError',
      context: { error: 'rate limited' },
    });
    expect(describeGenerationError(err)).toBe('rate limited');
  });

  it('falls back to the error message', () => {
    expect(describeGenerationError(new Error('boom'))).toBe('boom');
  });

  it('handles non-Error throws', () => {
    expect(describeGenerationError(undefined)).toBe('Unknown error');
    expect(describeGenerationError('weird')).toBe('Unknown error');
  });
});
