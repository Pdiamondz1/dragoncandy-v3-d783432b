import type { DonnyStage } from '@/types/donnyNudge';

export type DonnyStageAction =
  | 'open'
  | 'expand'
  | 'collapse'
  | 'close'
  | 'inline'
  | 'exitInline';

/**
 * The whole stage rulebook, in one pure function.
 *
 * 'inline' is the dashboard's own Donny surface. While it holds, the panel
 * actions are inert: a docked panel must never open over an inline thread, and
 * close() must never tear down the surface the user is reading. Only the canvas
 * unmounting (exitInline) leaves it.
 *
 * Entering inline is unconditional on purpose. The provider sits above the
 * router and nothing resets stage on navigation, so a panel opened on another
 * page is still open when the dashboard mounts. Assigning 'inline' closes it by
 * the same stroke — no separate close-on-entry rule needed.
 */
export function nextStage(current: DonnyStage, action: DonnyStageAction): DonnyStage {
  if (action === 'inline') return 'inline';
  if (action === 'exitInline') return current === 'inline' ? 'closed' : current;
  if (current === 'inline') return current;

  switch (action) {
    case 'open':
      return 'tray';
    case 'expand':
      return 'chat';
    case 'collapse':
      return 'tray';
    case 'close':
      return 'closed';
  }
}
