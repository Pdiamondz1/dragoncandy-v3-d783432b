// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OnboardingProgress } from './OnboardingProgress';

describe('OnboardingProgress', () => {
  it('reports position in words, not only as dots', () => {
    render(<OnboardingProgress currentStep={2} totalSteps={6} accentColor="pink" />);
    expect(screen.getByText('Step 3 of 6')).toBeInTheDocument();
  });

  /**
   * The regression this file exists for: accentColor was accepted and ignored, so a
   * creator's teal wizard drew a pink progress bar.
   *
   * Matched by REGEX, not `toContain`, and that is not fussiness. The unfilled dots are
   * `bg-dc-teal/15`, which contains the literal string `bg-dc-teal` — so under the app
   * palette a substring check passes on EVERY render, pink fill included, and this guard
   * would have gone permanently green while the bug it watches for was live. (Under the
   * old `landing-*` names the neutral was `bg-landing-line`, which shares no prefix with
   * the accents, so the substring check was safe there and stopped being safe the moment
   * the token changed.) The lookahead pins the exact class by refusing an opacity suffix.
   */
  const TEAL_FILL = /bg-dc-teal(?![\w/-])/;

  it('honours accentColor rather than always drawing pink', () => {
    const { container: teal } = render(
      <OnboardingProgress currentStep={0} totalSteps={3} accentColor="teal" />);
    expect(teal.innerHTML).toMatch(TEAL_FILL);
    expect(teal.innerHTML).not.toContain('bg-dc-pink-accent-btn');

    const { container: pink } = render(
      <OnboardingProgress currentStep={0} totalSteps={3} accentColor="pink" />);
    expect(pink.innerHTML).toContain('bg-dc-pink-accent-btn');
    expect(pink.innerHTML).not.toMatch(TEAL_FILL);
  });

  it('never reports a step beyond the total', () => {
    render(<OnboardingProgress currentStep={9} totalSteps={4} accentColor="pink" />);
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument();
  });
});
