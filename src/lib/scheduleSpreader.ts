// src/lib/scheduleSpreader.ts

interface PlanSlot {
  platform: string;
  content_type: string;
  day_offset: number;
}

type TimeRules = Record<string, Array<[number, number, number]>>;
type FallbackTimes = Array<[number, number, number]>;

function pickScheduledTime(
  platform: string,
  contentType: string,
  dayOffset: number,
  baseDate: Date,
  _timezone: string,
  timeRules: TimeRules,
  fallbackTimes: FallbackTimes,
): string {
  const key = `${platform}:${contentType}`;
  const rules = timeRules[key] ?? timeRules[`${platform}:photo`] ?? fallbackTimes;

  const targetDate = new Date(baseDate);
  targetDate.setDate(targetDate.getDate() + dayOffset);

  const targetDow = targetDate.getDay();
  let bestRule = rules.find(([dow]) => dow === targetDow);
  if (!bestRule) {
    for (let i = 1; i <= 7; i++) {
      const checkDow = (targetDow + i) % 7;
      bestRule = rules.find(([dow]) => dow === checkDow);
      if (bestRule) {
        targetDate.setDate(targetDate.getDate() + i);
        break;
      }
    }
  }
  if (!bestRule) bestRule = fallbackTimes[0];

  const [, hourStart, hourEnd] = bestRule;
  const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
  const minute = Math.floor(Math.random() * 4) * 15;

  targetDate.setHours(hour, minute, 0, 0);
  return targetDate.toISOString();
}

export function findNextAvailableDay(
  slot: PlanSlot,
  collidingDate: Date,
  occupiedDays: Set<string>,
  _timezone: string,
  timeRules: TimeRules,
  fallbackTimes: FallbackTimes,
): string {
  const key = `${slot.platform}:${slot.content_type}`;
  const rules = timeRules[key] ?? timeRules[`${slot.platform}:photo`] ?? fallbackTimes;

  for (let i = 1; i <= 14; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    const dow = candidate.getDay();
    const rule = rules.find(([d]) => d === dow);
    if (rule && !occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = rule;
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  for (let i = 1; i <= 30; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    if (!occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = fallbackTimes[0];
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  const fallback = new Date(collidingDate);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(12, 0, 0, 0);
  return fallback.toISOString();
}

export function spreadScheduledTimes(
  slots: PlanSlot[],
  baseDate: Date,
  timezone: string,
  timeRules: TimeRules,
  fallbackTimes: FallbackTimes,
): string[] {
  if (slots.length === 0) return [];

  const candidates = slots.map((slot, i) => ({
    index: i,
    time: pickScheduledTime(
      slot.platform, slot.content_type, slot.day_offset,
      baseDate, timezone, timeRules, fallbackTimes,
    ),
  }));

  candidates.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const occupiedDays = new Set<string>();
  for (const candidate of candidates) {
    const candidateDay = new Date(candidate.time).toDateString();
    if (occupiedDays.has(candidateDay)) {
      candidate.time = findNextAvailableDay(
        slots[candidate.index],
        new Date(candidate.time),
        occupiedDays,
        timezone,
        timeRules,
        fallbackTimes,
      );
    }
    occupiedDays.add(new Date(candidate.time).toDateString());
  }

  const result = new Array<string>(slots.length);
  for (const candidate of candidates) {
    result[candidate.index] = candidate.time;
  }
  return result;
}
