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
