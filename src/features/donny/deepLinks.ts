/**
 * TASK-024: Donny deep-link handler.
 *
 * Parses "open help: <slug>" patterns in Donny messages and dispatches
 * a custom event that the HelpBriefDrawer listens for.
 *
 * Usage:
 *   import { parseAndDispatchDeepLink } from '@/features/donny/deepLinks';
 *   parseAndDispatchDeepLink(messageContent); // returns true if a link was found
 */

const HELP_PATTERN = /open help:\s*([a-z0-9-]+)/i;

export interface HelpDeepLinkEvent {
  slug: string;
}

/**
 * Attempt to parse a deep link from Donny message text.
 * Returns the slug if found, null otherwise.
 */
export function parseHelpDeepLink(text: string): string | null {
  const match = text.match(HELP_PATTERN);
  return match ? match[1] : null;
}

/**
 * Parse and dispatch — convenience wrapper.
 * Returns true if a deep link was detected and dispatched.
 */
export function parseAndDispatchDeepLink(text: string): boolean {
  const slug = parseHelpDeepLink(text);
  if (!slug) return false;

  window.dispatchEvent(
    new CustomEvent<HelpDeepLinkEvent>('donny-help-deep-link', {
      detail: { slug },
    })
  );
  return true;
}
