

# Fix "Message Restaurant" Button on Brand Sponsorships Page

## Problem

The "Message Restaurant" button on the Brand Sponsorships page (`/dashboard/brand/sponsorships`) navigates to the general messages list (`/dashboard/brand/messages`) instead of opening a direct conversation with the restaurant owner.

## Root Cause

In `src/pages/BrandSponsorships.tsx` (line 175), the button simply navigates to the messages list:

```tsx
onClick={() => navigate(`/dashboard/brand/messages`)}
```

It needs to create or retrieve a direct conversation with the restaurant's user and navigate directly to that conversation.

## Solution

Replace the generic navigation with a `handleMessageRestaurant` function that:
1. Gets the current user
2. Uses the restaurant's `user_id` (already available via `sponsorship.restaurant_profile`)
3. Calls the `create_or_get_direct_conversation` RPC
4. Navigates to `/dashboard/brand/messages/direct/{conversationId}`

## Implementation

### File: `src/pages/BrandSponsorships.tsx`

1. **Add imports**: `supabase` client and `useToast`
2. **Add `handleMessageRestaurant` function**:

```tsx
const handleMessageRestaurant = async (sponsorship: BrandSponsorship) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const restaurantUserId = sponsorship.restaurant_profile?.user_id;
    if (!restaurantUserId) return;

    const { data: conversationId, error } = await supabase.rpc(
      'create_or_get_direct_conversation',
      { user1_uuid: user.id, user2_uuid: restaurantUserId }
    );
    if (error) throw error;

    navigate(`/dashboard/brand/messages/direct/${conversationId}`);
  } catch (error) {
    toast({ title: "Error", description: "Failed to start conversation.", variant: "destructive" });
  }
};
```

3. **Update button onClick**:
```tsx
onClick={() => handleMessageRestaurant(sponsorship)}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/BrandSponsorships.tsx` | Add direct conversation logic to "Message Restaurant" button |

