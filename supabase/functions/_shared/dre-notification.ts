// Pure title/body builder for the dragon_points_award bell. No `https://` imports
// so Vitest can load it in the frontend test run.
import { getDragonEvent } from './dre-events.ts';

export interface AwardEvent {
  eventType: string;
  points: number;
}

/**
 * The bell used to say only "+N DC Points", which told the user nothing about
 * what they had done. It now names the action(s) the run is paying for.
 */
export function buildAwardNotification(
  events: AwardEvent[],
  tieredUp: boolean,
): { title: string; body: string } {
  const total = events.reduce((sum, e) => sum + e.points, 0);
  const labels = events.map((e) => getDragonEvent(e.eventType).label);

  const title = events.length === 0
    ? 'You earned DC Points'
    : `You earned ${total.toLocaleString('en-US')} DC Points`;

  let body: string;
  if (labels.length === 0) body = 'Open DC Points to see how you earned them';
  else if (labels.length === 1) body = labels[0];
  else if (labels.length === 2) body = `${labels[0]} and ${labels[1]}`;
  else body = `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;

  if (tieredUp) body += ' — new standing unlocked';
  return { title, body };
}
