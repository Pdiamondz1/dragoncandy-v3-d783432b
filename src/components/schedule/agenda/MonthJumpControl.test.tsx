// src/components/schedule/agenda/MonthJumpControl.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MonthJumpControl } from './MonthJumpControl';

describe('MonthJumpControl', () => {
  it('shows the anchor month on the trigger and selects a day', () => {
    const onSelect = vi.fn();
    render(
      <MonthJumpControl anchorDate={new Date(2026, 6, 10)} onSelect={onSelect} variant="desktop" />,
    );
    const trigger = screen.getByRole('button', { name: /july 2026/i });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    // day 18 is present in the opened month grid
    fireEvent.click(screen.getByRole('button', { name: '18' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const picked = onSelect.mock.calls[0][0] as Date;
    expect(picked.getDate()).toBe(18);
    expect(picked.getMonth()).toBe(6);
  });
});
