import { cn } from '@/lib/utils';

interface TimelineEntry {
  date: string;
  contentType: string;
  status: string;
}

interface ScheduleTimelineProps {
  entries: TimelineEntry[];
  spreadWindowDays: number;
}

const CONTENT_EMOJI: Record<string, string> = {
  photo: '📸',
  video_reel: '🎬',
  carousel: '📱',
  story: '📱',
  tiktok: '🎬',
  youtube_short: '🎬',
};

function getEmojiForType(contentType: string): string {
  return CONTENT_EMOJI[contentType] ?? '📸';
}

function parseDateUTC(iso: string): Date {
  return new Date(iso);
}

function formatDayLabel(date: Date): { dayName: string; dayNum: string } {
  return {
    dayName: date.toLocaleDateString(undefined, { weekday: 'short' }),
    dayNum: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

export function ScheduleTimeline({ entries, spreadWindowDays }: ScheduleTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-4 text-center text-xs text-dc-text-muted">
        No posts scheduled yet.
      </div>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const windowMs = Math.max(spreadWindowDays, 1) * 24 * 60 * 60 * 1000;
  const startTime = new Date(sorted[0].date).getTime();

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="relative">
        {/* Gradient line */}
        <div
          className="h-[3px] rounded-full w-full"
          style={{ background: 'linear-gradient(to right, #4DD9C0, #F9A8D4)' }}
        />

        {/* Dots */}
        <div className="relative" style={{ height: '72px' }}>
          {sorted.map((entry, i) => {
            const entryTime = new Date(entry.date).getTime();
            const fraction = Math.min(
              Math.max((entryTime - startTime) / windowMs, 0),
              1
            );
            const isEven = i % 2 === 0;
            const emoji = getEmojiForType(entry.contentType);
            const { dayName, dayNum } = formatDayLabel(parseDateUTC(entry.date));

            return (
              <div
                key={`${entry.date}-${i}`}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${fraction * 100}%`,
                  top: '-18px',
                  transform: 'translateX(-50%)',
                }}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-full border-2 flex items-center justify-center text-base select-none',
                    isEven
                      ? 'bg-dc-teal/15 border-dc-teal'
                      : 'bg-dc-pink/15 border-dc-pink'
                  )}
                >
                  {emoji}
                </div>
                <span className="text-[10px] font-semibold text-gray-500 mt-1 leading-none">
                  {dayName}
                </span>
                <span className="text-[10px] text-gray-400 leading-none">{dayNum}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
