// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stubMatchMedia } from '@/test/stubMatchMedia';
import { DonnyComposer } from './DonnyComposer';

// useIsMobile subscribes to window.matchMedia on mount; jsdom has none.
stubMatchMedia();

const onSubmit = vi.fn();
const field = () => screen.getByRole('textbox', { name: /ask donny/i });

// jsdom reports 1024, so every test below is a DESKTOP test unless it calls
// this. useIsMobile reads window.innerWidth against a 768px breakpoint.
const DESKTOP_WIDTH = window.innerWidth;
const setViewportWidth = (px: number) => {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => setViewportWidth(DESKTOP_WIDTH));

describe('DonnyComposer', () => {
  it('is a textarea, so a long prompt is visible as a whole', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    expect(field().tagName).toBe('TEXTAREA');
  });

  it('keeps the tour anchor the restaurant tour targets', () => {
    const { container } = render(<DonnyComposer onSubmit={onSubmit} />);
    expect(container.querySelector("[data-tour='brief-generator']")).toBeInTheDocument();
  });

  it('submits on Enter and clears', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'find creators near me' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('find creators near me');
    expect(field()).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter instead of submitting', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'first paragraph' } });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('first paragraph');
  });

  it('does not submit a half-composed IME word', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'ラーメ' } });
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ignores empty and whitespace-only input', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.change(field(), { target: { value: '   ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trims what it submits', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: '  hello  ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('still submits through the form, which the dashboard suites rely on', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'via form' } });
    fireEvent.submit(field().closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('via form');
  });

  it('submits the trimmed text and clears the field when the send button is clicked', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: '  click to send  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send to donny/i }));
    expect(onSubmit).toHaveBeenCalledWith('click to send');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(field()).toHaveValue('');
  });

  it('sends nothing while disabled', () => {
    render(<DonnyComposer onSubmit={onSubmit} disabled />);
    fireEvent.change(field(), { target: { value: 'while streaming' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // A disabled control never dispatches a click at all, so this cannot exercise
  // submit()'s own `if (!trimmed || disabled) return` guard — it only proves the
  // `disabled` prop reaches the button's HTML attribute. The guard itself is
  // covered by the Enter-while-disabled test above, which is non-vacuous because
  // the textarea is deliberately not disabled.
  it('disables the send button while streaming, so the browser suppresses the click', () => {
    render(<DonnyComposer onSubmit={onSubmit} disabled />);
    fireEvent.change(field(), { target: { value: 'while streaming' } });
    const button = screen.getByRole('button', { name: /send to donny/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hands its element to the provider and releases it on unmount', () => {
    const registerRef = vi.fn();
    const { unmount } = render(<DonnyComposer onSubmit={onSubmit} registerRef={registerRef} />);
    expect(registerRef).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
    unmount();
    expect(registerRef).toHaveBeenLastCalledWith(null);
  });
});

describe('DonnyComposer — Enter behaves per platform, like ChatGPT', () => {
  it('inserts a newline on mobile Enter instead of sending — a phone has no Shift key', () => {
    setViewportWidth(390);
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'first line' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('first line');
  });

  it('still sends from the button on mobile — the only submit affordance there', () => {
    setViewportWidth(390);
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'find creators near me' } });
    fireEvent.click(screen.getByRole('button', { name: /send to donny/i }));
    expect(onSubmit).toHaveBeenCalledWith('find creators near me');
    expect(field()).toHaveValue('');
  });

  // Desktop's half of this pair is the unchanged "submits on Enter and clears"
  // above, which now also proves the mobile branch did not leak upward. A
  // mobile IME test is deliberately absent: on mobile Enter returns early
  // regardless, so it could not distinguish the guard being first from it
  // being unreachable — the desktop IME test is the non-vacuous one.
});

describe('DonnyComposer — registration', () => {
  it('hands its element to the provider and releases it on unmount', () => {
    const registerRef = vi.fn();
    const { unmount } = render(<DonnyComposer onSubmit={onSubmit} registerRef={registerRef} />);
    expect(registerRef).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
    unmount();
    expect(registerRef).toHaveBeenLastCalledWith(null);
  });
});
