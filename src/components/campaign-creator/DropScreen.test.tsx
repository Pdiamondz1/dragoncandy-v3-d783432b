// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DropScreen } from './DropScreen';

// The strips pull their own data (supabase/queries); only the input
// precedence logic is under test here.
vi.mock('./DonnyGreeting', () => ({ DonnyGreeting: () => null }));
vi.mock('./TemplateStrip', () => ({ TemplateStrip: () => null }));
vi.mock('./InspirationStrip', () => ({ InspirationStrip: () => null }));
vi.mock('./SamplePromptCarousel', () => ({
  SamplePromptCarousel: ({ onSelect }: { onSelect: (v: string) => void }) => (
    <button type="button" onClick={() => onSelect('carousel sample prompt')}>
      pick sample
    </button>
  ),
}));

function getTextarea(): HTMLTextAreaElement {
  return document.querySelector('textarea') as HTMLTextAreaElement;
}

describe('DropScreen input precedence', () => {
  it('seeds the input from a Donny brief prefill', () => {
    render(
      <DropScreen
        onSubmit={() => {}}
        isExtracting={false}
        extractionMessages={[]}
        prefillValue="fish and chips launch"
      />,
    );
    expect(getTextarea()).toHaveValue('fish and chips launch');
  });

  // Regression (Codex P2): a previously selected carousel prompt must not
  // outrank a later Donny ?brief= handoff — a failed handoff would otherwise
  // retry the stale carousel text.
  it('a new Donny brief supersedes a previously selected carousel prompt', () => {
    const { rerender } = render(
      <DropScreen onSubmit={() => {}} isExtracting={false} extractionMessages={[]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick sample' }));
    expect(getTextarea()).toHaveValue('carousel sample prompt');

    rerender(
      <DropScreen
        onSubmit={() => {}}
        isExtracting={false}
        extractionMessages={[]}
        prefillValue="fish and chips launch"
      />,
    );
    expect(getTextarea()).toHaveValue('fish and chips launch');
  });

  it('a carousel pick after a brief still wins (last writer)', () => {
    render(
      <DropScreen
        onSubmit={() => {}}
        isExtracting={false}
        extractionMessages={[]}
        prefillValue="fish and chips launch"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'pick sample' }));
    expect(getTextarea()).toHaveValue('carousel sample prompt');
  });
});
