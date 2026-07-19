import { describe, it, expect } from 'vitest';
import type { DeliveryTier } from '@/types/campaignMedia';
import { deadlineForTier, tierForDeadline, todayISO } from './deliverySchedule';

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
  it('lands each tier the documented number of days out', () => {
    expect(daysOut(deadlineForTier('dragondash'))).toBe(1);
    expect(daysOut(deadlineForTier('express'))).toBe(3);
    expect(daysOut(deadlineForTier('standard'))).toBe(7);
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

  it('maps each day boundary to the right tier', () => {
    expect(tierForDeadline(localDateNDaysOut(0))).toBe('dragondash'); // due today
    expect(tierForDeadline(localDateNDaysOut(1))).toBe('dragondash');
    expect(tierForDeadline(localDateNDaysOut(2))).toBe('express');
    expect(tierForDeadline(localDateNDaysOut(3))).toBe('express');
    expect(tierForDeadline(localDateNDaysOut(4))).toBe('standard');
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
