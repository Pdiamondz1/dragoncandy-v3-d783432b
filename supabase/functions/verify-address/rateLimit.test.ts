import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DAILY_LIMIT,
  DAILY_WINDOW_MS,
  BURST_LIMIT,
  BURST_WINDOW_MS,
  IP_DAILY_LIMIT,
} from './rateLimit';

const HERE = join(process.cwd(), 'supabase', 'functions', 'verify-address');
const indexSrc = readFileSync(join(HERE, 'index.ts'), 'utf8');
const migrationSrc = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260825100000_reserve_address_verification.sql'),
  'utf8',
);

// These assert RELATIONSHIPS and WIRING, not the literals themselves. A test that only
// restates `DAILY_LIMIT === 40` fails whenever someone deliberately retunes the cap and
// proves nothing in the meantime — the same "a pin holding a value nothing reads is worse
// than no pin, because it looks green" problem recorded for the RAG eval's k constant.
describe('address verification throttle constants', () => {
  it('bounds the worst case a single account can spend per day', () => {
    // Geocoding is ~$5 per 1,000 requests. A fully abusive account must stay trivially cheap,
    // because the Google console offers NO daily quota cap to fall back on ("Quota is not
    // adjustable", verified 2026-08-23) — this constant is the only bound that exists.
    const worstCaseDollarsPerAccount = (DAILY_LIMIT / 1000) * 5;
    expect(worstCaseDollarsPerAccount).toBeLessThanOrEqual(0.25);
  });

  it('bounds the worst case one IP can spend per day', () => {
    const worstCaseDollarsPerIp = (IP_DAILY_LIMIT / 1000) * 5;
    expect(worstCaseDollarsPerIp).toBeLessThanOrEqual(1.0);
  });

  it('keeps the burst window strictly tighter than the daily window', () => {
    // If these ever invert, the burst cap becomes the daily cap and one dimension is dead.
    expect(BURST_WINDOW_MS).toBeLessThan(DAILY_WINDOW_MS);
    expect(BURST_LIMIT).toBeLessThan(DAILY_LIMIT);
  });

  it('leaves the daily cap reachable through the burst cap', () => {
    // A burst cap so tight that the daily cap can never be reached would make DAILY_LIMIT
    // decorative. At BURST_LIMIT per BURST_WINDOW, a user must be able to reach DAILY_LIMIT
    // within the day.
    const maxPerDayViaBurst = BURST_LIMIT * (DAILY_WINDOW_MS / BURST_WINDOW_MS);
    expect(maxPerDayViaBurst).toBeGreaterThan(DAILY_LIMIT);
  });

  it('sets the per-IP cap above the per-user cap', () => {
    // Several genuine users share one address (office wifi, carrier NAT). At or below the
    // per-user cap, the first user through the door consumes the whole building's budget.
    expect(IP_DAILY_LIMIT).toBeGreaterThan(DAILY_LIMIT);
  });
});

describe('throttle wiring', () => {
  it('index.ts passes every constant to the RPC rather than re-deciding locally', () => {
    // The pin that matters: a constant nothing reads is not a control. Assert the CALL SITE
    // uses each one.
    for (const name of ['DAILY_LIMIT', 'DAILY_WINDOW_MS', 'BURST_LIMIT', 'BURST_WINDOW_MS', 'IP_DAILY_LIMIT']) {
      expect(indexSrc).toContain(name);
    }
    expect(indexSrc).toContain('reserve_address_verification');
  });

  it('reserves BEFORE the geocode request, not after', () => {
    // Ordering is the whole control. If the reservation ever moves below the fetch there is no
    // throttle at all, and nothing else in the suite would notice.
    const reserveAt = indexSrc.indexOf('await reserveAddressVerification(');
    const fetchAt = indexSrc.indexOf('await fetch(`${GEOCODE_BASE}');
    expect(reserveAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(reserveAt).toBeLessThan(fetchAt);
  });

  it('fails closed when the reservation RPC gives no usable answer', () => {
    // A null reservation must refuse, never fall through to the billed request.
    expect(indexSrc).toContain('if (!reservation) {');
    expect(indexSrc).toMatch(/if \(!reservation\) \{[\s\S]{0,400}?503/);
  });

  it('never hands a spent slot back', () => {
    // Both post-request outcomes must count. If either were excluded from the RPC's counting
    // predicate, induced failures would be a free bypass.
    expect(indexSrc).toContain('"failed"');
    expect(indexSrc).toContain('"answered"');
    expect(migrationSrc).toContain("outcome <> 'throttled'");
    expect(migrationSrc).not.toContain("outcome = 'answered'");
  });

  it('never returns ip_daily to the caller', () => {
    // 'ip_daily' means OTHER accounts sharing this IP consumed the bucket. The LOG may say so;
    // the RESPONSE may not. So the assertion has to be scoped to the response body — an
    // unscoped `not.toMatch(/reason: reservation.reason/)` also forbids the console.warn, which
    // is precisely where the true reason belongs. (It did, and this test caught it.)
    const start = indexSrc.indexOf('return json(req, 429,');
    expect(start).toBeGreaterThan(-1);
    const responseBlock = indexSrc.slice(start, indexSrc.indexOf('});', start) + 3);

    expect(responseBlock).toContain('publicReason');
    expect(responseBlock).not.toContain('reservation.reason');
    // And the collapse itself: anything that is not a burst must report as the daily reason.
    expect(indexSrc).toMatch(/publicReason\s*=\s*reservation\.reason === "user_burst"\s*\?\s*"user_burst"\s*:\s*"user_daily"/);
  });

  it('has no unbounded decline-write path in the caller', () => {
    // Codex P1 on the first revision: the caller inserted a 'throttled' row on EVERY declined
    // request, so a throttled attacker could generate unlimited writes — a storage and
    // query-degradation DoS inside the endpoint meant to bound abuse. The decline audit now
    // lives in the RPC, capped at one row per user per daily window under the same lock.
    // Assert the DEFINITION and the CALL are gone, not that the word is absent — the word
    // legitimately survives in the comment telling the next person not to reintroduce it.
    // (A bare not.toContain('recordThrottled') failed on exactly that comment.)
    expect(indexSrc).not.toMatch(/function\s+recordThrottled/);
    expect(indexSrc).not.toMatch(/await\s+recordThrottled\s*\(/);
    // The caller must not insert into the attempts table at all; its only write is the
    // outcome UPDATE on a slot it already reserved.
    expect(indexSrc).not.toMatch(/from\("address_verification_attempts"\)\s*\.insert/);
    expect(indexSrc).toMatch(/from\("address_verification_attempts"\)\s*\.update/);
  });

  it('bounds the decline audit in the RPC', () => {
    // The bound is an exists-check inside the advisory lock, so check-and-insert cannot race.
    expect(migrationSrc).toMatch(/if not exists \([\s\S]{0,300}?outcome = 'throttled'[\s\S]{0,200}?\) then[\s\S]{0,300}?insert into address_verification_attempts/);
    // And it must be scoped to the daily window, not to all time — an all-time bound would
    // silently stop recording declines after the first one ever.
    expect(migrationSrc).toMatch(/outcome = 'throttled'\s*\n\s*and created_at >= v_user_window_start/);
  });

  it('keeps the throttle decision out of TypeScript', () => {
    // verify-phone's Codex P1 was a check-then-act race created by exactly this: a decision in
    // application code over a prior read. There must be no local comparison against the caps.
    expect(indexSrc).not.toMatch(/>=\s*DAILY_LIMIT/);
    expect(indexSrc).not.toMatch(/>=\s*BURST_LIMIT/);
    expect(indexSrc).not.toMatch(/>=\s*IP_DAILY_LIMIT/);
  });
});

describe('reservation RPC lockdown', () => {
  it('is service_role only', () => {
    expect(migrationSrc).toContain('service_role only');
    expect(migrationSrc).toMatch(/revoke execute on function public\.reserve_address_verification/);
    expect(migrationSrc).toMatch(/grant execute on function public\.reserve_address_verification[\s\S]{0,120}to service_role/);
  });

  it('locks in a fixed order so a shared IP queues rather than deadlocks', () => {
    const userLock = migrationSrc.indexOf("address_verify:user:");
    const ipLock = migrationSrc.indexOf("address_verify:ip:");
    expect(userLock).toBeGreaterThan(-1);
    expect(ipLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(ipLock);
  });

  it('denies the attempts table to every client role', () => {
    expect(migrationSrc).toContain('revoke all on public.address_verification_attempts from public, anon, authenticated');
    expect(migrationSrc).toContain('enable row level security');
  });
});
