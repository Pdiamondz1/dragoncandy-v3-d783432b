import type { Post } from '@outstand-so/ui';

export function getWeekDates(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  start.setDate(start.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function postsForDay(posts: Post[], day: Date): Post[] {
  return posts
    .filter((p) => {
      const stamp = p.scheduledAt ?? p.publishedAt;
      if (!stamp) return false;
      return isSameDay(new Date(stamp), day);
    })
    .sort((a, b) => {
      const aTime = new Date(a.scheduledAt ?? a.publishedAt ?? 0).getTime();
      const bTime = new Date(b.scheduledAt ?? b.publishedAt ?? 0).getTime();
      return aTime - bTime;
    });
}
