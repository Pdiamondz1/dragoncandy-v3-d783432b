import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { USER_FIELDS } from './tiktok-metrics.ts';

/**
 * Every profile field we ask TikTok for must reach the row.
 *
 * The first real TikTok connection (`tumericturtle`, 2026-08-26) landed with
 * `follower_count`, `following_count`, `likes_count` and `video_count` all
 * null. Nothing was broken: `fetchAccount` requested them, TikTok returned
 * them, and `store_tiktok_connection` was simply never handed them.
 *
 * What makes it worth a test rather than a fix is WHERE the claim lived. The
 * call site carried a comment saying the row is written "with a display name,
 * handle AND STATS already in it. A row that appears with everything null and
 * fills in a second later reads like a broken connect." The code did the exact
 * thing the comment warned against, and the comment read as evidence that it
 * did not. That is the third time on this branch a comment asserted a property
 * the code lacked -- Codex caught the other two, both in review, neither by a
 * test. A comment is a claim, and nothing tests it.
 *
 * So this DERIVES the expectation from `USER_FIELDS` rather than listing the
 * ten fields again. A hand-written list is a second enumeration to keep in
 * sync, and this project has watched that fail: the `profiles` write-grant
 * audit was done by grep twice and missed a call site both times, and the logo
 * guard pinned the two files already fixed while three others stayed wrong.
 * Add a field to `USER_FIELDS` without wiring it through and this fails.
 */

const callbackSource = readFileSync(
  join(__dirname, '..', 'tiktok-oauth-callback', 'index.ts'),
  'utf8',
);

describe('the TikTok connect write carries every field we fetched', () => {
  it('passes each USER_FIELDS entry to store_tiktok_connection', () => {
    const missing = USER_FIELDS.filter(
      (field) => !callbackSource.includes(`p_${field}: account.${field}`),
    );
    expect(missing).toEqual([]);
  });

  it('actually asks TikTok for the four stats', () => {
    // Guards the other end. Wiring the arguments through would look identical
    // if we quietly stopped requesting the fields, and the row would go back to
    // nulls with every test still green.
    for (const stat of ['follower_count', 'following_count', 'likes_count', 'video_count']) {
      expect(USER_FIELDS).toContain(stat);
    }
  });

  it('reads the fields off the account object, never off the token response', () => {
    // `account` is the parsed profile; `tokens` is the OAuth exchange. Only one
    // of them has ever carried a follower count.
    for (const stat of ['follower_count', 'following_count', 'likes_count', 'video_count']) {
      expect(callbackSource).not.toContain(`p_${stat}: tokens.`);
    }
  });
});

describe('a reconnect cannot inherit the previous account s numbers', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'migrations',
      '20260826210000_store_tiktok_connection_stats.sql',
    ),
    'utf8',
  );

  it('sets the stats from excluded on conflict, rather than coalescing them', () => {
    // The original `on conflict` branch omitted these four columns entirely, so
    // reconnecting to a DIFFERENT TikTok account kept the old account's
    // follower count while `last_synced_at` and `insights` were correctly
    // reset. A coalesce would be the same bug with more typing: a null from the
    // new account MUST overwrite a number from the old one, because a real
    // measurement attributed to the wrong subject is a fabrication, not
    // staleness. See [[Honest Analytics]].
    for (const col of ['follower_count', 'following_count', 'likes_count', 'video_count']) {
      expect(migration).toContain(`${col.padEnd(23)} = excluded.${col}`);
      expect(migration).not.toContain(`= coalesce(excluded.${col}`);
    }
  });

  it('drops the old 12-argument signature instead of replacing it', () => {
    // `create or replace` with a different parameter list makes an OVERLOAD,
    // not a replacement. Both bodies would exist and PostgREST would keep
    // resolving a 12-argument call to the old one -- which is precisely the
    // body that drops the stats on the floor.
    expect(migration).toContain('drop function if exists public.store_tiktok_connection(');
    expect(migration).toMatch(/create function public\.store_tiktok_connection\(/);
  });

  it('re-grants execute to service_role only, since the drop took the grants', () => {
    expect(migration).toMatch(/revoke execute on function public\.store_tiktok_connection\(/);
    expect(migration).toMatch(/from public, anon, authenticated;/);
    expect(migration).toMatch(/\) to service_role;/);
  });
});

describe('the counters are bigint, in the columns AND in both RPCs', () => {
  const bigintMigration = readFileSync(
    join(__dirname, '..', '..', 'migrations', '20260826230000_tiktok_counters_bigint.sql'),
    'utf8',
  );

  const COUNTERS = ['follower_count', 'following_count', 'likes_count', 'video_count'];

  it('widens all four columns', () => {
    // `likes_count` is a LIFETIME total across every video, and the largest
    // TikTok accounts passed int4's 2,147,483,647 long ago. The other three are
    // nowhere near it and are widened anyway — leaving them one viral decade
    // from the identical bug saves nothing.
    for (const col of COUNTERS) {
      expect(bigintMigration).toMatch(
        new RegExp(`alter column ${col}\\s+type bigint`),
      );
    }
  });

  /**
   * Scoped to each function's own declaration, and that is not fussiness.
   *
   * The first version of these two tests asserted `toContain('p_likes_count
   * bigint')` against the whole file. A forced control that reverted the
   * CONNECT function's parameter to `integer` did NOT fail it — because the
   * CACHE function's `p_likes_count bigint default null` contains that exact
   * substring and satisfied the assertion from twelve lines away. The test was
   * green for a reason that had nothing to do with what it claimed to check.
   *
   * Same family as the logo guard that watched the two files already fixed, and
   * the `k` pin that held a value nothing read. A green test is not evidence
   * until something has made it go red.
   */
  const fnBlock = (name: string) => {
    const start = bigintMigration.indexOf(`create function public.${name}(`);
    expect(start, `${name} is not created in this migration`).toBeGreaterThan(-1);
    const end = bigintMigration.indexOf(')\nreturns jsonb', start);
    expect(end, `${name} signature is not terminated as expected`).toBeGreaterThan(start);
    return bigintMigration.slice(start, end);
  };

  it('declares them bigint in store_tiktok_connection', () => {
    const block = fnBlock('store_tiktok_connection');
    for (const col of COUNTERS) {
      expect(block).toMatch(new RegExp(`p_${col} bigint,`));
      expect(block).not.toMatch(new RegExp(`p_${col} integer`));
    }
  });

  it('declares them bigint in cache_tiktok_insights too', () => {
    // The review that found this named only the connect path. The insights read
    // writes the same four columns through its own RPC, so fixing one would
    // leave the identical crash one endpoint over — and there it marks a
    // healthy connection failed on every refresh rather than at connect.
    const block = fnBlock('cache_tiktok_insights');
    for (const col of COUNTERS) {
      expect(block).toMatch(new RegExp(`p_${col} bigint default null`));
      expect(block).not.toMatch(new RegExp(`p_${col} integer`));
    }
  });

  it('leaves no integer overload of either function behind', () => {
    // A different parameter list makes an OVERLOAD, not a replacement. It is
    // sharper for cache_tiktok_insights, whose counters have `default null`: a
    // call omitting them resolves to whichever overload matched, silently.
    expect(bigintMigration).toContain('drop function if exists public.store_tiktok_connection(');
    expect(bigintMigration).toContain('drop function if exists public.cache_tiktok_insights(');
    // The dropped signatures must name `integer` — dropping the bigint one
    // would delete what this migration just created.
    expect(bigintMigration).toMatch(
      /drop function if exists public\.cache_tiktok_insights\(\s*uuid, text, jsonb, integer, integer, integer, integer, text, text, text\s*\);/,
    );
  });

  it('widens the READ path too, not only the two write RPCs', () => {
    // The bigint migration moved the columns and both write RPCs and stopped
    // there. `tiktok_connection_status()` declares the same four columns as
    // `integer` in its RETURNS TABLE, and an SQL function coerces its result to
    // the declared type -- so it narrowed bigint back to int4 on the way out and
    // raised 22003 for exactly the values the widening existed to permit. That
    // is the UI-facing function, and `useTikTokConnection` throws on error, so
    // one big account would have taken the card's red branch on all three
    // settings surfaces.
    //
    // Widening a column is not a local change: every function DECLARING a type
    // over that column has to move with it. Codex found this one; the schema
    // grep for the rest turned up only `p_skew_seconds` and
    // `p_claim_ttl_seconds`, which are seconds and correctly small.
    const statusMigration = readFileSync(
      join(__dirname, '..', '..', 'migrations', '20260826240000_tiktok_status_bigint.sql'),
      'utf8',
    );
    for (const col of COUNTERS) {
      expect(statusMigration).toMatch(new RegExp(`${col} bigint`));
      expect(statusMigration).not.toMatch(new RegExp(`${col} integer`));
    }
    // Not optional here: PostgreSQL refuses to change an existing function's
    // return type, so `create or replace` errors rather than making an overload.
    //
    // Anchored to the start of a line, because `toContain` passed when a forced
    // control COMMENTED THE DROP OUT -- `-- drop function ...` still contains
    // the substring. Second time today a substring assertion of mine was
    // satisfied by text that does not do the thing: the earlier one was
    // `p_likes_count bigint` matching a different function's `bigint default
    // null`. Substring matching over source is a weak instrument; anchor it.
    expect(statusMigration).toMatch(
      /^drop function if exists public\.tiktok_connection_status\(\);$/m,
    );
    // The drop takes the grants with it. `anon` must be named -- a bare REVOKE
    // FROM PUBLIC does not lock a definer function down against Supabase's
    // default privileges.
    expect(statusMigration).toMatch(/revoke execute on function public\.tiktok_connection_status\(\) from public, anon;/);
    expect(statusMigration).toMatch(/grant execute on function public\.tiktok_connection_status\(\) to authenticated, service_role;/);
  });

  it('keeps coalesce in the cache path and set-from-excluded in the connect path', () => {
    // Opposite rules, deliberately. cache_tiktok_insights returns
    // `account_changed` unless open_id matches, so it is always refreshing the
    // SAME account and an absent stat should leave the last known value.
    // store_tiktok_connection may be writing a DIFFERENT account over the old
    // row, so a null there must erase.
    for (const col of COUNTERS) {
      expect(bigintMigration).toContain(`${col} = coalesce(p_${col}, ${col})`);
      expect(bigintMigration).toContain(`= excluded.${col}`);
    }
  });
});
