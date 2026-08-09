import { describe, it, expect } from 'vitest';
import { nextStage } from './donnyStage';
import type { DonnyStage } from '@/types/donnyNudge';

const PANEL_ACTIONS = ['open', 'expand', 'collapse', 'close'] as const;

describe('nextStage — panel behaviour is unchanged', () => {
  it('opens the tray from closed', () => {
    expect(nextStage('closed', 'open')).toBe('tray');
  });

  it('expands the tray to chat and collapses back', () => {
    expect(nextStage('tray', 'expand')).toBe('chat');
    expect(nextStage('chat', 'collapse')).toBe('tray');
  });

  it('closes from either panel stage', () => {
    expect(nextStage('tray', 'close')).toBe('closed');
    expect(nextStage('chat', 'close')).toBe('closed');
  });
});

describe('nextStage — inline', () => {
  it('enters inline from every stage, so mounting the canvas closes an open panel', () => {
    const stages: DonnyStage[] = ['closed', 'tray', 'chat', 'inline'];
    for (const from of stages) {
      expect(nextStage(from, 'inline')).toBe('inline');
    }
  });

  it('makes every panel action inert while inline', () => {
    for (const action of PANEL_ACTIONS) {
      expect(nextStage('inline', action)).toBe('inline');
    }
  });

  it('leaves inline only via exitInline, which lands closed', () => {
    expect(nextStage('inline', 'exitInline')).toBe('closed');
  });

  it('ignores exitInline when not inline, so a stray unmount cannot close the panel', () => {
    expect(nextStage('tray', 'exitInline')).toBe('tray');
    expect(nextStage('chat', 'exitInline')).toBe('chat');
    expect(nextStage('closed', 'exitInline')).toBe('closed');
  });
});
