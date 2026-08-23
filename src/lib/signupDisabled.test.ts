import { describe, it, expect } from 'vitest';
import {
  SIGNUP_DISABLED_MESSAGE,
  isSignupDisabledError,
  signupErrorMessage,
} from './signupDisabled';

describe('isSignupDisabledError', () => {
  it('recognises the structured Supabase code', () => {
    expect(isSignupDisabledError({ code: 'signup_disabled', message: 'nope' })).toBe(true);
  });

  it('recognises GoTrue prose, which is what older clients surface', () => {
    expect(isSignupDisabledError({ message: 'Signups not allowed for this instance' })).toBe(true);
    expect(isSignupDisabledError(new Error('Signup not allowed for this instance'))).toBe(true);
  });

  it('leaves unrelated errors alone', () => {
    expect(isSignupDisabledError({ message: 'Password should be at least 6 characters' })).toBe(false);
    expect(isSignupDisabledError({ message: 'User already registered' })).toBe(false);
    expect(isSignupDisabledError(null)).toBe(false);
    expect(isSignupDisabledError(undefined)).toBe(false);
    expect(isSignupDisabledError('a string')).toBe(false);
  });
});

describe('signupErrorMessage', () => {
  it('swaps in the invite-only copy, which names a way to get in', () => {
    const message = signupErrorMessage({ code: 'signup_disabled', message: 'raw' });
    expect(message).toBe(SIGNUP_DISABLED_MESSAGE);
    expect(message).toContain('support@dragoncandy.com');
    expect(message).not.toContain('raw');
  });

  it('passes a real error through unchanged — do not mask genuine failures', () => {
    expect(signupErrorMessage({ message: 'User already registered' })).toBe('User already registered');
  });

  it('falls back when there is no message at all', () => {
    expect(signupErrorMessage({}, 'Something went wrong.')).toBe('Something went wrong.');
    expect(signupErrorMessage(null, 'Something went wrong.')).toBe('Something went wrong.');
  });
});
