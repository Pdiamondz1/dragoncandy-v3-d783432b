import React from 'react';
import { CalendarDays, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface ScheduledPostInfo {
  scheduledAt: string;
  platformNames: string[];
  fileCount: number;
}

interface ScheduleConfirmationProps {
  posts: ScheduledPostInfo[];
  campaignTitle: string;
  onDone: () => void;
}

function formatScheduledTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (d.toDateString() === now.toDateString()) return `Today at ${timeStr}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${dateStr} at ${timeStr}`;
  return `${dateStr} at ${timeStr}`;
}

const PLATFORM_STYLES: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-600 via-red-500 to-orange-400 text-white',
  tiktok: 'bg-black text-white',
  facebook: 'bg-[#1877F2] text-white',
  x: 'bg-gray-800 text-white',
  youtube: 'bg-red-600 text-white',
};

export const ScheduleConfirmation: React.FC<ScheduleConfirmationProps> = ({
  posts,
  campaignTitle,
  onDone,
}) => {
  const navigate = useNavigate();

  const earliestPost = posts.reduce((earliest, p) =>
    new Date(p.scheduledAt) < new Date(earliest.scheduledAt) ? p : earliest,
    posts[0],
  );

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-dc-teal mx-auto mb-2 flex items-center justify-center">
          <Check className="h-6 w-6 text-white" strokeWidth={3} />
        </div>
        <h3 className="text-sm font-bold text-dc-text">Scheduled!</h3>
        <p className="text-[11px] text-dc-text-muted mt-0.5">Your content is queued and ready to go</p>
      </div>

      <div className="space-y-2">
        {posts.map((post, index) => (
          <div key={index} className="bg-teal-50 border border-teal-200 rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <CalendarDays className="h-4 w-4 text-dc-teal flex-shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-dc-text">{formatScheduledTime(post.scheduledAt)}</p>
                <p className="text-[10px] text-dc-teal font-medium mt-0.5">Donny picked peak engagement time</p>
              </div>
            </div>

            <p className="text-xs font-semibold text-dc-text mb-1">{campaignTitle}</p>
            <p className="text-[10px] text-dc-text-muted mb-2.5">{post.fileCount} file{post.fileCount !== 1 ? 's' : ''}</p>

            <div className="flex flex-wrap gap-1.5">
              {post.platformNames.map((name) => (
                <span
                  key={name}
                  className={`text-[9px] font-semibold px-2.5 py-1 rounded-full ${
                    PLATFORM_STYLES[name.toLowerCase()] ?? 'bg-gray-600 text-white'
                  }`}
                >
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            onDone();
            navigate(`/calendar?date=${encodeURIComponent(earliestPost.scheduledAt)}`);
          }}
          className="w-full flex items-center justify-center gap-2 bg-dc-teal text-white text-sm font-bold py-3.5 rounded-full hover:bg-teal-500 transition-colors"
        >
          <CalendarDays className="h-4 w-4" />
          View on Calendar
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-full py-3 rounded-full bg-white text-dc-text-muted text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
};
