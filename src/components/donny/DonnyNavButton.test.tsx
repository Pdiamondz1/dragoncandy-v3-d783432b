// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DonnyStage } from '@/types/donnyNudge';

const openMock = vi.fn();
const closeMock = vi.fn();
const focusInlineComposerMock = vi.fn();
const ctx = { stage: 'closed' as DonnyStage };

vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({
    stage: ctx.stage,
    open: openMock,
    close: closeMock,
    focusInlineComposer: focusInlineComposerMock,
    avatarState: 'idle',
    unreadCount: 0,
  }),
}));

import { DonnyNavButton } from './DonnyNavButton';

const tap = () => fireEvent.click(screen.getByRole('button'));

beforeEach(() => {
  vi.clearAllMocks();
  ctx.stage = 'closed';
});

describe('DonnyNavButton', () => {
  it('opens the panel when Donny is closed', () => {
    render(<DonnyNavButton />);
    tap();
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(focusInlineComposerMock).not.toHaveBeenCalled();
  });

  it('closes the panel when it is already open', () => {
    ctx.stage = 'chat';
    render(<DonnyNavButton />);
    tap();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('focuses the inline composer instead of opening a panel on the dashboard', () => {
    ctx.stage = 'inline';
    render(<DonnyNavButton />);
    tap();
    expect(focusInlineComposerMock).toHaveBeenCalledTimes(1);
    expect(openMock).not.toHaveBeenCalled();
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('keeps its tour anchor so RESTAURANT_TOUR does not orphan', () => {
    const { container } = render(<DonnyNavButton />);
    expect(container.querySelector("[data-tour='donny-help']")).toBeInTheDocument();
  });
});
