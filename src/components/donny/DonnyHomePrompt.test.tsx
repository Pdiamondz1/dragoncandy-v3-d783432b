// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { BUSINESS_SUGGESTIONS } from '@/lib/donny/donnyHomeSuggestions';

const noop = () => {};

describe('BUSINESS_SUGGESTIONS', () => {
  it('ships exactly the three taps backed by working tools', () => {
    // prepare_campaign, find_creators, web_search. Anything routing to social_*
    // is 0/7 on prod and analytics claims were already walked back once.
    expect(BUSINESS_SUGGESTIONS).toHaveLength(3);
    expect(BUSINESS_SUGGESTIONS.map((s) => s.message)).toEqual([
      'Create a campaign for my restaurant',
      'Find creators near me',
      "What's trending for restaurants near me?",
    ]);
  });

  it('never offers a stats or analytics tap', () => {
    for (const s of BUSINESS_SUGGESTIONS) {
      expect(`${s.label} ${s.message}`.toLowerCase()).not.toMatch(/stats|analytics|roi/);
    }
  });
});

describe('DonnyHomePrompt', () => {
  it('carries the tour anchor the RESTAURANT_TOUR targets', () => {
    // Replacing the body removed HeroPrimaryAction, which owned this anchor.
    // Step 2 of RESTAURANT_TOUR targets [data-tour='brief-generator'] and would
    // silently break without it.
    const { container } = render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
    );
    expect(container.querySelector("[data-tour='brief-generator']")).toBeInTheDocument();
  });

  it('submits what the owner typed and clears the box', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: 'set up a taco promo' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('set up a taco promo');
    expect(input).toHaveValue('');
  });

  it('ignores an empty or whitespace-only submit', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.submit(input.closest('form')!);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trims before submitting', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('renders one tap per suggestion and reports which was tapped', () => {
    const onSuggestionTap = vi.fn();
    render(
      <DonnyHomePrompt
        suggestions={BUSINESS_SUGGESTIONS}
        onSubmit={noop}
        onSuggestionTap={onSuggestionTap}
      />
    );
    for (const s of BUSINESS_SUGGESTIONS) {
      expect(screen.getByRole('button', { name: s.label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: BUSINESS_SUGGESTIONS[1].label }));
    expect(onSuggestionTap).toHaveBeenCalledWith(BUSINESS_SUGGESTIONS[1]);
  });
});
