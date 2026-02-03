

# Fix Dragon Feed Message Button

## Problem

On the Dragon Feed page (`/dashboard/business/dragon-feed`), the message button on each content card does nothing when clicked. This is because the button has no `onClick` handler.

## Root Cause

In `src/components/dragon-feed/DragonFeedCard.tsx`, the message button (lines 201-207) is missing its click handler:

```tsx
<Button
  size="sm" 
  variant="secondary"
  className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
>  {/* <-- No onClick! */}
  <MessageSquare className="h-4 w-4 text-muted-foreground" />
</Button>
```

Meanwhile, the similar component in `BusinessDashboardSideFeed.tsx` has a working `handleMessage` function that properly creates a conversation and navigates to it.

---

## Solution

Add the `handleMessage` function to `DragonFeedCard.tsx` and connect it to the message button.

---

## Implementation

### File: `src/components/dragon-feed/DragonFeedCard.tsx`

**Changes:**

1. **Add imports** for `useToast` hook:
   ```tsx
   import { useToast } from '@/hooks/use-toast';
   ```

2. **Add `toast` to the component** at the top of the component function:
   ```tsx
   const { toast } = useToast();
   ```

3. **Add the `handleMessage` function** (after `toggleLike`):
   ```tsx
   const handleMessage = async (e: React.MouseEvent) => {
     e.stopPropagation();
     
     try {
       const { data: { user } } = await supabase.auth.getUser();
       
       if (!user) {
         toast({
           title: "Authentication required",
           description: "Please log in to send messages.",
           variant: "destructive"
         });
         return;
       }

       const { data: conversationId, error } = await supabase.rpc(
         'create_or_get_direct_conversation',
         {
           user1_uuid: user.id,
           user2_uuid: media.creatorId
         }
       );

       if (error) throw error;

       toast({
         title: "Opening conversation",
         description: `Starting a conversation with ${media.creatorName}`,
       });

       const userRole = user.user_metadata?.role || 'business_client';
       const rolePrefix = userRole === 'brand' ? 'brand' : 'business';
       
       navigate(`/dashboard/${rolePrefix}/messages/direct/${conversationId}`);
     } catch (error) {
       console.error('Failed to create conversation:', error);
       toast({
         title: "Error",
         description: "Failed to start conversation. Please try again.",
         variant: "destructive"
       });
     }
   };
   ```

4. **Add onClick to the message button**:
   ```tsx
   <Button
     size="sm" 
     variant="secondary"
     className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
     onClick={handleMessage}
   >
     <MessageSquare className="h-4 w-4 text-muted-foreground" />
   </Button>
   ```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/dragon-feed/DragonFeedCard.tsx` | Add `handleMessage` function and connect to button |

---

## Expected Behavior After Fix

1. User hovers over a content card on Dragon Feed
2. Clicks the message (chat bubble) button
3. A toast appears: "Opening conversation - Starting a conversation with [Creator Name]"
4. User is navigated to `/dashboard/business/messages/direct/[conversationId]`
5. They can now message the creator directly

