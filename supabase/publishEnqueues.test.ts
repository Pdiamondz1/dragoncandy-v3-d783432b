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

  // Claiming an outcome this branch cannot know is how a queued post gets
  // reported as a failure the user then re-creates by hand.
  it.each(enqueueSources())('$name reports an unconfirmed enqueue honestly', ({ source }) => {
    expect(source).toMatch(/enqueue_unconfirmed/);
    expect(source).not.toMatch(/'Could not queue the post', 500/);
  });
});
