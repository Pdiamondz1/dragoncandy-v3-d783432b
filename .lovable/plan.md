
# Add Delete Campaign Button and Unlike from Inspiration Page

## Overview

Two features for restaurant users:
1. **Delete Campaign** - Allow restaurants to delete campaigns that have no assigned creators
2. **Unlike from Inspiration** - The unlike functionality already exists on the Inspiration page (I can see it in `BusinessActivity.tsx` lines 162-177), but we can improve the UX by not requiring a full page reload

---

## Feature 1: Delete Campaign Button

### Current State
- `useDeleteCampaign` hook already exists in `useCampaignMutations.ts` (lines 358-391)
- RLS policy allows users to delete their own campaigns
- Campaign card has no delete button currently

### Condition for Deletion
A campaign can only be deleted when:
- `applicationCounts.accepted === 0` (no creator assigned)

### File to Modify

**`src/components/campaigns/CampaignCard.tsx`**

### Changes

1. **Add imports**
   - Add `Trash2` icon from lucide-react
   - Add `useDeleteCampaign` hook
   - Add `AlertDialog` components for confirmation

2. **Add state for delete confirmation**
   ```tsx
   const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
   ```

3. **Get delete mutation**
   ```tsx
   const deleteCampaign = useDeleteCampaign();
   ```

4. **Add delete handler**
   ```tsx
   const handleDelete = async () => {
     await deleteCampaign.mutateAsync(campaign.id);
     setShowDeleteConfirm(false);
   };
   ```

5. **Add delete button in CardFooter** (only when no creator assigned)
   ```tsx
   {(!applicationCounts || applicationCounts.accepted === 0) && (
     <Button 
       variant="destructive" 
       size="sm" 
       className="text-xs"
       onClick={() => setShowDeleteConfirm(true)}
     >
       <Trash2 className="h-3 w-3 mr-1" />
       Delete
     </Button>
   )}
   ```

6. **Add AlertDialog for confirmation**
   ```tsx
   <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
     <AlertDialogContent>
       <AlertDialogHeader>
         <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
         <AlertDialogDescription>
           Are you sure you want to delete "{campaign.title}"? 
           This action cannot be undone.
         </AlertDialogDescription>
       </AlertDialogHeader>
       <AlertDialogFooter>
         <AlertDialogCancel>Cancel</AlertDialogCancel>
         <AlertDialogAction onClick={handleDelete}>
           Delete
         </AlertDialogAction>
       </AlertDialogFooter>
     </AlertDialogContent>
   </AlertDialog>
   ```

### Button Placement
| Scenario | Buttons Shown |
|----------|---------------|
| No applications | View Details, Delete, Edit |
| Has accepted creator | View Details, Project Status, Edit |
| Has pending but no accepted | Review Applications, Delete, Edit |

---

## Feature 2: Improve Unlike on Inspiration Page

### Current State
The unlike functionality already exists (lines 29-72 in `BusinessActivity.tsx`), but it uses `window.location.reload()` which is jarring.

### File to Modify

**`src/pages/BusinessActivity.tsx`**

### Changes

1. **Add local state management for liked items**
   ```tsx
   const [localLikedItems, setLocalLikedItems] = useState<FeedMediaItem[]>([]);
   
   useEffect(() => {
     if (likedItems) {
       setLocalLikedItems(likedItems);
     }
   }, [likedItems]);
   ```

2. **Update handleUnlike to remove item locally instead of reloading**
   ```tsx
   const handleUnlike = async (contentId: string, creatorId: string, e: React.MouseEvent) => {
     e.stopPropagation();
     setUnlikingIds(prev => new Set(prev).add(contentId));
     
     try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;

       await supabase.from('analytics_events').insert({
         event_type: 'dragon_feed_like',
         user_id: user.id,
         page_url: window.location.href,
         user_agent: navigator.userAgent,
         event_data: {
           content_id: contentId,
           creator_id: creatorId,
           action: 'unlike'
         }
       });

       // Remove item from local state (no page reload)
       setLocalLikedItems(prev => prev.filter(item => item.id !== contentId));
       
       toast({
         title: "Removed from Inspiration",
         description: "Content removed from your saved items",
       });
     } catch (err) {
       // ... error handling
     } finally {
       setUnlikingIds(prev => {
         const next = new Set(prev);
         next.delete(contentId);
         return next;
       });
     }
   };
   ```

3. **Use localLikedItems in render instead of likedItems**

---

## Technical Summary

| File | Change |
|------|--------|
| `CampaignCard.tsx` | Add Delete button with confirmation dialog |
| `BusinessActivity.tsx` | Improve unlike UX - remove page reload |

---

## Delete Button Visual

```
Before (no accepted applications):
[ View Details ]  [ Edit ]

After (no accepted applications):
[ View Details ]  [ Delete ]  [ Edit ]
```

The Delete button uses `variant="destructive"` (red) to clearly indicate its action.
