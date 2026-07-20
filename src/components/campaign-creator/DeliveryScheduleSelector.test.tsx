// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliveryScheduleSelector } from './DeliveryScheduleSelector';
import { deadlineForTier } from '@/lib/deliverySchedule';

// WhyExpander is guidance chrome that reaches for auth + supabase; stub it out so this
// test stays about the selection behaviour.
vi.mock('@/components/guidance/WhyExpander', () => ({
  WhyExpander: () => null,
}));

const STANDARD_DEADLINE = deadlineForTier('standard');

function renderSelector(overrides: Partial<Parameters<typeof DeliveryScheduleSelector>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <DeliveryScheduleSelector
      deadline={STANDARD_DEADLINE}
      deliveryType="standard"
      tierReasoning=""
      onChange={onChange}
      {...overrides}
    />
  );
  return onChange;
}

const card = (name: RegExp) => screen.getByRole('button', { name });

describe('DeliveryScheduleSelector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers exactly three delivery options, each with its turnaround and fee', () => {
    renderSelector();

    expect(card(/DragonDash/)).toHaveTextContent('1–3 hours');
    expect(card(/DragonDash/)).toHaveTextContent('+$75');
    expect(card(/Express/)).toHaveTextContent('24–48 hours');
    expect(card(/Express/)).toHaveTextContent('+$25');
    expect(card(/Standard/)).toHaveTextContent('5–7 days');
    expect(card(/Standard/)).toHaveTextContent('Free');
  });

  it('highlights the saved tier', () => {
    renderSelector({ deliveryType: 'expedited' });

    expect(card(/Express/)).toHaveAttribute('aria-pressed', 'true');
    expect(card(/DragonDash/)).toHaveAttribute('aria-pressed', 'false');
    expect(card(/Standard/)).toHaveAttribute('aria-pressed', 'false');
  });

  // The whole point of the merge: one tap can never set a tier without its deadline.
  it('sets BOTH the tier and the deadline from a single tap', () => {
    const onChange = renderSelector();

    fireEvent.click(card(/DragonDash/));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      delivery_type: 'dragonrush',
      deadline: deadlineForTier('dragondash'),
    });
  });

  it('emits a matching deadline for every option', () => {
    const cases = [
      [/DragonDash/, 'dragonrush', 'dragondash'],
      [/Express/, 'expedited', 'express'],
      [/Standard/, 'standard', 'standard'],
    ] as const;

    for (const [name, dbValue, uiTier] of cases) {
      const onChange = renderSelector({ deliveryType: 'standard' });
      fireEvent.click(card(name));
      expect(onChange.mock.calls[0][0]).toMatchObject({
        delivery_type: dbValue,
        deadline: deadlineForTier(uiTier),
      });
      screen.getByText(/Deadline:/); // the summary line stays rendered
      vi.clearAllMocks();
      document.body.innerHTML = '';
    }
  });

  it('clears the AI rationale when the user lands on a different tier', () => {
    const onChange = renderSelector({
      deliveryType: 'standard',
      tierReasoning: 'Golden-hour location shooting needs a standard timeline.',
    });

    fireEvent.click(card(/DragonDash/));

    expect(onChange.mock.calls[0][0].tier_reasoning).toBe('');
  });

  it('keeps the rationale when the tier is unchanged', () => {
    const onChange = renderSelector({
      deliveryType: 'standard',
      tierReasoning: 'Golden-hour location shooting needs a standard timeline.',
    });

    fireEvent.click(card(/Standard/));

    expect(onChange.mock.calls[0][0]).not.toHaveProperty('tier_reasoning');
  });

  it('re-derives the tier from a custom date, so the two can never disagree', () => {
    const onChange = renderSelector({ deliveryType: 'standard' });

    fireEvent.click(screen.getByText('Pick a specific date'));

    const twoDaysOut = new Date();
    twoDaysOut.setHours(0, 0, 0, 0);
    twoDaysOut.setDate(twoDaysOut.getDate() + 2);
    const iso = `${twoDaysOut.getFullYear()}-${String(twoDaysOut.getMonth() + 1).padStart(2, '0')}-${String(twoDaysOut.getDate()).padStart(2, '0')}`;

    fireEvent.change(screen.getByDisplayValue(STANDARD_DEADLINE), {
      target: { value: iso },
    });

    // 2 days out is Express territory — the tier and the fee follow the date.
    expect(onChange.mock.calls[0][0]).toMatchObject({
      deadline: iso,
      delivery_type: 'expedited',
      tier_reasoning: '',
    });
  });

  it('ignores a cleared date rather than silently resetting the tier to Standard', () => {
    const onChange = renderSelector({ deliveryType: 'dragonrush' });

    fireEvent.click(screen.getByText('Pick a specific date'));
    fireEvent.change(screen.getByDisplayValue(STANDARD_DEADLINE), {
      target: { value: '' },
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
