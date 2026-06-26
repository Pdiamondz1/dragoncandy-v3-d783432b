import { describe, it, expect } from 'vitest';
import { describeError } from './errors';

describe('describeError', () => {
  it('uses the message of a real Error', () => {
    expect(describeError(new Error('boom'))).toEqual({ message: 'boom' });
  });

  it('surfaces message AND code of a Supabase PostgrestError (a non-Error object)', () => {
    // This is the exact shape that previously collapsed to "internal error":
    // a foreign-key violation thrown as a plain object, not an Error instance.
    const pgError = {
      message:
        'insert or update on table "google_workspace_accounts" violates foreign key constraint "google_workspace_accounts_user_id_fkey"',
      details: 'Key (user_id)=(...) is not present in table "profiles".',
      hint: null,
      code: '23503',
    };
    expect(describeError(pgError)).toEqual({
      message:
        'insert or update on table "google_workspace_accounts" violates foreign key constraint "google_workspace_accounts_user_id_fkey"',
      code: '23503',
    });
  });

  it('keeps the code even when a non-Error object has no message', () => {
    expect(describeError({ code: '23503' })).toEqual({ message: 'internal error', code: '23503' });
  });

  it('uses a raw string throw as the message', () => {
    expect(describeError('something failed')).toEqual({ message: 'something failed' });
  });

  it('falls back to "internal error" for null/undefined', () => {
    expect(describeError(null)).toEqual({ message: 'internal error' });
    expect(describeError(undefined)).toEqual({ message: 'internal error' });
  });

  it('falls back to "internal error" for an empty object', () => {
    expect(describeError({})).toEqual({ message: 'internal error' });
  });
});
