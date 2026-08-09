// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialDraftCard } from './SocialDraftCard';

const mutate = vi.fn();
vi.mock('@/hooks/outstand/useCrossPost', () => ({
  useCrossPost: () => ({ mutate, isPending: false }),
}));

// The CT-4b guard. Its own query/mutation are exercised against the DB; what
// matters here is the DECISION the card makes from each state, which is where
// a mistake sends a duplicate to a real public feed.
const recordMutate = vi.fn();
const publication = { isPublished: false, isLoading: false, isUnknown: false };
vi.mock('@/hooks/donny/useDraftPublication', () => ({
  useDraftPublication: () => publication,
  useRecordDraftPublication: () => ({ mutate: recordMutate, isPending: false }),
}));

const DATA = {
  draft_id: '11111111-2222-3333-4444-555555555555',
  account_label: '@areyouaman · Instagram',
  account_id: 'LEnjV',
  platform: 'instagram',
  caption: 'Taco Tuesday is back',
  media_urls: [] as string[],
  scheduled_at: null as string | null,
};

beforeEach(() => {
  mutate.mockReset();
  recordMutate.mockReset();
  publication.isPublished = false;
  publication.isLoading = false;
  publication.isUnknown = false;
});

describe('SocialDraftCard', () => {
  it('shows the account by handle and platform', () => {
    render(<SocialDraftCard data={DATA} />);
    expect(screen.getByText('@areyouaman · Instagram')).toBeInTheDocument();
  });

  it('never renders the account id', () => {
    const { container } = render(<SocialDraftCard data={DATA} />);
    expect(container.textContent).not.toContain('LEnjV');
  });

  it('shows the caption exactly as it will post', () => {
    render(<SocialDraftCard data={DATA} />);
    expect(screen.getByText('Taco Tuesday is back')).toBeInTheDocument();
  });

  it('publishes on the tap, with the resolved account', () => {
    render(<SocialDraftCard data={DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /post it/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({
      caption: 'Taco Tuesday is back',
      accountIds: ['LEnjV'],
      mediaUrls: [],
    });
  });

  it('does not publish until the tap', () => {
    render(<SocialDraftCard data={DATA} />);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('forwards the scheduled time when the draft carries one', () => {
    const when = '2026-08-20T15:00:00.000Z';
    render(<SocialDraftCard data={{ ...DATA, scheduled_at: when }} />);
    fireEvent.click(screen.getByRole('button', { name: /schedule it/i }));
    expect(mutate.mock.calls[0][0]).toMatchObject({ scheduledAt: when });
  });

  it('labels the action for scheduling when scheduled', () => {
    render(<SocialDraftCard data={{ ...DATA, scheduled_at: '2026-08-20T15:00:00.000Z' }} />);
    expect(screen.getByRole('button', { name: /schedule it/i })).toBeInTheDocument();
  });

  it('cannot be double-submitted', () => {
    render(<SocialDraftCard data={DATA} />);
    const btn = screen.getByRole('button', { name: /post it/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('re-enables the button after a failed publish so the user can retry', () => {
    // The mutation itself fails synchronously and invokes the per-call
    // onError the component must now pass. Against the old code (which set
    // `submitted` true and never cleared it) the button stays stuck on
    // "Sending…" forever here.
    mutate.mockImplementation((_vars, opts) => {
      opts?.onError?.(new Error('upstream_error'));
    });
    render(<SocialDraftCard data={DATA} />);
    const btn = screen.getByRole('button', { name: /post it/i });
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /post it/i })).not.toBeDisabled();
  });

  it('allows a retry tap to call mutate again after a failed publish', () => {
    mutate.mockImplementation((_vars, opts) => {
      opts?.onError?.(new Error('upstream_error'));
    });
    render(<SocialDraftCard data={DATA} />);
    const btn = screen.getByRole('button', { name: /post it/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(2);
  });
});

// CT-4b. The card is persisted into donny_messages.rich_cards and re-rendered
// on every conversation load, so component state cannot answer "did this
// already go out". Every state short of a definite "not published" must fail
// CLOSED — this is the one card whose action cannot be undone.
describe('SocialDraftCard once-only guard', () => {
  it('will not re-arm on a draft that was already published', () => {
    publication.isPublished = true;
    render(<SocialDraftCard data={DATA} />);
    const btn = screen.getByRole('button', { name: /posted/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('says Scheduled, not Posted, for a scheduled draft already sent', () => {
    publication.isPublished = true;
    render(<SocialDraftCard data={{ ...DATA, scheduled_at: '2026-08-20T15:00:00.000Z' }} />);
    expect(screen.getByRole('button', { name: /scheduled/i })).toBeDisabled();
  });

  it('stays closed while the lookup is still in flight', () => {
    // "Not loaded yet" must never read as "safe to send".
    publication.isLoading = true;
    render(<SocialDraftCard data={DATA} />);
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled();
  });

  it('refuses, and explains, when it cannot tell whether the draft went out', () => {
    publication.isUnknown = true;
    render(<SocialDraftCard data={DATA} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText(/can't confirm whether it already went out/i)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('refuses a card with no draft id — it cannot be proven unpublished', () => {
    // Not reachable today (the draft mechanism and the id ship together), but
    // an id-less card is malformed, and the safe reading of a malformed
    // irreversible action is "do not".
    const { draft_id: _omitted, ...rest } = DATA;
    render(<SocialDraftCard data={rest as typeof DATA} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('records the publication only AFTER the post is out', () => {
    // Ordering is the invariant: "row exists => it went out". A pre-claim would
    // leave a draft marked published that never posted — permanently
    // un-postable, with nothing on the feed to explain why.
    mutate.mockImplementation((_vars, opts) => {
      expect(recordMutate).not.toHaveBeenCalled();
      opts?.onSuccess?.({});
    });
    render(<SocialDraftCard data={DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /post it/i }));
    expect(recordMutate).toHaveBeenCalledTimes(1);
    expect(recordMutate.mock.calls[0][0]).toBe(DATA.draft_id);
  });

  it('does not record a publication that failed', () => {
    mutate.mockImplementation((_vars, opts) => opts?.onError?.(new Error('nope')));
    render(<SocialDraftCard data={DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /post it/i }));
    expect(recordMutate).not.toHaveBeenCalled();
  });

  it('keeps the button down when the post succeeded but the marker write failed', () => {
    // The post IS live. A bookkeeping failure must not re-arm the button or
    // suggest to the user that anything needs retrying.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mutate.mockImplementation((_vars, opts) => opts?.onSuccess?.({}));
    recordMutate.mockImplementation((_id, opts) => opts?.onError?.(new Error('db down')));
    render(<SocialDraftCard data={DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /sending|post it/i }));
    expect(screen.getByRole('button')).toBeDisabled();
    expect(mutate).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
