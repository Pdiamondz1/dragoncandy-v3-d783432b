// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddressStep } from './AddressStep';

const base = {
  address: '123 Washington St, Hoboken, NJ 07030',
  onAddressChange: vi.fn(),
  onSave: vi.fn(),
  saving: false,
  verified: false,
  pending: false,
};

describe('AddressStep', () => {
  it('lets a valid address be confirmed once the location is known', () => {
    render(<AddressStep {...base} />);
    expect(screen.getByRole('button', { name: /confirm address/i })).toBeEnabled();
  });

  /**
   * A brand-new business gets its location from a trigger during the core save, so the
   * row is legitimately a moment behind. Someone who taps through the phone slide fast
   * arrives here first, and letting them press Confirm produced "we could not find your
   * location" for a location that exists and was on its way.
   */
  it('holds the button while the location is still being fetched', () => {
    render(<AddressStep {...base} locationLoading />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/setting up your location/i);
  });

  /**
   * A failed lookup is not a slow one. Folded together, the button stayed disabled
   * forever under "Setting up your location" while nothing was in fact happening.
   */
  it('says the lookup failed rather than claiming it is still setting up', () => {
    render(<AddressStep {...base} locationError />);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load your location/i);
    expect(screen.queryByText(/setting up your location/i)).not.toBeInTheDocument();
  });

  it('names the way out, since this slide is skippable', () => {
    render(<AddressStep {...base} locationError />);
    expect(screen.getByRole('alert')).toHaveTextContent(/skip/i);
  });

  it('prefers the failure message when both flags somehow arrive together', () => {
    render(<AddressStep {...base} locationLoading locationError />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/setting up your location/i)).not.toBeInTheDocument();
  });

  it('still refuses an address too short to be one', () => {
    render(<AddressStep {...base} address="12" />);
    expect(screen.getByRole('button', { name: /confirm address/i })).toBeDisabled();
  });

  it('says saved-but-unchecked rather than reporting it as confirmed', () => {
    render(<AddressStep {...base} pending />);
    expect(screen.getByRole('status')).toHaveTextContent(/checking the address/i);
    expect(screen.queryByText(/address confirmed/i)).not.toBeInTheDocument();
  });

  it('reports confirmed only when the server stamp says so', () => {
    render(<AddressStep {...base} verified />);
    expect(screen.getByText(/address confirmed/i)).toBeInTheDocument();
  });
});
