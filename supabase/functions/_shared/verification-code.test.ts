import { describe, it, expect } from 'vitest';
import {
  CODE_LENGTH,
  MAX_CODE_ATTEMPTS,
  generateVerificationCode,
  isWellFormedCode,
  normalizeVerificationCode,
} from './verification-code.ts';

/** The largest multiple of 10^6 that fits in a uint32 — the rejection threshold. */
const LIMIT = Math.floor(0x1_0000_0000 / 10 ** CODE_LENGTH) * 10 ** CODE_LENGTH;

/** Feeds a scripted sequence of draws so sampling behaviour is observable, not guessed. */
function scripted(...draws: number[]) {
  let i = 0;
  return () => draws[Math.min(i++, draws.length - 1)];
}

describe('generateVerificationCode', () => {
  it('always returns exactly CODE_LENGTH digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateVerificationCode()).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
    }
  });

  it('zero-pads a small draw rather than emitting a short code', () => {
    expect(generateVerificationCode(scripted(7))).toBe('000007');
  });

  /**
   * The control that makes this suite worth running. `LIMIT` is the first value the
   * rejection loop must refuse; `LIMIT % 10^6` is exactly 0, so a plain `draw % 10^6`
   * implementation returns '000000' here while a rejecting one draws again and returns
   * '000042'. Asserting BOTH sides pins the behaviour rather than the outcome — without
   * the negative, an implementation that happened to produce '000042' some other way
   * would pass.
   */
  it('rejects a draw at or above the bias threshold and draws again', () => {
    const code = generateVerificationCode(scripted(LIMIT, 42));
    expect(code).toBe('000042');
    expect(code).not.toBe('000000');
  });

  it('keeps rejecting across several out-of-range draws', () => {
    expect(generateVerificationCode(scripted(LIMIT, LIMIT + 5, 0xFFFFFFFF, 123456))).toBe('123456');
  });

  it('accepts the largest in-range draw without rejecting it', () => {
    expect(generateVerificationCode(scripted(LIMIT - 1))).toBe('999999');
  });
});

describe('normalizeVerificationCode', () => {
  it('strips the spaces phone keyboards insert', () => {
    expect(normalizeVerificationCode('123 456')).toBe('123456');
  });

  it('strips a pasted separator', () => {
    expect(normalizeVerificationCode('123-456')).toBe('123456');
  });

  it('survives an absent value rather than throwing', () => {
    expect(normalizeVerificationCode(undefined as unknown as string)).toBe('');
  });
});

describe('isWellFormedCode', () => {
  it('accepts six digits', () => {
    expect(isWellFormedCode('000000')).toBe(true);
  });

  it('rejects five digits, six being the length the attempt cap is sized against', () => {
    expect(isWellFormedCode('12345')).toBe(false);
  });

  it('rejects seven digits', () => {
    expect(isWellFormedCode('1234567')).toBe(false);
  });

  it('rejects a non-digit', () => {
    expect(isWellFormedCode('12345a')).toBe(false);
  });
});

describe('MAX_CODE_ATTEMPTS', () => {
  /**
   * Not a tautology: this constant is the ONLY thing standing between a signup on
   * someone else's address and a verified email, so a change to it is a security change
   * and should be argued for in a diff rather than slipped in.
   */
  it('is small enough that guessing is not a viable path to a verified email', () => {
    expect(MAX_CODE_ATTEMPTS).toBeLessThanOrEqual(10);
    expect(MAX_CODE_ATTEMPTS).toBeGreaterThan(0);
  });
});
