import { describe, it, expect, vi } from 'vitest';
import {
  pollCampaignJob,
  CampaignJobFailedError,
  CampaignJobTimeoutError,
  type CampaignJobRow,
} from './campaignGenerationJob';

const instant = async () => {};

function rowsSequence(rows: Array<CampaignJobRow | null | Error>) {
  let i = 0;
  return async (): Promise<CampaignJobRow | null> => {
    const next = rows[Math.min(i, rows.length - 1)];
    i++;
    if (next instanceof Error) throw next;
    return next;
  };
}

const processing = (progress: string | null = null): CampaignJobRow => ({
  status: 'processing',
  progress,
  result: null,
  error: null,
});

describe('pollCampaignJob', () => {
  it('resolves the result when a later poll returns done', async () => {
    const fetchRow = rowsSequence([
      processing(),
      processing('Generating campaign ideas…'),
      { status: 'done', progress: null, result: { business_context: { business_name: 'Testaurant' } }, error: null },
    ]);
    const result = await pollCampaignJob(fetchRow, { sleep: instant });
    expect(result).toEqual({ business_context: { business_name: 'Testaurant' } });
  });

  it('throws CampaignJobFailedError with the server message on status=error', async () => {
    const fetchRow = rowsSequence([
      processing(),
      { status: 'error', progress: null, result: null, error: 'Anthropic 529: overloaded' },
    ]);
    await expect(pollCampaignJob(fetchRow, { sleep: instant })).rejects.toThrow(CampaignJobFailedError);
    await expect(
      pollCampaignJob(rowsSequence([{ status: 'error', progress: null, result: null, error: 'boom' }]), { sleep: instant }),
    ).rejects.toThrow('boom');
  });

  // The whole point of polling: a dropped poll must not abort the wait.
  it('survives fetch blips (throws and nulls) and still resolves', async () => {
    const fetchRow = rowsSequence([
      new Error('network dropped'),
      null,
      new Error('still offline'),
      { status: 'done', progress: null, result: { ok: true }, error: null },
    ]);
    const result = await pollCampaignJob(fetchRow, { sleep: instant });
    expect(result).toEqual({ ok: true });
  });

  it('times out with CampaignJobTimeoutError after the deadline', async () => {
    const fetchRow = rowsSequence([processing()]);
    await expect(
      pollCampaignJob(fetchRow, { sleep: instant, intervalMs: 1000, timeoutMs: 5000 }),
    ).rejects.toThrow(CampaignJobTimeoutError);
  });

  it('reports progress changes exactly once each', async () => {
    const onProgress = vi.fn();
    const fetchRow = rowsSequence([
      processing('Reading your link…'),
      processing('Reading your link…'),
      processing('Generating campaign ideas…'),
      { status: 'done', progress: null, result: {}, error: null },
    ]);
    await pollCampaignJob(fetchRow, { sleep: instant, onProgress });
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      'Reading your link…',
      'Generating campaign ideas…',
    ]);
  });

  it('a done row with a null result rejects as failed, not resolves undefined', async () => {
    const fetchRow = rowsSequence([{ status: 'done', progress: null, result: null, error: null }]);
    await expect(pollCampaignJob(fetchRow, { sleep: instant })).rejects.toThrow(CampaignJobFailedError);
  });
});
