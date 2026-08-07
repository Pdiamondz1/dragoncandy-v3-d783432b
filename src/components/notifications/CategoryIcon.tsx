import { cn } from '@/lib/utils';
import donnyEmblem from '@/assets/donny-emblem.webp';
import { CATEGORY_META, type NotificationCategory } from '@/types/notifications';

interface CategoryIconProps {
  category: NotificationCategory | 'legacy';
  /** Applied to the Donny emblem <img> (the DragonShare category). */
  imgClassName?: string;
  /** Applied to the emoji <span> (every other category). */
  emojiClassName?: string;
}

/**
 * Renders a notification category's icon. DragonShare's mark is the Donny
 * emblem (an image, not an emoji), so it renders that; every other category
 * renders its emoji from CATEGORY_META.
 */
export function CategoryIcon({ category, imgClassName, emojiClassName }: CategoryIconProps) {
  if (category === 'dragonshare') {
    return (
      <img
        src={donnyEmblem}
        alt="DragonShare"
        className={cn('rounded-full object-cover scale-[1.35]', imgClassName)}
      />
    );
  }

  const emoji =
    category !== 'legacy' && CATEGORY_META[category as NotificationCategory]
      ? CATEGORY_META[category as NotificationCategory].icon
      : '🔔';

  return (
    <span role="img" aria-hidden="true" className={emojiClassName}>
      {emoji}
    </span>
  );
}
