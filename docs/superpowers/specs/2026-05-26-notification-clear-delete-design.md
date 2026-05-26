# Notification Clear & Delete

## Context

The notification system currently supports marking notifications as read but has no way to remove them. Users accumulate notifications with no way to clean up their list. This adds two deletion capabilities: per-item delete (trash icon) and bulk clear-by-category.

## Approach

Hard delete — rows are permanently removed from `push_notifications`. No soft-delete column needed, keeping the schema simple. Confirmation dialog on bulk clear to prevent accidental mass deletion; individual deletes are instant.

## Changes

### 1. Supabase Migration — DELETE RLS Policy

Add a DELETE policy to `push_notifications` so users can delete their own notifications:

```sql
CREATE POLICY "Users can delete their own notifications"
  ON public.push_notifications FOR DELETE
  USING (user_id = auth.uid());
```

This mirrors the existing SELECT and UPDATE policies.

### 2. Hooks — `useNotificationQueries.ts`

**`useDeleteNotification()`** — Deletes a single notification by ID. On success, invalidates query keys: `notifications`, `notification-unread-count`, `notification-unread-by-category`.

**`useClearNotificationsByCategory(category?: string)`** — Deletes all notifications matching a category for the current user. The `.delete()` call includes `.eq('user_id', user.id)` (matching the pattern in `useMarkAllNotificationsRead`). If no category (or "all"), deletes all notifications for the user. On success, invalidates the same three query keys.

Both use the existing Supabase client with `.delete()` on `push_notifications`. No optimistic updates — consistent with existing mutation patterns. The brief flash before invalidation completes is acceptable.

### 3. NotificationItem — Trash Icon

Add a `Trash2` icon (lucide-react) to each notification item with an `onDelete` callback prop:

- **Desktop**: Hidden by default, appears on hover via `opacity-0 group-hover:opacity-100 transition-opacity`
- **Mobile**: Always visible, smaller (`h-4 w-4`), muted color
- Click handler calls `e.stopPropagation()` to prevent navigation, then calls `onDelete(id)`
- Rendered as a `<button>` with `aria-label="Delete notification"` for screen-reader accessibility
- Positioned on the right side of the notification, vertically centered
- Hidden when `compact={true}` (dropdown mode) to keep the quick-peek dropdown clean

### 4. NotificationsPage — Clear Button

Add a "Clear" button in the header row, next to "Mark all read":

- Label: "Clear" (with `Trash2` icon)
- Context-aware: uses the active category tab to determine scope
- On click, shows a shadcn `AlertDialog`:
  - Title: "Clear notifications?"
  - Description: "This will permanently delete {count} {category} notifications." (or "all notifications" when on the All tab)
  - Actions: Cancel (outline) / Clear (destructive)
- On confirm, calls `useClearNotificationsByCategory` with the active category
- Button is disabled when there are no notifications to clear

### 5. Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/XXXXXX_notification_delete_policy.sql` | New — DELETE RLS policy |
| `src/hooks/useNotificationQueries.ts` | Add `useDeleteNotification`, `useClearNotificationsByCategory` |
| `src/hooks/useNotifications.ts` | Add `.on('postgres_changes', { event: 'DELETE', ... })` handler to Realtime subscription |
| `src/components/notifications/NotificationItem.tsx` | Add trash icon, `onDelete` prop, hide in compact mode |
| `src/pages/NotificationsPage.tsx` | Add Clear button, confirmation dialog, wire delete handlers |

### 6. Desktop vs Mobile

- Desktop: trash icon hover-reveal, Clear button in header
- Mobile: trash icon always visible (smaller), Clear button in header (same behavior)
- No mobile-specific or desktop-specific layout changes beyond the hover/visible toggle on the trash icon

## Verification

1. `npm run build` — no type errors
2. `npm run typecheck` — strict mode passes
3. Apply migration to Supabase
4. Browser test (all 3 roles):
   - Delete individual notification → disappears, count updates
   - Clear by category → confirmation dialog → notifications removed
   - Clear on "All" tab → confirmation → all notifications removed
   - Verify notification count in header bell updates after deletion
5. Check Chrome DevTools for console errors
6. Test both desktop (hover reveal) and mobile (always visible) viewports
