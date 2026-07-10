export type AgendaItemKind = 'post' | 'deadline';

export interface AgendaItem {
  id: string;
  date: string; // ISO
  kind: AgendaItemKind;
  title: string;
  platform?: string;
  contentType?: string;
  status?: string;
  onClick?: () => void;
}

export interface AgendaDay {
  dateKey: string;
  date: Date;
  items: AgendaItem[];
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function groupByDay(items: AgendaItem[], opts: { from?: Date } = {}): AgendaDay[] {
  const fromKeyTime = opts.from ? startOfDay(opts.from).getTime() : null;
  const buckets = new Map<string, AgendaDay>();

  for (const item of items) {
    const d = new Date(item.date);
    if (isNaN(d.getTime())) continue;
    if (fromKeyTime !== null && startOfDay(d).getTime() < fromKeyTime) continue;
    const key = dateKey(d);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { dateKey: key, date: startOfDay(d), items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(item);
  }

  const days = Array.from(buckets.values());
  days.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const day of days) {
    day.items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  return days;
}

export function relativeDayLabel(date: Date, today: Date): string {
  const k = dateKey(date);
  if (k === dateKey(today)) return 'Today';
  const tomorrow = startOfDay(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (k === dateKey(tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const CONTENT_EMOJI: Record<string, string> = {
  photo: '📸',
  video_reel: '🎬',
  carousel: '📱',
  story: '📱',
  tiktok: '🎬',
  youtube_short: '🎬',
};

export function contentTypeEmoji(contentType?: string): string {
  if (!contentType) return '📸';
  return CONTENT_EMOJI[contentType] ?? '📸';
}

export function monthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon = 0
  const totalDays = lastDay.getDate();
  const weeks: (Date | null)[][] = [];
  let current = 1 - startDow;
  for (let w = 0; w < 6; w++) {
    const week: (Date | null)[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(current >= 1 && current <= totalDays ? new Date(year, month, current) : null);
      current++;
    }
    if (week.every((d) => d === null)) break;
    weeks.push(week);
  }
  return weeks;
}
