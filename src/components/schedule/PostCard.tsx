import { cn } from '@/lib/utils';
import { ScheduledPost } from '@/hooks/useScheduledPosts';

interface PostCardProps {
  post: ScheduledPost;
  index: number;
  total: number;
  onEditCaption: (postId: string) => void;
  onChangeDate: (postId: string) => void;
  onCancel?: (postId: string) => void;
  isEditing?: boolean;
}

function formatScheduledDate(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

function getPlatformBadgeClass(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'instagram':
      return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white';
    case 'tiktok':
      return 'bg-black text-white';
    case 'youtube':
      return 'bg-red-600 text-white';
    case 'facebook':
      return 'bg-blue-600 text-white';
    default:
      return 'bg-gray-200 text-gray-700';
  }
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatContentTypeName(contentType: string): string {
  return contentType
    .split('_')
    .map(capitalize)
    .join(' ');
}

export function PostCard({
  post,
  index,
  total,
  onEditCaption,
  onChangeDate,
  onCancel: _onCancel,
  isEditing: _isEditing,
}: PostCardProps) {
  const isEven = index % 2 === 0;
  const isPublished = post.status === 'published';

  return (
    <div
      className={cn(
        'bg-white rounded-2xl p-4 border-l-4',
        isEven ? 'border-dc-teal' : 'border-dc-pink',
        isPublished && 'opacity-60'
      )}
    >
      {/* Top row: sequence badge + date */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            'text-[10px] font-semibold rounded-full px-2 py-0.5',
            isEven
              ? 'bg-dc-teal/10 text-dc-teal'
              : 'bg-dc-pink/10 text-dc-pink-accent'
          )}
        >
          {index + 1} of {total}
        </span>

        <div className="flex items-center gap-2">
          {isPublished && (
            <span className="text-[10px] font-semibold text-green-600 bg-green-100 rounded-full px-2 py-0.5 flex items-center gap-1">
              ✓ Published
            </span>
          )}
          <span className="text-xs text-gray-400">{formatScheduledDate(post.scheduled_at)}</span>
        </div>
      </div>

      {/* Title row: content type + platform badge */}
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm text-dc-text">
          {formatContentTypeName(post.content_type)}
        </span>
        <span
          className={cn(
            'text-[10px] font-medium rounded-full px-2 py-0.5',
            getPlatformBadgeClass(post.platform)
          )}
        >
          {capitalize(post.platform)}
        </span>
      </div>

      {/* Caption preview */}
      {post.caption && (
        <p className="text-xs text-dc-text-muted line-clamp-2 mt-1">{post.caption}</p>
      )}

      {/* Action row */}
      {!isPublished && (
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => onEditCaption(post.id)}
            className="border border-dc-teal text-dc-teal rounded-full px-3 py-1 text-xs font-medium hover:bg-dc-teal/5 transition-colors"
          >
            Edit Caption
          </button>
          <button
            type="button"
            onClick={() => onChangeDate(post.id)}
            className="border border-gray-300 text-gray-600 rounded-full px-3 py-1 text-xs font-medium hover:bg-gray-50 transition-colors"
          >
            Change Date
          </button>
        </div>
      )}
    </div>
  );
}
