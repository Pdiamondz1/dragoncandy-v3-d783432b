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

  // The regression this file exists for: accentColor was accepted and ignored, so a
  // creator's teal wizard drew a pink progress bar.
  it('honours accentColor rather than always drawing pink', () => {
    const { container: teal } = render(
      <OnboardingProgress currentStep={0} totalSteps={3} accentColor="teal" />);
    expect(teal.innerHTML).toContain('bg-landing-mint');
    expect(teal.innerHTML).not.toContain('bg-landing-pink');

    const { container: pink } = render(
      <OnboardingProgress currentStep={0} totalSteps={3} accentColor="pink" />);
    expect(pink.innerHTML).toContain('bg-landing-pink');
    expect(pink.innerHTML).not.toContain('bg-landing-mint');
  });

  it('never reports a step beyond the total', () => {
    render(<OnboardingProgress currentStep={9} totalSteps={4} accentColor="pink" />);
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument();
  });
});
