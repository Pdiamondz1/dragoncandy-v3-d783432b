// Client half of the async campaign-generation flow: the edge function returns a
// job id immediately and finishes the ~1-min generation server-side; the browser
// polls its own campaign_generation_jobs row until it's terminal. Polling (unlike
// one long fetch) survives connection drops and mobile tab backgrounding — a
// missed tick just means the next poll finds the finished row.
// Spec: docs/superpowers/specs/2026-07-14-campaign-generate-async-jobs-design.md

export interface CampaignJobRow {
  status: 'processing' | 'done' | 'error';
  progress: string | null;
  result: unknown | null;
  error: string | null;
}

export class CampaignJobFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignJobFailedError';
  }
}

export class CampaignJobTimeoutError extends Error {
  constructor() {
    super('Campaign generation timed out');
    this.name = 'CampaignJobTimeoutError';
  }
}

export interface PollCampaignJobOptions {
  /** Delay between polls. Default 2500ms. */
  intervalMs?: number;
  /** Give up after this long. Default 180000ms (3 min). */
  timeoutMs?: number;
  /** Called once per progress-text change. */
  onProgress?: (progress: string) => void;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls `fetchRow` until the job is terminal. A fetch error or missing row is a
 * blip, not a failure — the loop keeps going until the deadline.
 */
export async function pollCampaignJob(
  fetchRow: () => Promise<CampaignJobRow | null>,
  options: PollCampaignJobOptions = {},
): Promise<unknown> {
  const { intervalMs = 2500, timeoutMs = 180_000, onProgress, sleep = defaultSleep } = options;
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let lastProgress: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let row: CampaignJobRow | null = null;
    try {
      row = await fetchRow();
    } catch {
      // Network blip — keep polling.
    }

    if (row) {
      if (row.progress && row.progress !== lastProgress) {
        lastProgress = row.progress;
        onProgress?.(row.progress);
      }
      if (row.status === 'done') {
        if (row.result == null) {
          throw new CampaignJobFailedError('Generation finished without a result');
        }
        return row.result;
      }
      if (row.status === 'error') {
        throw new CampaignJobFailedError(row.error ?? 'Generation failed');
      }
    }

    await sleep(intervalMs);
  }

  throw new CampaignJobTimeoutError();
}
