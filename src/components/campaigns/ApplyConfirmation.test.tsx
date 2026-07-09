// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ApplyConfirmation } from './ApplyConfirmation';

describe('ApplyConfirmation', () => {
  it('renders nothing when closed', () => {
    render(
      <MemoryRouter>
        <ApplyConfirmation open={false} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Application Sent!')).not.toBeInTheDocument();
  });

  it('shows the confirmation and both actions when open', () => {
    render(
      <MemoryRouter>
        <ApplyConfirmation open onClose={() => {}} businessName="Testaurant" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Application Sent!')).toBeInTheDocument();
    expect(screen.getByText(/Testaurant will/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse more campaigns/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view my applications/i })).toBeInTheDocument();
  });

  // Regression: the full-screen `fixed inset-0` overlay must escape any
  // transformed ancestor (e.g. the Framer-Motion PageTransition wrapper).
  // A non-`none` transform on an ancestor makes `position: fixed` relative to
  // that ancestor instead of the viewport, so the centered confirmation landed
  // off-screen and the user had to scroll up to see it. Portaling to
  // document.body is what fixes it.
  it('portals out of a transformed ancestor', () => {
    render(
      <MemoryRouter>
        <div data-testid="transform-ancestor" style={{ transform: 'translateY(0px)' }}>
          <ApplyConfirmation open onClose={() => {}} businessName="Testaurant" />
        </div>
      </MemoryRouter>,
    );
    const ancestor = screen.getByTestId('transform-ancestor');
    const heading = screen.getByText('Application Sent!');
    expect(ancestor.contains(heading)).toBe(false);
    expect(document.body.contains(heading)).toBe(true);
  });
});
