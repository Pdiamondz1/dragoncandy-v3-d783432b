// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

  it('renders as a button and fires onClick when there are reviews', () => {
    const onClick = vi.fn();
    render(<InlineRating averageRating={4.8} totalReviews={12} onClick={onClick} />);
    const btn = screen.getByRole('button', { name: /view 12 reviews/i });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render a button when there are no reviews even if onClick is passed', () => {
    render(<InlineRating totalReviews={0} onClick={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });
});
