import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every publish enqueue requires an idempotency key, and none of them deletes
 * staged media once the outcome is unknown.
 *
 * Both properties are invisible when broken. A missing key produces a second
 * job only when an HTTP response is lost, and a wrongly-placed discard produces
 * a job pointing at deleted bytes only in the same rare window — so neither
 * shows up in ordinary use, in a review that reads the happy path, or in any
 * test that does not simulate a dropped connection.
 *
 * Sibling of `publishSweeps.test.ts`, and re-derived from disk for the same
 * reason: a third platform's enqueue is covered the day it is written, which a
 * hand-written list of two files cannot manage. This repo has watched a
 * hand-maintained enumeration fail three times on `profiles` write grants.
 *
 * See 20260826380000 for what a lost enqueue response actually costs.
 */

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

function enqueueSources(): { name: string; source: string }[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[a-z0-9-]+-publish-enqueue$/.test(e.name))
    .map((e) => ({
      name: e.name,
      source: readFileSync(join(FUNCTIONS_DIR, e.name, 'index.ts'), 'utf8'),
    }))
    .filter((f) => f.source.includes('enqueue_publish_job'));
}

describe('publish enqueue functions', () => {
  // CONTROL. A discovery bug that found zero files would make every assertion
  // below vacuously true — the failure mode of a re-derived list.
  it('finds the enqueue functions that exist', () => {
    const names = enqueueSources().map((s) => s.name).sort();
    expect(names).toEqual(['facebook-publish-enqueue', 'instagram-publish-enqueue']);
  });

  it.each(enqueueSources())('$name demands an idempotency key from its caller', ({ source }) => {
    // Read from the request, not invented here: a server-minted value differs on
    // every retry, which is the same as having none at all.
    expect(source).toMatch(/body\?\.idempotency_key/);
    expect(source).toMatch(/p_idempotency_key:\s*idempotencyKey/);
    // Refused rather than defaulted. A silently-absent key fails in the
    // direction that costs a duplicate public post.
    expect(source).toMatch(/no_idempotency_key/);
  });

  it.each(enqueueSources())('$name acts on the RPC’s deduplicated answer', ({ source }) => {
    // Without this the replay leaves a second frozen copy of the media in the
    // bucket for ever — the job points at the first one.
    expect(source).toMatch(/result\.deduplicated/);
  });

  // The half that is easy to get backwards. `staging.discard()` in the catch is
  // correct for everything that fails BEFORE the RPC is issued and wrong for
  // everything after, because after it the commit outcome is unknown.
  it.each(enqueueSources())('$name never deletes media on an unknown outcome', ({ source }) => {
    expect(source).toMatch(/let rpcAttempted = false;/);
    expect(source).toMatch(/rpcAttempted = true;/);
    expect(source).toMatch(/if \(!rpcAttempted\) await staging\?\.discard\(\);/);

    // And the bare form must be gone from the catch — a single unguarded
    // `await staging?.discard()` there is exactly the defect.
    const catchBody = source.slice(source.indexOf('} catch (err) {'));
    expect(catchBody).not.toMatch(/^\s*await staging\?\.discard\(\);/m);
  });

  // A key reused for a DIFFERENT post must not be answered with the other
  // post's job. Silently returning it reports success for work that was thrown
  // away — the one refusal shape in this feature that tells the caller nothing
  // is wrong. See 20260826390000.
  it.each(enqueueSources())('$name tells a key conflict apart from a replay', ({ source }) => {
    expect(source).toMatch(/result\?\.conflict/);
    expect(source).toMatch(/idempotency_key_conflict/);
    // 409, not 400: a client that cannot tell the two apart retries the same
    // key for ever.
    expect(source).toMatch(/idempotency_key_conflict[\s\S]{0,200}409/);
  });

  // The digest must key on the file the USER picked, never on where we staged
  // it. `plannedDestinations` mints a fresh random batch directory every
  // invocation — by design, so two approvals of one file are two frozen sets of
  // bytes — so digesting destinations makes every retry look like a different
  // post and answers it with a conflict. That is the two-fixes-cancelling-out
  // defect (Codex, round 9); the only visible difference is one argument.
  it.each(enqueueSources())('$name digests the media SOURCES, not the staged paths', ({ source }) => {
    // Hoisted, because the fast-path lookup and the enqueue must digest the
    // same thing and reading `body` twice is how they would come to differ.
    expect(source).toMatch(/const mediaSources = media\.map\(/);
    expect(source).toMatch(/p_media_sources:\s*mediaSources/);
    // The wrong version, spelled out so it cannot creep back in.
    expect(source).not.toMatch(/p_media_sources:\s*staging\.destinations/);
    // And the security check stays on destinations, which is the half sources
    // deliberately do not touch.
    expect(source).toMatch(/p_media_paths:\s*staging\.destinations/);
  });

  // ORDER, not merely presence. Resolving the key after staging means a retry
  // re-probes and re-copies the source first — so a source the user has since
  // deleted answers `media_not_found` for a post that is queued and about to
  // publish, and every ordinary retry pays for a copy it discards a moment
  // later (Codex, round 10).
  it.each(enqueueSources())('$name resolves the key BEFORE staging', ({ source }) => {
    const resolve = source.indexOf("'resolve_publish_idempotency'");
    const stage = source.indexOf('await staging.stage()');
    expect(resolve).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(-1);
    expect(resolve).toBeLessThan(stage);
  });

  // A malformed `scheduled_at` or `source_schedule_id` fails inside PostgREST's
  // argument coercion — which reads as "the RPC failed", so the handler stages
  // the media, sets `rpcAttempted`, suppresses the cleanup, and reports an
  // unknown outcome for a request that could never have committed (Codex,
  // round 11). Refusing them up front is the only place that costs nothing.
  it.each(enqueueSources())('$name validates its scalar fields before staging', ({ source }) => {
    expect(source).toMatch(/const scheduledAt = parseScheduledAt\(body\?\.scheduled_at\)/);
    expect(source).toMatch(/parseOptionalUuid\(body\?\.source_schedule_id/);
    // The typeof-only form is what let them through.
    expect(source).not.toMatch(/typeof body\?\.scheduled_at === 'string'/);
    expect(source).not.toMatch(/typeof body\?\.source_schedule_id === 'string'/);

    const validate = source.indexOf('parseScheduledAt(');
    const stage = source.indexOf('await staging.stage()');
    expect(validate).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(stage);
  });

  // Claiming an outcome this branch cannot know is how a queued post gets
  // reported as a failure the user then re-creates by hand.
  it.each(enqueueSources())('$name reports an unconfirmed enqueue honestly', ({ source }) => {
    expect(source).toMatch(/enqueue_unconfirmed/);
    expect(source).not.toMatch(/'Could not queue the post', 500/);
  });
});
