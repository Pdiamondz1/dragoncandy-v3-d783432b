// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialDraftCard } from './SocialDraftCard';

const mutate = vi.fn();
vi.mock('@/hooks/outstand/useCrossPost', () => ({
  useCrossPost: () => ({ mutate, isPending: false }),
}));

const DATA = {
  account_label: '@areyouaman · Instagram',
  account_id: 'LEnjV',
  platform: 'instagram',
  caption: 'Taco Tuesday is back',
  media_urls: [] as string[],
  scheduled_at: null as string | null,
};

beforeEach(() => mutate.mockClear());

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
