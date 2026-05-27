interface ScheduleStatsRowProps {
  postCount: number;
  crossPostCount: number;
  spreadDays: number;
}

export function ScheduleStatsRow({ postCount, crossPostCount, spreadDays }: ScheduleStatsRowProps) {
  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex justify-around items-center text-center">
        <div className="flex flex-col items-center">
          <span className="text-2xl font-extrabold text-dc-text">{postCount}</span>
          <span className="text-xs text-dc-text-muted">Posts</span>
        </div>

        <div className="w-px h-10 bg-dc-pink" />

        <div className="flex flex-col items-center">
          <span className="text-2xl font-extrabold text-dc-text">{crossPostCount}</span>
          <span className="text-xs text-dc-text-muted">Cross-posts</span>
        </div>

        <div className="w-px h-10 bg-dc-pink" />

        <div className="flex flex-col items-center">
          <span className="text-2xl font-extrabold text-dc-text">{spreadDays}</span>
          <span className="text-xs text-dc-text-muted">Days</span>
        </div>
      </div>
    </div>
  );
}
