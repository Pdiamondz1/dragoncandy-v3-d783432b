import { describe, it, expect } from 'vitest';
import type { DeliveryTier } from '@/types/campaignMedia';
import {
  deadlineForTier,
  tierForDeadline,
  todayISO,
  isDeadlineAcceptable,
} from './deliverySchedule';
import { launchValidationSchema } from './campaignCreatorValidation';

const ALL_TIERS: DeliveryTier[] = ['dragondash', 'express', 'standard'];

/** A YYYY-MM-DD string `days` from local midnight today, built independently of the SUT. */
function localDateNDaysOut(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** Whole days between local midnight today and a YYYY-MM-DD string. */
function daysOut(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 86_400_000
  );
}

describe('deadlineForTier', () => {
  // Each date must sit inside the turnaround the UI advertises from TIER_LIMITS —
  // DragonDash "1–3 hours", Express "24–48 hours", Standard "5–7 days" — so tapping a
  // fast tier never writes a deadline the tier itself could not meet.
  it('writes a deadline that matches the advertised turnaround', () => {
    expect(daysOut(deadlineForTier('dragondash'))).toBe(0); // 1–3 hours = today
    expect(daysOut(deadlineForTier('express'))).toBe(2); // 24–48 hours
    expect(daysOut(deadlineForTier('standard'))).toBe(7); // 5–7 days
  });

  it('emits a local YYYY-MM-DD date, never a UTC-shifted one', () => {
    // toISOString() would roll the date forward on an evening in a negative UTC offset.
    for (const tier of ALL_TIERS) {
      const iso = deadlineForTier(tier);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(iso).toBe(localDateNDaysOut(daysOut(iso)));
    }
  });
});

describe('tierForDeadline', () => {
  it('round-trips with deadlineForTier for every tier', () => {
    for (const tier of ALL_TIERS) {
      expect(tierForDeadline(deadlineForTier(tier))).toBe(tier);
    }
  });

  // The rule is "cheapest tier that can still make the date", not "nearest label".
  it('maps each day boundary to the cheapest tier that can still hit it', () => {
    expect(tierForDeadline(localDateNDaysOut(0))).toBe('dragondash'); // due today
    // 1 day out: Express's 48-hour worst case could miss it, so it stays DragonDash.
    expect(tierForDeadline(localDateNDaysOut(1))).toBe('dragondash');
    expect(tierForDeadline(localDateNDaysOut(2))).toBe('express');
    expect(tierForDeadline(localDateNDaysOut(4))).toBe('express');
    // 5 days out is inside Standard's own 5–7 day window — don't upsell to Express.
    expect(tierForDeadline(localDateNDaysOut(5))).toBe('standard');
    expect(tierForDeadline(localDateNDaysOut(7))).toBe('standard');
  });

  it('always resolves to a real tier, however far out the date is', () => {
    // The control it replaced returned null past 22 days, leaving nothing highlighted.
    for (const days of [0, 1, 2, 3, 4, 7, 14, 21, 22, 23, 400]) {
      expect(ALL_TIERS).toContain(tierForDeadline(localDateNDaysOut(days)));
    }
  });

  it('falls back to standard for empty or unparseable input', () => {
    expect(tierForDeadline('')).toBe('standard');
    expect(tierForDeadline('not-a-date')).toBe('standard');
  });

  it('treats a past deadline as the most urgent tier', () => {
    expect(tierForDeadline(localDateNDaysOut(-5))).toBe('dragondash');
  });
});

describe('todayISO', () => {
  it('is zero days out', () => {
    expect(daysOut(todayISO())).toBe(0);
  });
});

describe('isDeadlineAcceptable', () => {
  it('accepts today, because DragonDash delivers same-day', () => {
    expect(isDeadlineAcceptable(todayISO())).toBe(true);
  });

  it('accepts future dates and rejects past ones', () => {
    expect(isDeadlineAcceptable(localDateNDaysOut(1))).toBe(true);
    expect(isDeadlineAcceptable(localDateNDaysOut(30))).toBe(true);
    expect(isDeadlineAcceptable(localDateNDaysOut(-1))).toBe(false);
  });

  it('rejects empty and unparseable input', () => {
    expect(isDeadlineAcceptable('')).toBe(false);
    expect(isDeadlineAcceptable('not-a-date')).toBe(false);
  });
});

describe('launch validation accepts every tier this selector can produce', () => {
  // Regression: DragonDash writes today's date, and the old check
  // (`new Date(d) > new Date()`) parsed that as UTC midnight — already past by
  // morning in the Americas — so picking DragonDash made the campaign unlaunchable.
  const deadlineField = launchValidationSchema.shape.deadline;

  it.each(ALL_TIERS)('accepts the %s deadline', (tier) => {
    expect(deadlineField.safeParse(deadlineForTier(tier)).success).toBe(true);
  });

  it('still rejects a past deadline', () => {
    expect(deadlineField.safeParse(localDateNDaysOut(-1)).success).toBe(false);
  });
});
