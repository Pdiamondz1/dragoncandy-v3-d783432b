// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InlineRating } from './InlineRating';

describe('InlineRating', () => {
  it('shows a New pill when there are no reviews', () => {
    render(<InlineRating averageRating={0} totalReviews={0} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows New when counts are null/undefined', () => {
    render(<InlineRating />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders rating and pluralized count', () => {
    render(<InlineRating averageRating={4.75} totalReviews={12} />);
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText(/12 reviews/)).toBeInTheDocument();
  });

  it('uses the singular for one review', () => {
    render(<InlineRating averageRating={5} totalReviews={1} />);
    expect(screen.getByText(/1 review$/)).toBeInTheDocument();
  });
});
