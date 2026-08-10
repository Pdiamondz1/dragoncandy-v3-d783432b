// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { stubMatchMedia } from '@/test/stubMatchMedia';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { BUSINESS_SUGGESTIONS } from '@/lib/donny/donnyHomeSuggestions';

// useIsMobile subscribes to window.matchMedia on mount; jsdom has none.
stubMatchMedia();

const noop = () => {};

// jsdom reports 1024, so every test is a DESKTOP test unless it calls this.
// useIsMobile reads window.innerWidth against a 768px breakpoint.
const DESKTOP_WIDTH = window.innerWidth;
const setViewportWidth = (px: number) => {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
};
afterEach(() => setViewportWidth(DESKTOP_WIDTH));

const field = () => screen.getByRole('textbox', { name: /ask donny/i });
const sendButton = () => screen.getByRole('button', { name: /send to donny/i });

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

describe('DonnyHomePrompt — composing a multi-line prompt', () => {
  it('is a textarea, so a long prompt is visible as a whole', () => {
    // The founder saw the end of their own sentence scroll out of a one-line
    // pill. A `<textarea>` is the whole fix for "it doesn't display the entire
    // prompt as a whole"; the auto-grow below is what makes it useful.
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
    );
    expect(field().tagName).toBe('TEXTAREA');
  });

  it('submits on Enter and clears', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    fireEvent.change(field(), { target: { value: 'find creators near me' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('find creators near me');
    expect(field()).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter instead of submitting', () => {
    // "You cannot press Enter without submitting the prompt (therefore not
    // allowing you to paragraph your prompts)" — pinned directly.
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    fireEvent.change(field(), { target: { value: 'first paragraph' } });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('first paragraph');
  });

  it('does not submit a half-composed IME word', () => {
    // The guard must be the FIRST statement of the key handler: a Japanese or
    // Chinese IME uses Enter to confirm a candidate, and this is a desktop
    // render, so every other branch below would otherwise send the fragment.
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    fireEvent.change(field(), { target: { value: 'ラーメ' } });
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the trimmed text and clears when the send button is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    fireEvent.change(field(), { target: { value: '  click to send  ' } });
    fireEvent.click(sendButton());
    expect(onSubmit).toHaveBeenCalledWith('click to send');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(field()).toHaveValue('');
  });

  it('grows with the text and stops at the cap, scrolling inside after that', () => {
    // jsdom performs no layout, so scrollHeight is always 0 and the cap can
    // never be reached by typing. Stubbing the measurement is what makes this a
    // test of the clamp rather than of jsdom.
    const scrollHeight = { value: 64 };
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight.value,
    });
    try {
      const { rerender } = render(
        <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
      );
      fireEvent.change(field(), { target: { value: 'two\nlines' } });
      expect(field().style.height).toBe('64px');

      scrollHeight.value = 900;
      fireEvent.change(field(), { target: { value: 'a very tall prompt' } });
      rerender(
        <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
      );
      expect(field().style.height).toBe('200px');
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original);
    }
  });
});

describe('DonnyHomePrompt — Enter behaves per platform, like ChatGPT', () => {
  it('inserts a newline on mobile Enter instead of sending — a phone has no Shift key', () => {
    setViewportWidth(390);
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    fireEvent.change(field(), { target: { value: 'first line' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('first line');
  });

  it('still sends from the button on mobile — the only submit affordance there', () => {
    setViewportWidth(390);
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={onSubmit} onSuggestionTap={noop} />
    );
    fireEvent.change(field(), { target: { value: 'find creators near me' } });
    fireEvent.click(sendButton());
    expect(onSubmit).toHaveBeenCalledWith('find creators near me');
    expect(field()).toHaveValue('');
  });

  // Desktop's half of this pair is "submits on Enter and clears" above, which
  // also proves the mobile branch did not leak upward. A mobile IME test is
  // deliberately absent: on mobile Enter returns early regardless, so it could
  // not distinguish the guard being first from it being unreachable — the
  // desktop IME test is the non-vacuous one.
});

// Founder, on prod: "there a border around prompt input which is unneccessary."
//
// EVERY assertion in this block is a CLASS-VALUE PIN, not a behavioural proof.
// jsdom loads no CSS and computes no styles, so nothing here can observe a
// border, a ring or a colour. What they pin is the small set of values that
// produced the founder's double border, so a future edit cannot quietly restore
// them. The behavioural guarantee for this component is the 14 tests above,
// which are unchanged by the restyle — that is the evidence nothing broke.
describe('DonnyHomePrompt — one quiet outline, not three', () => {
  const composer = () => field().closest('form')!;
  const classesOf = (el: Element) => el.className.split(/\s+/).filter(Boolean);

  it('wears a hairline on white, not a 2px teal slab over a teal fill', () => {
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
    );
    const classes = classesOf(composer());
    // The documented light-app card treatment, docs/DESIGN_SYSTEM.md.
    expect(classes).toContain('border');
    expect(classes).toContain('border-dc-teal/20');
    expect(classes).toContain('bg-white');
    expect(classes).not.toContain('border-2');
    expect(classes).not.toContain('bg-dc-teal/[0.06]');
  });

  it('signals focus exactly once', () => {
    // It used to change the border colour AND add a ring, while the textarea
    // painted an outline of its own — three signals for one state.
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
    );
    const focusTreatments = classesOf(composer()).filter((c) => c.startsWith('focus-within:'));
    expect(focusTreatments).toEqual(['focus-within:border-dc-teal-btn']);
  });

  it('stops the textarea painting its own outline inside the wrapper', () => {
    // src/index.css has a global `*:focus-visible { ring-2 ring-ring
    // ring-offset-2 }` in @layer base. A Tailwind ring is a BOX-SHADOW, so
    // `focus:outline-none` never touched it — and ring-0 without
    // ring-offset-0 still paints, because the ring shadow is drawn at
    // calc(width + offset). Both are load-bearing.
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
    );
    const classes = classesOf(field());
    expect(classes).toContain('focus:outline-none');
    expect(classes).toContain('focus-visible:ring-0');
    expect(classes).toContain('focus-visible:ring-offset-0');
  });

  it('never reaches for gray', () => {
    // docs/DESIGN_SYSTEM.md: never gray surfaces or borders — teal, pink and
    // warm neutrals only. "Quieter" is the one instruction that most invites a
    // gray, so pin it.
    render(
      <DonnyHomePrompt suggestions={BUSINESS_SUGGESTIONS} onSubmit={noop} onSuggestionTap={noop} />
    );
    for (const cls of classesOf(composer())) {
      expect(cls).not.toMatch(/(bg|border|ring)-(gray|slate|zinc|neutral|stone)/);
    }
  });
});

describe('DonnyHomePrompt — while Donny is answering', () => {
  it('leaves the field editable so a follow-up can be composed mid-reply', () => {
    // Founder decision, matching ChatGPT: `busy` disables the SEND BUTTON only.
    // Disabling the textarea would freeze the owner out of the box for the whole
    // length of an answer.
    render(
      <DonnyHomePrompt
        suggestions={BUSINESS_SUGGESTIONS}
        onSubmit={noop}
        onSuggestionTap={noop}
        busy
      />
    );
    expect(field()).not.toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });

  it('sends nothing on Enter while busy, and keeps what was typed', () => {
    // The button being disabled is not enough — Enter never touches the button.
    // Clearing the box for a send that will not happen is how a follow-up
    // disappears, so the text surviving is the assertion that matters.
    const onSubmit = vi.fn();
    render(
      <DonnyHomePrompt
        suggestions={BUSINESS_SUGGESTIONS}
        onSubmit={onSubmit}
        onSuggestionTap={noop}
        busy
      />
    );
    fireEvent.change(field(), { target: { value: 'and what about TikTok?' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('and what about TikTok?');
  });
});
